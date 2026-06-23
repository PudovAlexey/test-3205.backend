import { Job } from '../job.entity';

/**
 * Port (domain abstraction) for job persistence. The application layer depends
 * on this contract only; the concrete in-memory adapter lives in the
 * infrastructure ring and is bound to this token in the composition root.
 *
 * Declared as an `abstract class` so it doubles as a runtime DI token — Nest
 * injects by type, no `@Inject`/string token needed.
 */
export abstract class JobRepository {
  abstract create(urls: string[]): Job;
  abstract findById(id: string): Job | undefined;
  abstract findAll(): Job[];
}
