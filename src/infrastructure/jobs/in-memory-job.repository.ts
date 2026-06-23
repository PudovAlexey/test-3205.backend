import { Injectable } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { Job, JobStatus } from '../../domain/jobs/job.entity';
import { UrlResult, UrlStatus } from '../../domain/jobs/url-result.entity';
import { JobRepository } from '../../domain/jobs/ports/job-repository.port';

/**
 * In-memory adapter for the {@link JobRepository} port. The single owner of the
 * in-memory job Map — nothing else should touch the Map directly; callers
 * mutate the Job objects they receive from here.
 */
@Injectable()
export class InMemoryJobRepository extends JobRepository {
  private jobs = new Map<string, Job>();

  create(urls: string[]): Job {
    const now = new Date().toISOString();

    const urlResults: UrlResult[] = urls.map((url) => ({
      url,
      status: UrlStatus.PENDING,
      httpStatus: null,
      error: null,
      startedAt: null,
      finishedAt: null,
      durationMs: null,
    }));

    const job: Job = {
      id: uuidv4(),
      createdAt: now,
      status: JobStatus.PENDING,
      startedAt: null,
      finishedAt: null,
      urls: urlResults,
      abortController: new AbortController(),
      cancelled: false,
    };

    this.jobs.set(job.id, job);
    return job;
  }

  findById(id: string): Job | undefined {
    return this.jobs.get(id);
  }

  findAll(): Job[] {
    return Array.from(this.jobs.values());
  }
}
