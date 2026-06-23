import { ApiProperty } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayNotEmpty, IsArray, IsUrl } from 'class-validator';

export class CreateJobDto {
  @ApiProperty({
    type: [String],
    description: 'List of http/https URLs to check (deduplicated server-side).',
    example: ['https://example.com', 'https://nestjs.com'],
  })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(1000)
  @IsUrl(
    {
      protocols: ['http', 'https'],
      require_protocol: true,
      require_tld: false,
    },
    { each: true },
  )
  urls: string[];
}
