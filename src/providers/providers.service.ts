import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProviderDto } from './dto/create-provider.dto';
import { UpdateProviderDto } from './dto/update-provider.dto';
/** Converte 'HH:mm' -> minutos desde 00:00 */
function toMin(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}
/** Converte minutos -> 'HH:mm' com zero-left */
function toHHMM(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Subtrai uma lista de blocos (em minutos) de uma lista de intervalos (em minutos) */
function subtractBlocks(
  intervals: { start: number; end: number }[],
  blocks: { start: number; end: number }[],
): { start: number; end: number }[] {
  let result = [...intervals];

  for (const b of blocks) {
    const next: { start: number; end: number }[] = [];
    for (const it of result) {
      // sem interseção: mantém
      if (b.end <= it.start || b.start >= it.end) {
        next.push(it);
        continue;
      }
      // há interseção: recorta em até duas partes
      if (b.start > it.start) {
        next.push({
          start: it.start,
          end: Math.max(it.start, Math.min(b.start, it.end)),
        });
      }
      if (b.end < it.end) {
        next.push({
          start: Math.min(Math.max(b.end, it.start), it.end),
          end: it.end,
        });
      }
    }
    result = next;
  }

  // remove fragmentos vazios/invertidos
  return result.filter((r) => r.end - r.start > 0);
}

@Injectable()
export class ProvidersService {
  constructor(private readonly prisma: PrismaService) {}

  // cria provider garantindo que user pertence ao mesmo tenant e não está vinculado ainda
  async create(tenantId: string, dto: CreateProviderDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: dto.userId },
      select: { id: true, tenantId: true, provider: { select: { id: true } } },
    });

    if (!user || user.tenantId !== tenantId) {
      throw new BadRequestException('userId inválido para este tenant');
    }
    if (user.provider) {
      throw new BadRequestException(
        'Este usuário já está vinculado a um provider',
      );
    }

    const provider = await this.prisma.provider.create({
      data: {
        tenantId,
        userId: dto.userId,
        name: dto.name,
        specialty: dto.specialty ?? 'other',
        weekdayTemplate: dto.weekdayTemplate ?? undefined,
        active: dto.active ?? true,
      },
    });

    return provider;
  }

  async findAll(tenantId: string) {
    return this.prisma.provider.findMany({
      where: { tenantId },
      orderBy: { name: 'asc' },
      include: {
        user: { select: { id: true, email: true, name: true, role: true } },
      },
    });
  }

  async findOne(tenantId: string, id: string) {
    const provider = await this.prisma.provider.findFirst({
      where: { id, tenantId },
      include: {
        user: { select: { id: true, email: true, name: true, role: true } },
      },
    });
    if (!provider) throw new NotFoundException('Provider não encontrado');
    return provider;
  }

  async update(tenantId: string, id: string, dto: UpdateProviderDto) {
    // garante pertença ao tenant
    const exists = await this.prisma.provider.findFirst({
      where: { id, tenantId },
    });
    if (!exists) throw new NotFoundException('Provider não encontrado');

    // se trocar userId, validar vínculo/tenant
    if (dto.userId && dto.userId !== exists.userId) {
      const u = await this.prisma.user.findUnique({
        where: { id: dto.userId },
        select: {
          id: true,
          tenantId: true,
          provider: { select: { id: true } },
        },
      });
      if (!u || u.tenantId !== tenantId) {
        throw new BadRequestException('userId inválido para este tenant');
      }
      if (u.provider) {
        throw new BadRequestException(
          'Este usuário já está vinculado a um provider',
        );
      }
    }

    return this.prisma.provider.update({
      where: { id },
      data: {
        name: dto.name ?? undefined,
        userId: dto.userId ?? undefined,
        specialty: dto.specialty ?? undefined,
        weekdayTemplate: dto.weekdayTemplate ?? undefined,
        active: dto.active ?? undefined,
      },
    });
  }

  async remove(tenantId: string, id: string) {
    const exists = await this.prisma.provider.findFirst({
      where: { id, tenantId },
    });
    if (!exists) throw new NotFoundException('Provider não encontrado');
    await this.prisma.provider.delete({ where: { id } });
    return { ok: true };
  }
  async getDayAvailability(params: {
    tenantId: string;
    providerId: string;
    dateISO: string;
  }) {
    const { tenantId, providerId, dateISO } = params;

    // 1) Carrega provider (com template)
    const provider = await this.prisma.provider.findFirst({
      where: { id: providerId, tenantId },
      select: { id: true, weekdayTemplate: true, active: true },
    });
    if (!provider || !provider.active) {
      throw new Error('Provider não encontrado ou inativo');
    }

    // 2) Determina dia da semana (mon..sun) na sua mesma convenção do template
    const date = new Date(dateISO);
    const weekdayIndex = date.getUTCDay(); // 0=Dom,1=Seg,...,6=Sáb
    const keyMap = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
    const weekdayKey = keyMap[weekdayIndex];

    // 3) Lê intervalos do template para esse dia
    const template =
      (provider.weekdayTemplate as Record<string, [string, string][]> | null) ??
      {};
    const rawIntervals = template[weekdayKey] ?? [];

    // Em minutos
    const dayIntervals = rawIntervals.map(([start, end]) => ({
      start: toMin(start),
      end: toMin(end),
    }));

    // Se não tiver intervalo, retorna vazio logo
    if (dayIntervals.length === 0) {
      return {
        providerId,
        date: dateISO.slice(0, 10),
        weekday: weekdayKey,
        intervals: [],
      };
    }

    // 4) Busca blocks que toquem o dia (qualquer sobreposição com o dia alvo)
    const dayStart = new Date(
      Date.UTC(
        date.getUTCFullYear(),
        date.getUTCMonth(),
        date.getUTCDate(),
        0,
        0,
        0,
      ),
    );
    const dayEnd = new Date(
      Date.UTC(
        date.getUTCFullYear(),
        date.getUTCMonth(),
        date.getUTCDate(),
        23,
        59,
        59,
      ),
    );

    const blocks = await this.prisma.block.findMany({
      where: {
        tenantId,
        providerId,
        // sobrepõe o dia: start < dayEnd && end > dayStart
        startAt: { lt: dayEnd },
        endAt: { gt: dayStart },
      },
      select: { startAt: true, endAt: true },
      orderBy: { startAt: 'asc' },
    });

    // 5) Converte blocks para [start,end] em minutos (recortados ao dia)
    const blockRanges = blocks.map((b) => {
      const s = Math.max(
        0,
        Math.floor((b.startAt.getTime() - dayStart.getTime()) / 60000),
      );
      const e = Math.min(
        24 * 60,
        Math.ceil((b.endAt.getTime() - dayStart.getTime()) / 60000),
      );
      return { start: s, end: e };
    });

    // 6) Subtrai blocks dos intervalos do template
    const free = subtractBlocks(dayIntervals, blockRanges);

    // 7) Responde no formato original ('HH:mm')
    return {
      providerId,
      date: dateISO.slice(0, 10),
      weekday: weekdayKey,
      intervals: free.map((r) => ({
        start: toHHMM(r.start),
        end: toHHMM(r.end),
      })),
    };
  }
}
