import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { UrlChecker } from '../src/domain/jobs/ports/url-checker.port';

/**
 * A deterministic, fast fake URL checker.
 *
 * - URLs containing "slow" block until `releaseSlow()` is called (used to keep
 *   work in-flight for the cancel test).
 * - URLs containing "fail" resolve with a network error.
 * - Everything else resolves immediately with HTTP 200.
 */
class FakeUrlChecker {
  private pendingSlow: Array<() => void> = [];

  async head(url: string, signal: AbortSignal) {
    if (signal.aborted) {
      return { httpStatus: null, error: 'aborted', aborted: true };
    }
    if (url.includes('slow')) {
      await new Promise<void>((resolve) => {
        const onAbort = () => resolve();
        if (signal.aborted) {
          resolve();
          return;
        }
        signal.addEventListener('abort', onAbort, { once: true });
        this.pendingSlow.push(resolve);
      });
      if (signal.aborted) {
        return { httpStatus: null, error: 'aborted', aborted: true };
      }
    }
    if (url.includes('fail')) {
      return { httpStatus: null, error: 'ENOTFOUND', aborted: false };
    }
    return { httpStatus: 200, error: null, aborted: false };
  }

  releaseSlow() {
    this.pendingSlow.forEach((r) => r());
    this.pendingSlow = [];
  }
}

// Force DELAY_MAX_MS=0 (and a deterministic concurrency) for the whole suite.
const fakeConfig = {
  get: (key: string) => {
    const values: Record<string, any> = {
      port: 0,
      maxConcurrency: 5,
      delayMaxMs: 0,
      headTimeoutMs: 1000,
      corsOrigin: '*',
      logLevel: 'info',
    };
    return values[key];
  },
};

async function poll(
  app: INestApplication,
  id: string,
  predicate: (body: any) => boolean,
  timeoutMs = 5000,
): Promise<any> {
  const start = Date.now();
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const res = await request(app.getHttpServer()).get(`/api/jobs/${id}`);
    if (res.status === 200 && predicate(res.body)) {
      return res.body;
    }
    if (Date.now() - start > timeoutMs) {
      throw new Error(
        `poll timeout for job ${id}; last status=${res.body?.status}`,
      );
    }
    await new Promise((r) => setTimeout(r, 20));
  }
}

describe('Jobs (e2e)', () => {
  let app: INestApplication;
  let fakeChecker: FakeUrlChecker;

  beforeAll(async () => {
    fakeChecker = new FakeUrlChecker();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(UrlChecker)
      .useValue(fakeChecker)
      .overrideProvider(ConfigService)
      .useValue(fakeConfig)
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
  });

  afterAll(async () => {
    fakeChecker.releaseSlow();
    await app.close();
  });

  it('POST /api/jobs with valid urls → 201 {jobId}, then completes with success/error statuses', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/jobs')
      .send({
        urls: [
          'https://example.com',
          'https://example.org',
          'https://fail.example',
        ],
      })
      .expect(201);

    expect(res.body.jobId).toBeDefined();

    const body = await poll(
      app,
      res.body.jobId,
      (b) => b.status === 'completed',
    );

    expect(body.status).toBe('completed');
    expect(body.urls).toHaveLength(3);
    expect(body.processed).toBe(3);
    expect(body.stats.success).toBe(2);
    expect(body.stats.error).toBe(1);
    for (const u of body.urls) {
      expect(['success', 'error']).toContain(u.status);
      expect(u.startedAt).not.toBeNull();
      expect(u.finishedAt).not.toBeNull();
      expect(typeof u.durationMs).toBe('number');
    }
  });

  it('dedupes urls', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/jobs')
      .send({
        urls: ['https://dup.com', 'https://dup.com', 'https://other.com'],
      })
      .expect(201);

    const body = await poll(
      app,
      res.body.jobId,
      (b) => b.status === 'completed',
    );
    expect(body.urls).toHaveLength(2);
  });

  it('POST /api/jobs with empty array → 400', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/jobs')
      .send({ urls: [] })
      .expect(400);
    expect(res.body.statusCode).toBe(400);
  });

  it('POST /api/jobs with an invalid url → 400', async () => {
    await request(app.getHttpServer())
      .post('/api/jobs')
      .send({ urls: ['not a url', 'ftp://nope.com'] })
      .expect(400);
  });

  it('POST /api/jobs with an unexpected field → 400 (whitelist)', async () => {
    await request(app.getHttpServer())
      .post('/api/jobs')
      .send({ urls: ['https://example.com'], evil: true })
      .expect(400);
  });

  it('GET /api/jobs/:id with unknown id → 404', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/jobs/00000000-0000-0000-0000-000000000000')
      .expect(404);
    expect(res.body.statusCode).toBe(404);
  });

  it('cancel flow: DELETE a job with many slow urls → job cancelled and some urls cancelled', async () => {
    const slowUrls = Array.from(
      { length: 12 },
      (_, i) => `https://slow-${i}.example`,
    );
    const created = await request(app.getHttpServer())
      .post('/api/jobs')
      .send({ urls: slowUrls })
      .expect(201);
    const id = created.body.jobId;

    // Wait until processing has actually begun (some urls in_progress).
    await poll(
      app,
      id,
      (b) => b.status === 'in_progress' && b.stats.inProgress > 0,
    );

    const del = await request(app.getHttpServer())
      .delete(`/api/jobs/${id}`)
      .expect(200);

    expect(del.body.status).toBe('cancelled');
    expect(del.body.id).toBe(id);

    // Release any held slow requests so the engine can settle.
    fakeChecker.releaseSlow();

    const final = await poll(app, id, (b) => b.status === 'cancelled');
    const cancelledCount = final.urls.filter(
      (u: any) => u.status === 'cancelled',
    ).length;
    expect(cancelledCount).toBeGreaterThan(0);
  });

  it('DELETE is idempotent on an already-cancelled job', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/jobs')
      .send({ urls: ['https://slow-x.example', 'https://slow-y.example'] })
      .expect(201);
    const id = created.body.jobId;

    await poll(app, id, (b) => b.status === 'in_progress');
    await request(app.getHttpServer()).delete(`/api/jobs/${id}`).expect(200);
    fakeChecker.releaseSlow();
    const second = await request(app.getHttpServer())
      .delete(`/api/jobs/${id}`)
      .expect(200);
    expect(second.body.status).toBe('cancelled');
  });

  it('GET /api/jobs returns summaries sorted newest-first with stats', async () => {
    const res = await request(app.getHttpServer()).get('/api/jobs').expect(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);

    for (const item of res.body) {
      expect(item).toHaveProperty('id');
      expect(item).toHaveProperty('createdAt');
      expect(item).toHaveProperty('status');
      expect(item).toHaveProperty('urlCount');
      expect(item).toHaveProperty('stats.success');
      expect(item).toHaveProperty('stats.error');
      // runtime fields must not leak
      expect(item.abortController).toBeUndefined();
      expect(item.cancelled).toBeUndefined();
    }

    const dates = res.body.map((j: any) => j.createdAt);
    const sorted = [...dates].sort((a, b) => b.localeCompare(a));
    expect(dates).toEqual(sorted);
  });

  it('GET /api/health → {status:"ok"}', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/health')
      .expect(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});
