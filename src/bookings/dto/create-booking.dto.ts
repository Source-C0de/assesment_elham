import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsNotEmpty, IsUUID } from 'class-validator';

/**
 * Payload for POST /bookings.
 * `customerName` and `customerEmail` are trimmed in a @Transform before validators run,
 * so leading/trailing whitespace can't make validation pass on empty data.
 */
export class CreateBookingDto {
  @ApiProperty({
    format: 'uuid',
    example: '11111111-1111-4111-8111-111111111111',
  })
  @IsUUID('4', { message: 'slotId must be a UUID.' })
  slotId!: string;

  @ApiProperty({ example: 'Alex Morgan' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsNotEmpty({ message: 'customerName must be non-empty.' })
  customerName!: string;

  @ApiProperty({ example: 'alex@example.com' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail({}, { message: 'customerEmail must be a valid email address.' })
  customerEmail!: string;
}
