import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status = this.getHttpStatus(exception);
    const errorResponse = this.getErrorResponse(exception, status, request);

    // Log the error
    this.logError(exception, request, status);

    response.status(status).json(errorResponse);
  }

  private getHttpStatus(exception: unknown): number {
    if (exception instanceof HttpException) {
      return exception.getStatus();
    }
    return HttpStatus.INTERNAL_SERVER_ERROR;
  }

  private getErrorResponse(
    exception: unknown,
    status: number,
    request: Request,
  ): any {
    const timestamp = new Date().toISOString();
    const path = request.url;

    if (exception instanceof HttpException) {
      const response = exception.getResponse();
      if (typeof response === 'object') {
        return {
          ...response,
          timestamp,
          path,
          statusCode: status,
        };
      }
      return {
        statusCode: status,
        message: response,
        timestamp,
        path,
      };
    }

    // For non-HTTP exceptions
    const message = 
      exception instanceof Error 
        ? exception.message 
        : 'Internal server error';

    return {
      statusCode: status,
      message,
      error: 'Internal Server Error',
      timestamp,
      path,
    };
  }

  private logError(exception: unknown, request: Request, status: number): void {
    const { method, url, body, headers } = request;
    const errorDetails = {
      method,
      url,
      statusCode: status,
      body,
      userAgent: headers['user-agent'],
    };

    if (status >= 500) {
      // Log server errors with stack trace
      this.logger.error(
        exception instanceof Error ? exception.message : 'Unknown error',
        exception instanceof Error ? exception.stack : undefined,
        errorDetails,
      );
    } else {
      // Log client errors without stack trace
      this.logger.warn(
        exception instanceof Error ? exception.message : 'Client error',
        errorDetails,
      );
    }
  }
}