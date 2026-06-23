import { UrlResult } from './url-result.entity';

export enum JobStatus {
  PENDING = 'pending',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
  FAILED = 'failed',
}

export interface Job {
  id: string;
  createdAt: string;
  status: JobStatus;
  startedAt: string | null;
  finishedAt: string | null;
  urls: UrlResult[];

  // Runtime-only fields (never serialized to clients).
  abortController: AbortController;
  cancelled: boolean;
}
