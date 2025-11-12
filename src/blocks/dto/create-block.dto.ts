import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, Matches, IsISO8601 } from 'class-validator';

export class CreateBlockDto {
  @ApiProperty({ example: 'cmhwrvpqf0008quysartde610' })
  @IsString()
  @Matches(
    /^(c[a-z0-9]{24}|[0-9a-fA-F-]{8}-[0-9a-fA-F-]{4}-[0-9a-fA-F-]{4}-[0-9a-fA-F-]{4}-[0-9a-fA-F-]{12})$/,
    {
      message: 'providerId deve ser um cuid ou UUID válido',
    },
  )
  providerId!: string;

  @ApiProperty({ example: '2025-11-15T14:00:00Z' })
  @IsISO8601(
    { strict: true },
    { message: 'startAt deve ser uma data ISO válida' },
  )
  startAt!: string;

  @ApiProperty({ example: '2025-11-15T16:00:00Z' })
  @IsISO8601(
    { strict: true },
    { message: 'endAt deve ser uma data ISO válida' },
  )
  endAt!: string;

  @ApiProperty({ required: false, example: 'Consulta externa' })
  @IsOptional()
  @IsString()
  reason?: string;
}
