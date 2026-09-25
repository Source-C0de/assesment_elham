import { HttpException, HttpStatus } from '@nestjs/common';
import { ErrorCode, ErrorCodes } from './errors';

/**
 * Domain exceptions that carry their own `code` and `message` for the
 * uniform error envelope. The HttpExceptionFilter reads `code` directly
 * from the exception payload rather than guessing from HTTP status.
 */

interface ErrorPayload {
  code: ErrorCode;
  message: string;
}

export class ApiErrorException extends HttpException {
  constructor(status: HttpStatus, payload: ErrorPayload) {
    super({ code: payload.code, message: payload.message }, status);
  }
}

export class ValidationException extends ApiErrorException {
  constructor(message: string) {
    super(HttpStatus.BAD_REQUEST, { code: ErrorCodes.VALIDATION_ERROR, message });
  }
}

export class SlotNotFoundException extends ApiErrorException {
  constructor(message = 'Slot not found.') {
    super(HttpStatus.NOT_FOUND, { code: ErrorCodes.SLOT_NOT_FOUND, message });
  }
}

export class BookingNotFoundException extends ApiErrorException {
  constructor(message = 'Booking not found.') {
    super(HttpStatus.NOT_FOUND, { code: ErrorCodes.BOOKING_NOT_FOUND, message });
  }
}

export class SlotUnavailableException extends ApiErrorException {
  constructor(message = 'This slot already has an active booking.') {
    super(HttpStatus.CONFLICT, { code: ErrorCodes.SLOT_UNAVAILABLE, message });
  }
}
