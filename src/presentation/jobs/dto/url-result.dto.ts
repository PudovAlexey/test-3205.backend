import { ApiProperty } from '@nestjs/swagger';
import { UrlStatus } from '../../../domain/jobs/url-result.entity';

export class UrlResultDto {
  @ApiProperty({ example: 'https://example.com' })
  url: string;

  @ApiProperty({ enum: UrlStatus, enumName: 'UrlStatus' })
  status: UrlStatus;

  @ApiProperty({
    type: Number,
    nullable: true,
    example: 200,
    description: 'HTTP status code returned by the HEAD request, if any.',
  })
  httpStatus: number | null;

  @ApiProperty({
    type: String,
    nullable: true,
    example: null,
    description: 'Error detail (e.g. "timeout", "ENOTFOUND", "HTTP 404").',
  })
  error: string | null;

  @ApiProperty({ type: String, nullable: true, example: null })
  startedAt: string | null;

  @ApiProperty({ type: String, nullable: true, example: null })
  finishedAt: string | null;

  @ApiProperty({ type: Number, nullable: true, example: null })
  durationMs: number | null;
}
