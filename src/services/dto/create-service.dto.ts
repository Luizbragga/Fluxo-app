import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsOptional, IsString, Min } from 'class-validator';

export class CreateServiceDto {
  @ApiProperty({ example: 'Corte' })
  @IsString()
  name!: string;

  @ApiProperty({ example: 30, description: 'Duração em minutos' })
  @IsInt()
  @Min(1)
  durationMin!: number;

  @ApiProperty({
    example: 1500,
    description: 'Preço em cents (15,00€ -> 1500)',
  })
  @IsInt()
  @Min(0)
  priceCents!: number;

  @ApiProperty({ example: true, required: false })
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
