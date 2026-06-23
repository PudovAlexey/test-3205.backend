import { ApiProperty } from '@nestjs/swagger';
import { JobStatus } from '../../../domain/jobs/job.entity';
import { UrlResultDto } from './url-result.dto';

export class JobDetailStatsDto {
  @ApiProperty({ example: 3 })
  success: number;

  @ApiProperty({ example: 1 })
  error: number;

  @ApiProperty({ example: 0 })
  pending: number;

  @ApiProperty({ example: 0 })
  inProgress: number;

  @ApiProperty({ example: 0 })
  cancelled: number;
}

export class JobDetailDto {
  @ApiProperty({ example: 'b3f1c2e4-5a6b-7c8d-9e0f-1a2b3c4d5e6f' })
  id: string;

  @ApiProperty({ example: '2026-06-23T10:00:00.000Z' })
  createdAt: string;

  @ApiProperty({ enum: JobStatus, enumName: 'JobStatus' })
  status: JobStatus;

  @ApiProperty({ type: String, nullable: true })
  startedAt: string | null;

  @ApiProperty({ type: String, nullable: true })
  finishedAt: string | null;

  @ApiProperty({
    example: 4,
    description: 'total - pending - inProgress',
  })
  processed: number;

  @ApiProperty({ type: JobDetailStatsDto })
  stats: JobDetailStatsDto;

  @ApiProperty({ type: [UrlResultDto] })
  urls: UrlResultDto[];
}
