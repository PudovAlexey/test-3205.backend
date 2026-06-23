import { ApiProperty } from '@nestjs/swagger';
import { JobStatus } from '../../../domain/jobs/job.entity';

export class JobSummaryStatsDto {
  @ApiProperty({ example: 3 })
  success: number;

  @ApiProperty({ example: 1 })
  error: number;
}

export class JobSummaryDto {
  @ApiProperty({ example: 'b3f1c2e4-5a6b-7c8d-9e0f-1a2b3c4d5e6f' })
  id: string;

  @ApiProperty({ example: '2026-06-23T10:00:00.000Z' })
  createdAt: string;

  @ApiProperty({ enum: JobStatus, enumName: 'JobStatus' })
  status: JobStatus;

  @ApiProperty({ example: 4 })
  urlCount: number;

  @ApiProperty({ type: JobSummaryStatsDto })
  stats: JobSummaryStatsDto;
}
