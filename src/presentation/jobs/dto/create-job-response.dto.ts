import { ApiProperty } from '@nestjs/swagger';

export class CreateJobResponseDto {
  @ApiProperty({
    description: 'Unique identifier of the newly created job.',
    example: 'b3f1c2e4-5a6b-7c8d-9e0f-1a2b3c4d5e6f',
  })
  jobId: string;
}
