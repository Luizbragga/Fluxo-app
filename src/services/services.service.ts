import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateServiceDto } from './dto/create-service.dto';
import { UpdateServiceDto } from './dto/update-service.dto';

@Injectable()
export class ServicesService {
  constructor(private prisma: PrismaService) {}

  async create(tenantId: string, dto: CreateServiceDto) {
    const service = await this.prisma.service.create({
      data: {
        tenantId,
        name: dto.name,
        durationMin: dto.durationMin,
        priceCents: dto.priceCents,
        active: dto.active ?? true,
      },
    });
    return service;
  }

  async findAll(tenantId: string) {
    return this.prisma.service.findMany({
      where: { tenantId },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(tenantId: string, id: string) {
    const service = await this.prisma.service.findFirst({
      where: { id, tenantId },
    });
    if (!service) throw new NotFoundException('Serviço não encontrado');
    return service;
  }

  async update(tenantId: string, id: string, dto: UpdateServiceDto) {
    // garante existência e escopo
    await this.findOne(tenantId, id);

    return this.prisma.service.update({
      where: { id },
      data: {
        name: dto.name,
        durationMin: dto.durationMin,
        priceCents: dto.priceCents,
        active: dto.active,
      },
    });
  }

  // “delete” suave: desativa
  async remove(tenantId: string, id: string) {
    await this.findOne(tenantId, id);
    return this.prisma.service.update({
      where: { id },
      data: { active: false },
    });
  }
}
