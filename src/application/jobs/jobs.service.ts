import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateJobResponseDto } from '../../presentation/jobs/dto/create-job-response.dto';
import { JobDetailDto } from '../../presentation/jobs/dto/job-detail.dto';
import { JobSummaryDto } from '../../presentation/jobs/dto/job-summary.dto';
import { UrlResultDto } from '../../presentation/jobs/dto/url-result.dto';
import { Job } from '../../domain/jobs/job.entity';
import { UrlResult, UrlStatus } from '../../domain/jobs/url-result.entity';
import { JobRepository } from '../../domain/jobs/ports/job-repository.port';
import { JobsProcessor } from './jobs.processor';

@Injectable()
export class JobsService {
  constructor(
    private readonly store: JobRepository,
    private readonly processor: JobsProcessor,
  ) {}

  createJob(urls: string[]): CreateJobResponseDto {
    const deduped = this.dedupe(urls);
    const job = this.store.create(deduped);

    // Fire-and-forget — do NOT await. The processor owns all status transitions.
    void this.processor.process(job.id);

    return { jobId: job.id };
  }

  listJobs(): JobSummaryDto[] {
    return this.store
      .findAll()
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((job) => this.toSummaryDto(job));
  }

  getJob(id: string): JobDetailDto {
    const job = this.requireJob(id);
    return this.toDetailDto(job);
  }

  cancelJob(id: string): JobDetailDto {
    const job = this.requireJob(id);
    this.processor.cancel(job);
    return this.toDetailDto(job);
  }

  private requireJob(id: string): Job {
    const job = this.store.findById(id);
    if (!job) {
      throw new NotFoundException(`Job ${id} not found`);
    }
    return job;
  }

  private dedupe(urls: string[]): string[] {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const url of urls) {
      if (!seen.has(url)) {
        seen.add(url);
        result.push(url);
      }
    }
    return result;
  }

  private countByStatus(urls: UrlResult[]): Record<UrlStatus, number> {
    const counts: Record<UrlStatus, number> = {
      [UrlStatus.PENDING]: 0,
      [UrlStatus.IN_PROGRESS]: 0,
      [UrlStatus.SUCCESS]: 0,
      [UrlStatus.ERROR]: 0,
      [UrlStatus.CANCELLED]: 0,
    };
    for (const item of urls) {
      counts[item.status]++;
    }
    return counts;
  }

  private toUrlResultDto(item: UrlResult): UrlResultDto {
    return {
      url: item.url,
      status: item.status,
      httpStatus: item.httpStatus,
      error: item.error,
      startedAt: item.startedAt,
      finishedAt: item.finishedAt,
      durationMs: item.durationMs,
    };
  }

  toSummaryDto(job: Job): JobSummaryDto {
    const counts = this.countByStatus(job.urls);
    return {
      id: job.id,
      createdAt: job.createdAt,
      status: job.status,
      urlCount: job.urls.length,
      stats: {
        success: counts[UrlStatus.SUCCESS],
        error: counts[UrlStatus.ERROR],
      },
    };
  }

  toDetailDto(job: Job): JobDetailDto {
    const counts = this.countByStatus(job.urls);
    const total = job.urls.length;
    const pending = counts[UrlStatus.PENDING];
    const inProgress = counts[UrlStatus.IN_PROGRESS];

    return {
      id: job.id,
      createdAt: job.createdAt,
      status: job.status,
      startedAt: job.startedAt,
      finishedAt: job.finishedAt,
      processed: total - pending - inProgress,
      stats: {
        success: counts[UrlStatus.SUCCESS],
        error: counts[UrlStatus.ERROR],
        pending,
        inProgress,
        cancelled: counts[UrlStatus.CANCELLED],
      },
      urls: job.urls.map((item) => this.toUrlResultDto(item)),
    };
  }
}
