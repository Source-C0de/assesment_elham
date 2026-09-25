/** Typed error codes used in the uniform `{"error":{"code","message"}}` envelope. */
export const ErrorCodes = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  SLOT_NOT_FOUND: 'SLOT_NOT_FOUND',
  BOOKING_NOT_FOUND: 'BOOKING_NOT_FOUND',
  SLOT_UNAVAILABLE: 'SLOT_UNAVAILABLE',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];
