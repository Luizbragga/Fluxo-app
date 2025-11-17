import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateBlockDto } from './dto/create-block.dto';
import { UpdateBlockDto } from './dto/update-block.dto';

@Injectable()
export class BlocksService {
  constructor(private prisma: PrismaService) {}

  /**
   * Cria um bloco garantindo:
   * - provider pertence ao tenant do usuário
   * - intervalo válido (start < end)
   * - sem sobreposição com outros blocks no mesmo provider
   */
  async create(
    tenantId: string,
    user: { id: string; role: string },
    dto: CreateBlockDto,
  ) {
    const provider = await this.prisma.provider.findFirst({
      where: { id: dto.providerId, tenantId },
      select: { id: true, userId: true },
    });
    if (!provider)
      throw new BadRequestException('providerId inválido para este tenant');

    // Se o usuário for "provider", só pode bloquear a própria agenda
    if (user.role === 'provider' && provider.userId !== user.id) {
      throw new ForbiddenException(
        'Sem permissão para bloquear outro provider',
      );
    }

    const start = new Date(dto.startAt);
    const end = new Date(dto.endAt);
    if (!(start < end))
      throw new BadRequestException('startAt deve ser menor que endAt');

    // Checa sobreposição simples
    const overlap = await this.prisma.block.count({
      where: {
        tenantId,
        providerId: provider.id,
        // (start < existing.end) AND (end > existing.start)
        startAt: { lt: end },
        endAt: { gt: start },
      },
    });
    if (overlap > 0)
      throw new BadRequestException('Intervalo conflita com outro bloqueio');

    return this.prisma.block.create({
      data: {
        tenantId,
        providerId: provider.id,
        startAt: start,
        endAt: end,
        reason: dto.reason ?? null,
      },
    });
  }

  async remove(tenantId: string, id: string) {
    const found = await this.prisma.block.findFirst({
      where: { id, tenantId },
    });
    if (!found) throw new NotFoundException('Block não encontrado');
    await this.prisma.block.delete({ where: { id } });
    return { deleted: true };
  }

  // (Opcional) listar por provider e dia
  async listByProviderAndDate(
    tenantId: string,
    providerId: string,
    dateISO: string,
  ) {
    const day = new Date(dateISO);
    const next = new Date(day);
    next.setUTCDate(day.getUTCDate() + 1);

    return this.prisma.block.findMany({
      where: {
        tenantId,
        providerId,
        startAt: { lt: next },
        endAt: { gt: day },
      },
      orderBy: { startAt: 'asc' },
    });
  }
  async update(
    tenantId: string,
    id: string,
    dto: { startAt?: string; endAt?: string; reason?: string },
  ) {
    // 1) pegar o bloqueio e validar tenant
    const existing = await this.prisma.block.findUnique({ where: { id } });
    if (!existing || existing.tenantId !== tenantId) {
      throw new ForbiddenException('Block inválido para este tenant.');
    }

    // 2) montar dados novos (mantendo o que não foi enviado)
    const startAt = dto.startAt ?? existing.startAt.toISOString();
    const endAt = dto.endAt ?? existing.endAt.toISOString();

    if (new Date(startAt) >= new Date(endAt)) {
      throw new BadRequestException('startAt deve ser anterior a endAt.');
    }

    // 3) validar conflitos com outros blocks/appointments do mesmo provider
    const overlaps = await this.prisma.appointment.findFirst({
      where: {
        tenantId,
        providerId: existing.providerId,
        // (start < endAt && end > startAt)
        startAt: { lt: new Date(endAt) },
        endAt: { gt: new Date(startAt) },
        status: { in: ['scheduled', 'in_service'] },
        id: { not: undefined }, // só para clareza
      },
      select: { id: true },
    });

    if (overlaps) {
      throw new BadRequestException('Conflito com outro agendamento.');
    }

    const overlapBlock = await this.prisma.block.findFirst({
      where: {
        tenantId,
        providerId: existing.providerId,
        id: { not: id },
        startAt: { lt: new Date(endAt) },
        endAt: { gt: new Date(startAt) },
      },
      select: { id: true },
    });

    if (overlapBlock) {
      throw new BadRequestException('Conflito com outro bloqueio.');
    }

    // 4) persistir
    return this.prisma.block.update({
      where: { id },
      data: {
        startAt: new Date(startAt),
        endAt: new Date(endAt),
        reason: dto.reason ?? existing.reason,
      },
    });
  }
}
