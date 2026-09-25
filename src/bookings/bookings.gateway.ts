import { Logger } from '@nestjs/common';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server } from 'socket.io';

/**
 * Socket.IO gateway for slot lifecycle events.
 * Default namespace `/`, default path `/socket.io`. No auth, no rooms, no client events.
 * BookingsService emits slot.booked / slot.released here AFTER the DB commit succeeds.
 */
@WebSocketGateway({
  cors: { origin: '*' },
})
export class BookingsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger('BookingsGateway');

  @WebSocketServer()
  server!: Server;

  handleConnection(client: any): void {
    this.logger.log(`client connected: ${client.id}`);
  }

  handleDisconnect(client: any): void {
    this.logger.log(`client disconnected: ${client.id}`);
  }

  emitSlotBooked(slotId: string, bookingId: string): void {
    this.server.emit('slot.booked', { slotId, bookingId, available: false });
  }

  emitSlotReleased(slotId: string, bookingId: string): void {
    this.server.emit('slot.released', { slotId, bookingId, available: true });
  }
}
