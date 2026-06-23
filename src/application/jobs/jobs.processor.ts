import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomDelay } from '../../common/utils/delay';
import { Semaphore } from '../../common/utils/semaphore';
import { Job, JobStatus } from '../../domain/jobs/job.entity';
import { UrlResult, UrlStatus } from '../../domain/jobs/url-result.entity';
import { JobRepository } from '../../domain/jobs/ports/job-repository.port';
import { UrlChecker } from '../../domain/jobs/ports/url-checker.port';

const TERMINAL_STATUSES: ReadonlySet<JobStatus> = new Set([
  JobStatus.COMPLETED,
  JobStatus.CANCELLED,
  JobStatus.FAILED,
]);

/**
 * Owns ALL job status transitions. `process` is fire-and-forget: it is invoked
 * with `void` from the service and must never be awaited by request handlers.
 */
@Injectable()
export class JobsProcessor {
  private readonly logger = new Logger(JobsProcessor.name);
  private readonly maxConcurrency: number;
  private readonly delayMaxMs: number;

  constructor(
    private readonly store: JobRepository,
    private readonly urlChecker: UrlChecker,
    private readonly config: ConfigService,
  ) {
    this.maxConcurrency = this.config.get<number>('maxConcurrency') ?? 5;
    this.delayMaxMs = this.config.get<number>('delayMaxMs') ?? 10000;
  }

  async process(jobId: string): Promise<void> {
    const job = this.store.findById(jobId);
    if (!job || job.cancelled) {
      return;
    }

    job.status = JobStatus.IN_PROGRESS;
    job.startedAt = new Date().toISOString();

    // Per-job semaphore — concurrency cap applies per job, not globally.
    const sem = new Semaphore(this.maxConcurrency);

    try {
      await Promise.allSettled(
        job.urls.map((item) =>
          sem.runWithLimit(() => this.handleUrl(job, item)),
        ),
      );
    } catch (err) {
      // An unexpected engine error (NOT a per-URL failure).
      this.logger.error(
        `Unexpected error processing job ${job.id}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      if (!job.cancelled) {
        job.status = JobStatus.FAILED;
        job.finishedAt = new Date().toISOString();
      }
      return;
    }

    this.finalize(job);
  }

  private async handleUrl(job: Job, item: UrlResult): Promise<void> {
    // Queued-but-unadmitted urls skip work and become cancelled.
    if (job.cancelled || job.abortController.signal.aborted) {
      if (item.status === UrlStatus.PENDING) {
        item.status = UrlStatus.CANCELLED;
      }
      return;
    }

    item.status = UrlStatus.IN_PROGRESS;
    item.startedAt = new Date().toISOString();
    const start = Date.now();

    const check = await this.urlChecker.head(
      item.url,
      job.abortController.signal,
    );

    // Artificial delay BEFORE saving the result.
    try {
      await randomDelay(0, this.delayMaxMs, job.abortController.signal);
    } catch {
      // Aborted during the delay window.
      item.status = UrlStatus.CANCELLED;
      item.finishedAt = new Date().toISOString();
      item.durationMs = Date.now() - start;
      return;
    }

    if (job.cancelled) {
      item.status = UrlStatus.CANCELLED;
    } else if (check.aborted) {
      item.status = UrlStatus.CANCELLED;
      item.error = 'aborted';
    } else if (check.error) {
      item.status = UrlStatus.ERROR;
      item.httpStatus = check.httpStatus;
      item.error = check.error;
    } else {
      item.httpStatus = check.httpStatus;
      const code = check.httpStatus ?? 0;
      if (code >= 200 && code < 400) {
        item.status = UrlStatus.SUCCESS;
      } else {
        item.status = UrlStatus.ERROR;
        item.error = `HTTP ${code}`;
      }
    }

    item.finishedAt = new Date().toISOString();
    item.durationMs = Date.now() - start;
  }

  cancel(job: Job): void {
    // Idempotent: no-op if the job already reached a terminal state.
    if (TERMINAL_STATUSES.has(job.status)) {
      return;
    }

    job.cancelled = true;
    job.abortController.abort();

    for (const item of job.urls) {
      if (item.status === UrlStatus.PENDING) {
        item.status = UrlStatus.CANCELLED;
      }
    }

    job.status = JobStatus.CANCELLED;
    job.finishedAt = new Date().toISOString();
  }

  private finalize(job: Job): void {
    if (job.cancelled) {
      job.status = JobStatus.CANCELLED;
      job.finishedAt = job.finishedAt ?? new Date().toISOString();
      return;
    }

    // FAILED is reserved for engine errors only — a job whose URLs all errored
    // still ends `completed`.
    job.status = JobStatus.COMPLETED;
    job.finishedAt = new Date().toISOString();
  }
}
