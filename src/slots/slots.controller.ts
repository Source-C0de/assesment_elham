import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { SlotsResponseDto } from './dto/slot.dto';
import { SlotsService } from './slots.service';

@ApiTags('slots')
@Controller('slots')
export class SlotsController {
  constructor(private readonly slots: SlotsService) {}

  @Get()
  @ApiOperation({
    summary: 'List available appointment slots',
    description:
      'Returns slots that have no active booking, ordered by startsAt ASC then id ASC.',
  })
  @ApiOkResponse({
    description: 'Available slots.',
    type: SlotsResponseDto,
  })
  async list(): Promise<SlotsResponseDto> {
    const slots = await this.slots.findAvailable();
    return { slots };
  }
}
