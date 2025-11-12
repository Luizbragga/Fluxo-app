import { ApiProperty } from '@nestjs/swagger';
import { IsISO8601, IsOptional, IsString, Matches } from 'class-validator';

const CUID_REGEX = /^c[a-z0-9]{24}$/i;

export class CreateAppointmentDto {
  @ApiProperty({ example: 'cmhvugfn0008uysqrtd6e01o' })
  @IsString()
  @Matches(CUID_REGEX, { message: 'providerId deve ser um cuid válido' })
  providerId!: string;

  @ApiProperty({ example: 'cmhvvsuip0006uyqsdne4267g' })
  @IsString()
  @Matches(CUID_REGEX, { message: 'serviceId deve ser um cuid válido' })
  serviceId!: string;

  @ApiProperty({ example: '2025-11-15T09:00:00Z' })
  @IsISO8601()
  startAt!: string;

  @ApiProperty({ example: '2025-11-15T09:30:00Z' })
  @IsISO8601()
  endAt!: string;

  @ApiProperty({ example: 'João Silva' })
  @IsString()
  clientName!: string;

  @ApiProperty({ example: '+351910000000' })
  @IsString()
  clientPhone!: string;

  @IsOptional()
  @IsString()
  note?: string;
}
