import { ApiProperty } from '@nestjs/swagger';
import { Booking } from '@prisma/client';

export class BookingDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  slotId!: string;

  @ApiProperty()
  customerName!: string;

  @ApiProperty()
  customerEmail!: string;

  @ApiProperty({ enum: ['active', 'cancelled'] })
  status!: 'active' | 'cancelled';

  static from(b: Booking): BookingDto {
    return {
      id: b.id,
      slotId: b.slotId,
      customerName: b.customerName,
      customerEmail: b.customerEmail,
      status: b.status,
    };
  }
}

export class BookingResponseDto {
  @ApiProperty({ type: BookingDto })
  booking!: BookingDto;
}
