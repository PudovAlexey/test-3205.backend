import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
} from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { JobsService } from '../../application/jobs/jobs.service';
import { CreateJobDto } from './dto/create-job.dto';
import { CreateJobResponseDto } from './dto/create-job-response.dto';
import { JobDetailDto } from './dto/job-detail.dto';
import { JobSummaryDto } from './dto/job-summary.dto';

@ApiTags('jobs')
@Controller('api/jobs')
export class JobsController {
  constructor(private readonly jobsService: JobsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a URL-checking job (processes async).' })
  @ApiCreatedResponse({ type: CreateJobResponseDto })
  create(@Body() dto: CreateJobDto): CreateJobResponseDto {
    return this.jobsService.createJob(dto.urls);
  }

  @Get()
  @ApiOperation({ summary: 'List jobs (newest first).' })
  @ApiOkResponse({ type: [JobSummaryDto] })
  list(): JobSummaryDto[] {
    return this.jobsService.listJobs();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get full job detail.' })
  @ApiOkResponse({ type: JobDetailDto })
  @ApiNotFoundResponse({ description: 'Job not found.' })
  get(@Param('id') id: string): JobDetailDto {
    return this.jobsService.getJob(id);
  }

  @Delete(':id')
  @HttpCode(200)
  @ApiOperation({ summary: 'Cancel a job (idempotent). Returns full detail.' })
  @ApiOkResponse({ type: JobDetailDto })
  @ApiNotFoundResponse({ description: 'Job not found.' })
  cancel(@Param('id') id: string): JobDetailDto {
    return this.jobsService.cancelJob(id);
  }
}
