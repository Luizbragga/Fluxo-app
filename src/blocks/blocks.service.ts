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
}
