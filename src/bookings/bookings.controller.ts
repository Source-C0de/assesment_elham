import {
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { ApiErrorDto } from '../common/dto/api-error.dto';
import { BookingsService } from './bookings.service';
import { BookingDto, BookingResponseDto } from './dto/booking.dto';
import { CreateBookingDto } from './dto/create-booking.dto';

@ApiTags('bookings')
@Controller('bookings')
export class BookingsController {
  constructor(private readonly bookings: BookingsService) {}

  @Post()
  @ApiOperation({
    summary: 'Create a booking for a slot',
    description:
      'Books the given slot for the given customer. Whitespace in customerName and ' +
      'customerEmail is trimmed before validation. customerEmail is also lower-cased. ' +
      'Returns 409 SLOT_UNAVAILABLE if the slot already has an active booking.',
  })
  @ApiCreatedResponse({ description: 'Booking created.', type: BookingResponseDto })
  @ApiBadRequestResponse({
    description: 'Invalid or missing fields / malformed JSON.',
    type: ApiErrorDto,
  })
  @ApiNotFoundResponse({
    description: 'Slot not found.',
    type: ApiErrorDto,
  })
  @ApiConflictResponse({
    description: 'Slot already has an active booking.',
    type: ApiErrorDto,
  })
  async create(@Body() dto: CreateBookingDto): Promise<BookingResponseDto> {
    const booking = await this.bookings.create(dto);
    return { booking: BookingDto.from(booking) };
  }

  @Delete(':bookingId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Cancel a booking (idempotent)',
    description:
      'Cancels an active booking, releasing its slot. Returns 200 with the same payload ' +
      'whether the booking is being cancelled for the first time or was already cancelled; ' +
      'repeated cancellation does not change state and does not emit a socket event.',
  })
  @ApiParam({ name: 'bookingId', format: 'uuid' })
  @ApiOkResponse({ description: 'Booking cancelled (or already cancelled).', type: BookingResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid UUID.', type: ApiErrorDto })
  @ApiNotFoundResponse({ description: 'Booking not found.', type: ApiErrorDto })
  async cancel(
    @Param('bookingId', new ParseUUIDPipe({ version: '4' })) bookingId: string,
  ): Promise<BookingResponseDto> {
    const { booking } = await this.bookings.cancel(bookingId);
    return { booking: BookingDto.from(booking) };
  }
}
