import { ApiProperty } from '@nestjs/swagger';
import {
  IsISO8601,
  IsOptional,
  IsString,
  Matches,
  IsNotEmpty,
} from 'class-validator';

// CUID clássico: começa com 'c' e tem 25 chars no total (1 + 24)
const CUID_REGEX = /^c[a-z0-9]{24}$/i;

export class CreateAppointmentDto {
  @ApiProperty({
    example: 'cmhvugfn0008uysqrtd6e01o',
    description: 'ID do provider (cuid)',
  })
  @IsString()
  @IsNotEmpty({ message: 'providerId é obrigatório' })
  @Matches(CUID_REGEX, { message: 'providerId deve ser um cuid válido' })
  providerId!: string;

  @ApiProperty({
    example: 'cmhvvsuip0006uyqsdne4267g',
    description: 'ID do service (cuid)',
  })
  @IsString()
  @IsNotEmpty({ message: 'serviceId é obrigatório' })
  @Matches(CUID_REGEX, { message: 'serviceId deve ser um cuid válido' })
  serviceId!: string;

  @ApiProperty({ example: '2025-11-15T09:00:00Z' })
  @IsISO8601(
    { strict: true },
    {
      message:
        'startAt deve ser uma data ISO válida (ex: 2025-11-15T09:00:00Z)',
    },
  )
  startAt!: string;

  @ApiProperty({ example: '2025-11-15T09:30:00Z' })
  @IsISO8601(
    { strict: true },
    {
      message: 'endAt deve ser uma data ISO válida (ex: 2025-11-15T09:30:00Z)',
    },
  )
  endAt!: string;

  @ApiProperty({ example: 'João Silva' })
  @IsString()
  @IsNotEmpty({ message: 'clientName é obrigatório' })
  clientName!: string;

  @ApiProperty({ example: '+351910000000' })
  @IsString()
  @IsNotEmpty({ message: 'clientPhone é obrigatório' })
  clientPhone!: string;

  @ApiProperty({ required: false, example: 'Observações do atendimento' })
  @IsOptional()
  @IsString()
  note?: string;
}
