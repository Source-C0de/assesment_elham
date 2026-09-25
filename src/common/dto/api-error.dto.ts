import { ApiProperty } from '@nestjs/swagger';
import { ErrorCode, ErrorCodes } from '../errors';

export class ApiErrorBodyDto {
  @ApiProperty({
    enum: Object.values(ErrorCodes),
    example: ErrorCodes.SLOT_UNAVAILABLE,
  })
  code!: ErrorCode;

  @ApiProperty({ example: 'This slot already has an active booking.' })
  message!: string;
}

export class ApiErrorDto {
  @ApiProperty({ type: ApiErrorBodyDto })
  error!: ApiErrorBodyDto;
}
