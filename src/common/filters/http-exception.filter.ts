import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { ErrorCode, ErrorCodes } from '../errors';

/**
 * Uniform JSON error envelope: { "error": { "code": "...", "message": "..." } }.
 *
 * Resolution order:
 *   1. If the exception body is an object with `code` + `message`, use them verbatim
 *      (this is what ApiErrorException produces).
 *   2. If the exception is a plain HttpException with no code, map by HTTP status:
 *      400 -> VALIDATION_ERROR, 404 -> SLOT_NOT_FOUND (fallback), 409 -> SLOT_UNAVAILABLE (fallback).
 *   3. Prisma P2025 -> BOOKING_NOT_FOUND.
 *   4. Anything else -> INTERNAL_ERROR. Stack traces are logged server-side but never sent.
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('HttpExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const { status, code, message } = this.classify(exception);

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        `${request.method} ${request.url} -> ${status} ${code}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    response.status(status).json({
      error: { code, message },
    });
  }

  private classify(exception: unknown): { status: number; code: ErrorCode; message: string } {
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      const obj = typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : null;

      if (obj && typeof obj.code === 'string' && typeof obj.message === 'string') {
        return { status, code: obj.code as ErrorCode, message: obj.message };
      }

      const rawMessage = (obj as any)?.message ?? body;
      const message = Array.isArray(rawMessage)
        ? rawMessage.join('; ')
        : typeof rawMessage === 'string' && rawMessage
          ? rawMessage
          : this.defaultMessage(status);

      if (status === HttpStatus.BAD_REQUEST) {
        return { status, code: ErrorCodes.VALIDATION_ERROR, message: message || 'Invalid request.' };
      }
      if (status === HttpStatus.NOT_FOUND) {
        return { status, code: ErrorCodes.SLOT_NOT_FOUND, message: message || 'Resource not found.' };
      }
      if (status === HttpStatus.CONFLICT) {
        return { status, code: ErrorCodes.SLOT_UNAVAILABLE, message: message || 'This slot already has an active booking.' };
      }
      return { status, code: ErrorCodes.INTERNAL_ERROR, message: message || this.defaultMessage(status) };
    }

    if (exception && typeof exception === 'object' && 'code' in exception) {
      const err = exception as { code?: string };
      if (err.code === 'P2025') {
        return {
          status: HttpStatus.NOT_FOUND,
          code: ErrorCodes.BOOKING_NOT_FOUND,
          message: 'Booking not found.',
        };
      }
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      code: ErrorCodes.INTERNAL_ERROR,
      message: 'An unexpected error occurred.',
    };
  }

  private defaultMessage(status: number): string {
    if (status === HttpStatus.BAD_REQUEST) return 'Invalid request.';
    if (status === HttpStatus.NOT_FOUND) return 'Resource not found.';
    if (status === HttpStatus.CONFLICT) return 'This slot already has an active booking.';
    return 'An unexpected error occurred.';
  }
}
