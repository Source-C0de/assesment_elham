import { Module } from '@nestjs/common';
import { BookingsModule } from './bookings/bookings.module';
import { PrismaModule } from './common/prisma/prisma.module';
import { SlotsModule } from './slots/slots.module';

@Module({
  imports: [PrismaModule, SlotsModule, BookingsModule],
})
export class AppModule {}
