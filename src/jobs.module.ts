import { Module } from '@nestjs/common';
import { JobRepository } from './domain/jobs/ports/job-repository.port';
import { UrlChecker } from './domain/jobs/ports/url-checker.port';
import { JobsService } from './application/jobs/jobs.service';
import { JobsProcessor } from './application/jobs/jobs.processor';
import { InMemoryJobRepository } from './infrastructure/jobs/in-memory-job.repository';
import { UndiciUrlChecker } from './infrastructure/jobs/undici-url-checker';
import { JobsController } from './presentation/jobs/jobs.controller';

/**
 * Composition root for the jobs feature — the only place that knows the
 * concrete adapters. Ports (abstract classes) are bound to their infrastructure
 * implementations via `useClass`, so every other layer depends on abstractions.
 */
@Module({
  controllers: [JobsController],
  providers: [
    JobsService,
    JobsProcessor,
    { provide: JobRepository, useClass: InMemoryJobRepository },
    { provide: UrlChecker, useClass: UndiciUrlChecker },
  ],
  exports: [JobsService],
})
export class JobsModule {}
