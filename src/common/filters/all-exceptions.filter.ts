import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

interface ErrorEnvelope {
  statusCode: number;
  error: string;
  message: string | string[];
  timestamp: string;
  path: string;
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
    let error = 'Internal Server Error';
    let message: string | string[] = 'Internal server error';

    if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      const res = exception.getResponse();

      if (typeof res === 'string') {
        message = res;
        error = exception.name;
      } else if (res && typeof res === 'object') {
        const body = res as Record<string, unknown>;
        // class-validator / Nest wrap details under `message` and `error`.
        message =
          (body.message as string | string[] | undefined) ?? exception.message;
        error =
          (body.error as string | undefined) ??
          HttpStatus[statusCode] ??
          exception.name;
      } else {
        message = exception.message;
        error = exception.name;
      }
    } else {
      // Unknown / unexpected error — never leak internals or stack traces.
      this.logger.error(
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    const envelope: ErrorEnvelope = {
      statusCode,
      error,
      message,
      timestamp: new Date().toISOString(),
      path: request?.url ?? '',
    };

    response.status(statusCode).json(envelope);
  }
}
