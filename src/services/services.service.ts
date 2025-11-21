import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateServiceDto } from './dto/create-service.dto';
import { UpdateServiceDto } from './dto/update-service.dto';

function toCents(value: number | undefined): number | undefined {
  if (value === undefined || value === null) return undefined;
  if (Number.isNaN(value)) throw new BadRequestException('priceCents inválido');
  const cents = Math.round(value); // já vem em centavos no seu DTO
  if (cents < 0) throw new BadRequestException('priceCents deve ser ≥ 0');
  return cents;
}

function decorate(row: any) {
  if (!row) return row;
  const price = row.priceCents / 100;
  return {
    ...row,
    price,
    priceLabel: price.toFixed(2).replace('.', ','), // "12,34"
  };
}

@Injectable()
export class ServicesService {
  constructor(private prisma: PrismaService) {}

  async create(tenantId: string, dto: CreateServiceDto) {
    const priceCents = toCents(dto.priceCents)!;

    const service = await this.prisma.service.create({
      data: {
        tenantId,
        name: dto.name.trim(),
        durationMin: dto.durationMin,
        priceCents,
        active: dto.active ?? true,
      },
    });

    return decorate(service);
  }

  async findAll(tenantId: string) {
    const rows = await this.prisma.service.findMany({
      where: { tenantId },
      orderBy: { name: 'asc' },
    });
    return rows.map(decorate);
  }

  async findOne(tenantId: string, id: string) {
    const service = await this.prisma.service.findFirst({
      where: { id, tenantId },
    });
    if (!service) throw new NotFoundException('Serviço não encontrado');
    return decorate(service);
  }

  async update(tenantId: string, id: string, dto: UpdateServiceDto) {
    // garante existência e escopo
    await this.findOne(tenantId, id);

    const data: any = {};
    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.durationMin !== undefined) data.durationMin = dto.durationMin;
    if (dto.priceCents !== undefined) data.priceCents = toCents(dto.priceCents);
    if (dto.active !== undefined) data.active = dto.active;

    const updated = await this.prisma.service.update({
      where: { id }, // seguro porque já validamos tenant acima
      data,
    });

    return decorate(updated);
  }

  // “delete” suave: desativa
  async remove(tenantId: string, id: string) {
    await this.findOne(tenantId, id); // valida escopo
    const disabled = await this.prisma.service.update({
      where: { id },
      data: { active: false },
    });
    return decorate(disabled);
  }
}
