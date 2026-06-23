import { ConfigService } from '@nestjs/config';
import { JobStatus } from '../../domain/jobs/job.entity';
import { UrlStatus } from '../../domain/jobs/url-result.entity';
import { InMemoryJobRepository } from '../../infrastructure/jobs/in-memory-job.repository';
import { JobsProcessor } from './jobs.processor';
import {
  UrlChecker,
  UrlCheckResult,
} from '../../domain/jobs/ports/url-checker.port';

// Make the artificial delay instantaneous & abort-aware for all processor tests.
jest.mock('../../common/utils/delay', () => ({
  randomDelay: (_min: number, _max: number, signal: AbortSignal) =>
    new Promise<void>((resolve, reject) => {
      if (signal.aborted) {
        reject(new DOMException('Aborted', 'AbortError'));
        return;
      }
      resolve();
    }),
}));

interface Deferred<T = void> {
  promise: Promise<T>;
  resolve: (value: T) => void;
}

function deferred<T = void>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

const okResult: UrlCheckResult = {
  httpStatus: 200,
  error: null,
  aborted: false,
};

function makeConfig(overrides: Record<string, any> = {}): ConfigService {
  const values: Record<string, any> = {
    maxConcurrency: 5,
    delayMaxMs: 0,
    ...overrides,
  };
  return {
    get: (key: string) => values[key],
  } as unknown as ConfigService;
}

function buildProcessor(
  head: UrlChecker['head'],
  configOverrides: Record<string, any> = {},
): { processor: JobsProcessor; store: InMemoryJobRepository } {
  const store = new InMemoryJobRepository();
  const checker = { head } as unknown as UrlChecker;
  const processor = new JobsProcessor(
    store,
    checker,
    makeConfig(configOverrides),
  );
  return { processor, store };
}

function urls(n: number): string[] {
  return Array.from({ length: n }, (_, i) => `https://example.com/${i}`);
}

describe('JobsProcessor', () => {
  it('(a) never runs more than 5 head() calls concurrently within a job', async () => {
    let inFlight = 0;
    let peak = 0;
    const gate = deferred();

    const head = jest.fn(async () => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await gate.promise;
      inFlight--;
      return okResult;
    });

    const { processor, store } = buildProcessor(head);
    const job = store.create(urls(20));

    const done = processor.process(job.id);

    // Let the semaphore admit exactly its limit.
    await new Promise((r) => setImmediate(r));
    expect(inFlight).toBe(5);
    expect(peak).toBe(5);

    gate.resolve();
    await done;

    expect(peak).toBe(5);
    expect(head).toHaveBeenCalledTimes(20);
  });

  it('(b) two jobs run concurrently — combined in-flight exceeds 5 (no global throttle)', async () => {
    let inFlight = 0;
    let peak = 0;
    const gate = deferred();

    const head = jest.fn(async () => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await gate.promise;
      inFlight--;
      return okResult;
    });

    const { processor, store } = buildProcessor(head);
    const jobA = store.create(urls(15));
    const jobB = store.create(urls(15));

    const doneA = processor.process(jobA.id);
    const doneB = processor.process(jobB.id);

    await new Promise((r) => setImmediate(r));

    // Each job admits 5 → ~10 combined, proving there is no global cap.
    expect(peak).toBe(10);
    expect(peak).toBeGreaterThan(5);

    gate.resolve();
    await Promise.all([doneA, doneB]);
  });

  it('(c) cancel mid-flight → remaining pending urls become cancelled and head() called fewer than total', async () => {
    const gate = deferred();
    let started = 0;

    const head = jest.fn(async () => {
      started++;
      await gate.promise;
      return okResult;
    });

    const { processor, store } = buildProcessor(head);
    const job = store.create(urls(20));

    const done = processor.process(job.id);

    // 5 admitted & blocked on the gate.
    await new Promise((r) => setImmediate(r));
    expect(started).toBe(5);

    processor.cancel(job);
    gate.resolve();
    await done;

    expect(job.status).toBe(JobStatus.CANCELLED);
    // Far fewer than 20 head() calls because queued urls were cancelled.
    expect(head.mock.calls.length).toBeLessThan(20);

    const cancelled = job.urls.filter(
      (u) => u.status === UrlStatus.CANCELLED,
    ).length;
    expect(cancelled).toBeGreaterThan(0);
  });

  it('(d) happy path → job completed and durationMs populated', async () => {
    const head = jest.fn(async () => okResult);
    const { processor, store } = buildProcessor(head);
    const job = store.create(urls(8));

    await processor.process(job.id);

    expect(job.status).toBe(JobStatus.COMPLETED);
    expect(job.startedAt).not.toBeNull();
    expect(job.finishedAt).not.toBeNull();
    for (const u of job.urls) {
      expect(u.status).toBe(UrlStatus.SUCCESS);
      expect(u.httpStatus).toBe(200);
      expect(typeof u.durationMs).toBe('number');
      expect(u.durationMs).toBeGreaterThanOrEqual(0);
    }
  });

  it('(e) all-broken-urls job still ends completed (not failed)', async () => {
    const head = jest.fn(async () => ({
      httpStatus: null,
      error: 'ENOTFOUND',
      aborted: false,
    }));
    const { processor, store } = buildProcessor(head);
    const job = store.create(urls(6));

    await processor.process(job.id);

    expect(job.status).toBe(JobStatus.COMPLETED);
    for (const u of job.urls) {
      expect(u.status).toBe(UrlStatus.ERROR);
      expect(u.error).toBe('ENOTFOUND');
    }
  });

  it('maps HTTP >= 400 to error status with "HTTP <code>" message', async () => {
    const head = jest.fn(async () => ({
      httpStatus: 404,
      error: null,
      aborted: false,
    }));
    const { processor, store } = buildProcessor(head);
    const job = store.create(urls(2));

    await processor.process(job.id);

    expect(job.status).toBe(JobStatus.COMPLETED);
    for (const u of job.urls) {
      expect(u.status).toBe(UrlStatus.ERROR);
      expect(u.httpStatus).toBe(404);
      expect(u.error).toBe('HTTP 404');
    }
  });

  it('cancel is idempotent on terminal jobs', async () => {
    const head = jest.fn(async () => okResult);
    const { processor, store } = buildProcessor(head);
    const job = store.create(urls(2));

    await processor.process(job.id);
    expect(job.status).toBe(JobStatus.COMPLETED);
    const finishedAt = job.finishedAt;

    processor.cancel(job); // no-op
    expect(job.status).toBe(JobStatus.COMPLETED);
    expect(job.finishedAt).toBe(finishedAt);
  });
});
