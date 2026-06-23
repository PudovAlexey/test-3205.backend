import { NotFoundException } from '@nestjs/common';
import { JobStatus } from '../../domain/jobs/job.entity';
import { UrlStatus } from '../../domain/jobs/url-result.entity';
import { InMemoryJobRepository } from '../../infrastructure/jobs/in-memory-job.repository';
import { JobsProcessor } from './jobs.processor';
import { JobsService } from './jobs.service';

describe('JobsService', () => {
  let store: InMemoryJobRepository;
  let processor: { process: jest.Mock; cancel: jest.Mock };
  let service: JobsService;

  beforeEach(() => {
    store = new InMemoryJobRepository();
    processor = {
      process: jest.fn().mockResolvedValue(undefined),
      cancel: jest.fn(),
    };
    service = new JobsService(store, processor as unknown as JobsProcessor);
  });

  it('dedupes urls (first occurrence wins, order preserved), returns {jobId}, and triggers the processor', () => {
    const res = service.createJob([
      'https://a.com',
      'https://b.com',
      'https://a.com',
      'https://c.com',
      'https://b.com',
    ]);

    expect(res.jobId).toBeDefined();
    expect(processor.process).toHaveBeenCalledWith(res.jobId);

    const job = store.findById(res.jobId)!;
    expect(job.urls.map((u) => u.url)).toEqual([
      'https://a.com',
      'https://b.com',
      'https://c.com',
    ]);
  });

  it('getJob throws NotFound for an unknown id', () => {
    expect(() => service.getJob('does-not-exist')).toThrow(NotFoundException);
  });

  it('cancelJob throws NotFound for an unknown id', () => {
    expect(() => service.cancelJob('does-not-exist')).toThrow(
      NotFoundException,
    );
  });

  it('cancelJob delegates to processor.cancel and returns detail dto', () => {
    const { jobId } = service.createJob(['https://a.com']);
    const detail = service.cancelJob(jobId);

    expect(processor.cancel).toHaveBeenCalledTimes(1);
    expect(detail.id).toBe(jobId);
  });

  it('listJobs sorts newest-first', () => {
    const a = store.create(['https://a.com']);
    a.createdAt = '2026-06-23T10:00:00.000Z';
    const b = store.create(['https://b.com']);
    b.createdAt = '2026-06-23T11:00:00.000Z';
    const c = store.create(['https://c.com']);
    c.createdAt = '2026-06-23T09:00:00.000Z';

    const ids = service.listJobs().map((j) => j.id);
    expect(ids).toEqual([b.id, a.id, c.id]);
  });

  it('toSummaryDto strips runtime fields and computes success/error stats', () => {
    const job = store.create([
      'https://a.com',
      'https://b.com',
      'https://c.com',
    ]);
    job.urls[0].status = UrlStatus.SUCCESS;
    job.urls[1].status = UrlStatus.ERROR;
    // url[2] stays pending

    const summary = service.toSummaryDto(job);

    expect(summary).toEqual({
      id: job.id,
      createdAt: job.createdAt,
      status: JobStatus.PENDING,
      urlCount: 3,
      stats: { success: 1, error: 1 },
    });
    expect((summary as any).abortController).toBeUndefined();
    expect((summary as any).cancelled).toBeUndefined();
  });

  it('toDetailDto computes full stats, processed = total - pending - inProgress, and strips runtime fields', () => {
    const job = store.create([
      'https://a.com',
      'https://b.com',
      'https://c.com',
      'https://d.com',
      'https://e.com',
    ]);
    job.urls[0].status = UrlStatus.SUCCESS;
    job.urls[1].status = UrlStatus.ERROR;
    job.urls[2].status = UrlStatus.CANCELLED;
    job.urls[3].status = UrlStatus.IN_PROGRESS;
    // url[4] stays pending

    const detail = service.toDetailDto(job);

    expect(detail.stats).toEqual({
      success: 1,
      error: 1,
      pending: 1,
      inProgress: 1,
      cancelled: 1,
    });
    // total(5) - pending(1) - inProgress(1) = 3
    expect(detail.processed).toBe(3);
    expect(detail.urls).toHaveLength(5);
    expect((detail as any).abortController).toBeUndefined();
    expect((detail as any).cancelled).toBeUndefined();
    expect((detail.urls[0] as any).abortController).toBeUndefined();
  });
});
