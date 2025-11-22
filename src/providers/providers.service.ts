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
/** Mescla ranges sobrepostos/colados (minutos) */
function mergeRanges(ranges: { start: number; end: number }[]) {
  if (ranges.length === 0) return [];
  const ordered = [...ranges].sort((a, b) => a.start - b.start);
  const merged: { start: number; end: number }[] = [ordered[0]];
  for (let i = 1; i < ordered.length; i++) {
    const last = merged[merged.length - 1];
    const cur = ordered[i];
    if (cur.start <= last.end) {
      last.end = Math.max(last.end, cur.end);
    } else {
      merged.push({ ...cur });
    }
  }
  return merged;
}

@Injectable()
export class ProvidersService {
  constructor(private readonly prisma: PrismaService) {}

  // cria provider garantindo que user e location pertencem ao mesmo tenant
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

    // valida se a location pertence ao mesmo tenant
    const location = await this.prisma.location.findFirst({
      where: { id: dto.locationId, tenantId },
      select: { id: true },
    });

    if (!location) {
      throw new BadRequestException('locationId inválido para este tenant');
    }

    const provider = await this.prisma.provider.create({
      data: {
        tenantId,
        userId: dto.userId,
        locationId: dto.locationId,
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
        location: { select: { id: true, name: true, slug: true } },
      },
    });
  }

  async findOne(tenantId: string, id: string) {
    const provider = await this.prisma.provider.findFirst({
      where: { id, tenantId },
      include: {
        user: { select: { id: true, email: true, name: true, role: true } },
        location: { select: { id: true, name: true, slug: true } },
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

    // se trocar locationId, validar que pertence ao mesmo tenant
    if (dto.locationId && dto.locationId !== exists.locationId) {
      const loc = await this.prisma.location.findFirst({
        where: { id: dto.locationId, tenantId },
        select: { id: true },
      });

      if (!loc) {
        throw new BadRequestException('locationId inválido para este tenant');
      }
    }

    return this.prisma.provider.update({
      where: { id },
      data: {
        name: dto.name ?? undefined,
        userId: dto.userId ?? undefined,
        locationId: dto.locationId ?? undefined,
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
    dateISO: string; // formato YYYY-MM-DD ou ISO completo; usaremos só a data UTC
  }) {
    const { tenantId, providerId, dateISO } = params;

    // 1) Provider do tenant (e ativo)
    const provider = await this.prisma.provider.findFirst({
      where: { id: providerId, tenantId },
      select: { id: true, weekdayTemplate: true, active: true, tenantId: true },
    });
    if (!provider) throw new NotFoundException('Provider não encontrado');
    if (!provider.active) throw new BadRequestException('Provider inativo');

    // 2) Janela do dia (UTC)
    const date = new Date(dateISO);
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException('dateISO inválido; use YYYY-MM-DD');
    }
    const y = date.getUTCFullYear();
    const m = date.getUTCMonth();
    const d = date.getUTCDate();

    const dayStart = new Date(Date.UTC(y, m, d, 0, 0, 0));
    const dayEnd = new Date(Date.UTC(y, m, d, 23, 59, 59));

    const keyMap = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
    const weekdayKey = keyMap[dayStart.getUTCDay()];

    // 3) Intervalos de template (HH:mm) -> minutos no dia
    const template =
      (provider.weekdayTemplate as Record<string, [string, string][]> | null) ??
      {};
    const rawIntervals = template[weekdayKey] ?? [];

    const dayIntervals = rawIntervals
      .map(([start, end]) => {
        const s = toMin(start);
        const e = toMin(end);
        return { start: Math.max(0, s), end: Math.min(24 * 60, e) };
      })
      .filter((r) => r.end > r.start);

    if (dayIntervals.length === 0) {
      return {
        providerId,
        date: `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(
          2,
          '0',
        )}`,
        weekday: weekdayKey,
        intervals: [],
      };
    }

    // 4) Blocks que sobrepõem o dia
    const blocks = await this.prisma.block.findMany({
      where: {
        tenantId,
        providerId,
        startAt: { lt: dayEnd },
        endAt: { gt: dayStart },
      },
      select: { startAt: true, endAt: true },
      orderBy: { startAt: 'asc' },
    });

    // 5) Appointments (ignora cancelados) que sobrepõem o dia
    const appts = await this.prisma.appointment.findMany({
      where: {
        tenantId,
        providerId,
        status: { not: 'cancelled' as any },
        startAt: { lt: dayEnd },
        endAt: { gt: dayStart },
      },
      select: { startAt: true, endAt: true },
      orderBy: { startAt: 'asc' },
    });

    // 6) Ambos convertidos para minutos no dia
    const toRangeMin = (s: Date, e: Date) => ({
      start: Math.max(
        0,
        Math.floor((s.getTime() - dayStart.getTime()) / 60000),
      ),
      end: Math.min(
        24 * 60,
        Math.ceil((e.getTime() - dayStart.getTime()) / 60000),
      ),
    });

    const takenRaw = [
      ...blocks.map((b) => toRangeMin(b.startAt, b.endAt)),
      ...appts.map((a) => toRangeMin(a.startAt, a.endAt)),
    ].filter((r) => r.end > r.start);

    // 7) Mescla ranges ocupados sobrepostos para recorte mais limpo
    const taken = mergeRanges(takenRaw);

    // 8) Subtrai ocupados (blocks + appts) dos livres do template
    const free = subtractBlocks(dayIntervals, taken);

    // 9) Retorno em HH:mm (como já estavas fazendo)
    return {
      providerId,
      date: `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(
        2,
        '0',
      )}`,
      weekday: weekdayKey,
      intervals: free.map((r) => ({
        start: toHHMM(r.start),
        end: toHHMM(r.end),
      })),
    };
  }

  async getDaySlots(params: {
    tenantId: string;
    providerId: string;
    serviceId: string; // para conhecer a duração (durationMin)
    dateISO: string; // 'YYYY-MM-DD'
  }) {
    const { tenantId, providerId, serviceId, dateISO } = params;

    // 0) Carrega provider + template e o service (para durationMin)
    const [provider, service] = await Promise.all([
      this.prisma.provider.findFirst({
        where: { id: providerId, tenantId },
        select: { id: true, weekdayTemplate: true, active: true },
      }),
      this.prisma.service.findFirst({
        where: { id: serviceId, tenantId },
        select: { id: true, durationMin: true, active: true },
      }),
    ]);

    if (!provider || !provider.active) {
      throw new Error('Provider não encontrado ou inativo');
    }
    if (!service || !service.active) {
      throw new Error('Service não encontrado ou inativo');
    }
    const duration = service.durationMin; // minutos

    // 1) Determina o dia/limites (UTC)
    const date = new Date(dateISO);
    if (isNaN(date.getTime())) throw new Error('dateISO inválido');

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

    // 2) Intervalos do template para o dia
    const weekdayIndex = date.getUTCDay(); // 0..6
    const keyMap = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
    const weekdayKey = keyMap[weekdayIndex];

    const template =
      (provider.weekdayTemplate as Record<string, [string, string][]> | null) ??
      {};
    const rawIntervals = template[weekdayKey] ?? [];
    let free = rawIntervals.map(([start, end]) => ({
      start: toMin(start),
      end: toMin(end),
    }));

    if (free.length === 0) {
      return {
        providerId,
        serviceId,
        date: dateISO,
        weekday: weekdayKey,
        slots: [] as { startAt: string; endAt: string }[],
      };
    }

    // 3) Blocks que toquem o dia
    const blocks = await this.prisma.block.findMany({
      where: {
        tenantId,
        providerId,
        startAt: { lt: dayEnd },
        endAt: { gt: dayStart },
      },
      select: { startAt: true, endAt: true },
      orderBy: { startAt: 'asc' },
    });

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

    // Subtrai blocks do template
    free = subtractBlocks(free, blockRanges);

    if (free.length === 0) {
      return {
        providerId,
        serviceId,
        date: dateISO,
        weekday: weekdayKey,
        slots: [] as { startAt: string; endAt: string }[],
      };
    }

    // 4) Ocupações por appointments (≠ cancelled) que toquem o dia
    const appts = await this.prisma.appointment.findMany({
      where: {
        tenantId,
        providerId,
        startAt: { lt: dayEnd },
        endAt: { gt: dayStart },
        status: { not: 'cancelled' as any },
      },
      select: { startAt: true, endAt: true },
      orderBy: { startAt: 'asc' },
    });

    const busyApptRanges = appts.map((a) => {
      const s = Math.max(
        0,
        Math.floor((a.startAt.getTime() - dayStart.getTime()) / 60000),
      );
      const e = Math.min(
        24 * 60,
        Math.ceil((a.endAt.getTime() - dayStart.getTime()) / 60000),
      );
      return { start: s, end: e };
    });

    // Subtrai agendamentos da disponibilidade restante
    free = subtractBlocks(free, busyApptRanges);

    // 5) Geração de slots (passo de 15 min), respeitando a duração do service
    const STEP = 15; // minutos
    const slots: { startAt: string; endAt: string }[] = [];

    for (const range of free) {
      for (let m = range.start; m + duration <= range.end; m += STEP) {
        const startMin = m;
        const endMin = m + duration;
        if (endMin <= range.end) {
          const startAt = new Date(
            dayStart.getTime() + startMin * 60000,
          ).toISOString();
          const endAt = new Date(
            dayStart.getTime() + endMin * 60000,
          ).toISOString();
          slots.push({ startAt, endAt });
        }
      }
    }

    return {
      providerId,
      serviceId,
      date: dateISO,
      weekday: weekdayKey,
      durationMin: duration,
      stepMin: STEP,
      slots,
    };
  }
}
