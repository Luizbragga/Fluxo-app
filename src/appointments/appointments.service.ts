import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { addMinutes, isBefore } from 'date-fns';

@Injectable()
export class AppointmentsService {
  constructor(private prisma: PrismaService) {}

  // garante múltiplos de 30min caso queiras manter esse padrão no MVP
  private static ensureSlot30m(start: Date, end: Date) {
    const diff = (end.getTime() - start.getTime()) / 60000;
    if (diff <= 0 || diff % 30 !== 0) {
      throw new BadRequestException(
        'Intervalo deve ser múltiplo de 30 minutos.',
      );
    }
  }

  // CREATE --------------------------------------------------------------------
  async create(tenantId: string, userId: string, dto: CreateAppointmentDto) {
    const startAt = new Date(dto.startAt);
    const endAt = new Date(dto.endAt);

    if (isBefore(endAt, startAt)) {
      throw new BadRequestException('endAt deve ser após startAt.');
    }
    AppointmentsService.ensureSlot30m(startAt, endAt);

    // validar provider e service pertencem ao tenant
    const provider = await this.prisma.provider.findUnique({
      where: { id: dto.providerId },
    });
    if (!provider || provider.tenantId !== tenantId) {
      throw new ForbiddenException('Provider inválido para este tenant.');
    }

    const service = await this.prisma.service.findUnique({
      where: { id: dto.serviceId },
    });
    if (!service || service.tenantId !== tenantId) {
      throw new ForbiddenException('Service inválido para este tenant.');
    }

    // conflito com BLOCKS
    const hasBlockConflict = await this.prisma.block.findFirst({
      where: {
        tenantId,
        providerId: dto.providerId,
        startAt: { lt: endAt },
        endAt: { gt: startAt },
      },
      select: { id: true },
    });
    if (hasBlockConflict) {
      throw new BadRequestException('Conflito com bloqueio de agenda.');
    }

    // conflito com APPOINTMENTS (ignora cancelados)
    const hasApptConflict = await this.prisma.appointment.findFirst({
      where: {
        tenantId,
        providerId: dto.providerId,
        status: { not: 'cancelled' as any },
        startAt: { lt: endAt },
        endAt: { gt: startAt },
      },
      select: { id: true },
    });
    if (hasApptConflict) {
      throw new BadRequestException('Conflito com outro agendamento.');
    }

    // força duração pelo service.durationMin
    const expectedEnd = addMinutes(startAt, service.durationMin);
    if (expectedEnd.getTime() !== endAt.getTime()) {
      throw new BadRequestException(
        `Duração deve ser ${service.durationMin} minutos.`,
      );
    }

    return this.prisma.appointment.create({
      data: {
        tenantId,
        providerId: dto.providerId,
        serviceId: dto.serviceId,
        startAt,
        endAt,
        clientName: dto.clientName,
        clientPhone: dto.clientPhone,
        createdById: userId,
      },
    });
  }

  // LISTA DO DIA ---------------------------------------------------------------
  async findByDay(tenantId: string, dateYYYYMMDD: string, providerId?: string) {
    const [yStr, mStr, dStr] = dateYYYYMMDD.split('-');
    const y = parseInt(yStr, 10);
    const m = parseInt(mStr, 10);
    const d = parseInt(dStr, 10);

    const start = new Date(Date.UTC(y, m - 1, d, 0, 0, 0));
    const end = new Date(Date.UTC(y, m - 1, d, 23, 59, 59));

    return this.prisma.appointment.findMany({
      where: {
        tenantId,
        startAt: { gte: start },
        endAt: { lte: end },
        ...(providerId ? { providerId } : {}),
      },
      orderBy: { startAt: 'asc' },
      include: {
        service: { select: { id: true, name: true, durationMin: true } },
        provider: { select: { id: true, name: true } },
      },
    });
  }

  // REAGENDAR ------------------------------------------------------------------
  async reschedule(
    tenantId: string,
    appointmentId: string,
    dto: { startAt?: string; endAt?: string },
  ) {
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.appointment.findFirst({
        where: { id: appointmentId, tenantId },
        include: {
          service: { select: { id: true, durationMin: true } },
          provider: { select: { id: true } },
        },
      });
      if (!current)
        throw new NotFoundException('Appointment não encontrado no tenant');

      const startAt = dto.startAt ? new Date(dto.startAt) : current.startAt;
      const endAt = dto.endAt
        ? new Date(dto.endAt)
        : new Date(startAt.getTime() + current.service.durationMin * 60_000);

      if (isNaN(startAt.getTime()))
        throw new BadRequestException('startAt inválido');
      if (isNaN(endAt.getTime()))
        throw new BadRequestException('endAt inválido');
      if (endAt <= startAt)
        throw new BadRequestException('endAt deve ser maior que startAt');

      // conflito com OUTROS appointments (ignora cancelados e o próprio)
      const overlapAppointment = await tx.appointment.findFirst({
        where: {
          tenantId,
          providerId: current.providerId,
          id: { not: current.id },
          status: { not: 'cancelled' as any },
          startAt: { lt: endAt },
          endAt: { gt: startAt },
        },
        select: { id: true },
      });
      if (overlapAppointment) {
        throw new BadRequestException(
          'Conflito com outro appointment no intervalo solicitado',
        );
      }

      // conflito com BLOCKS
      const overlapBlock = await tx.block.findFirst({
        where: {
          tenantId,
          providerId: current.providerId,
          startAt: { lt: endAt },
          endAt: { gt: startAt },
        },
        select: { id: true },
      });
      if (overlapBlock) {
        throw new BadRequestException(
          'Conflito com um block do provider no intervalo solicitado',
        );
      }

      return tx.appointment.update({
        where: { id: current.id },
        data: { startAt, endAt },
        include: {
          service: { select: { id: true, name: true, durationMin: true } },
          provider: { select: { id: true, name: true } },
        },
      });
    });
  }

  // ATUALIZAR STATUS -----------------------------------------------------------
  async updateStatus(
    tenantId: string,
    appointmentId: string,
    status: 'scheduled' | 'in_service' | 'done' | 'no_show' | 'cancelled',
  ) {
    const found = await this.prisma.appointment.findFirst({
      where: { id: appointmentId, tenantId },
      select: { id: true },
    });
    if (!found)
      throw new NotFoundException('Appointment não encontrado no tenant');

    return this.prisma.appointment.update({
      where: { id: appointmentId },
      data: { status: status as any },
      include: {
        service: { select: { id: true, name: true, durationMin: true } },
        provider: { select: { id: true, name: true } },
      },
    });
  }

  // CANCELAMENTO SEGURO (DELETE lógico) ---------------------------------------
  async remove(tenantId: string, id: string) {
    const appt = await this.prisma.appointment.findFirst({
      where: { id, tenantId },
      select: { id: true, status: true },
    });
    if (!appt)
      throw new NotFoundException('Appointment não encontrado no tenant');

    if ((appt.status as any) === 'cancelled') {
      return this.prisma.appointment.findUnique({
        where: { id },
        include: {
          service: { select: { id: true, name: true, durationMin: true } },
          provider: { select: { id: true, name: true } },
        },
      });
    }

    return this.prisma.appointment.update({
      where: { id },
      data: { status: 'cancelled' as any },
      include: {
        service: { select: { id: true, name: true, durationMin: true } },
        provider: { select: { id: true, name: true } },
      },
    });
  }

  // DEBUG HELPERS --------------------------------------------------------------
  findAll() {
    return this.prisma.appointment.findMany({
      orderBy: { startAt: 'asc' },
      include: {
        service: { select: { id: true, name: true, durationMin: true } },
        provider: { select: { id: true, name: true } },
      },
    });
  }

  findOne(id: string) {
    return this.prisma.appointment.findUnique({
      where: { id },
      include: {
        service: { select: { id: true, name: true, durationMin: true } },
        provider: { select: { id: true, name: true } },
      },
    });
  }

  // (opcional) legado — lista do dia por provider (se ainda utilizares em algum lugar)
  async findDay(tenantId: string, providerId: string, dateISO: string) {
    const day = new Date(dateISO);
    const start = new Date(
      Date.UTC(
        day.getUTCFullYear(),
        day.getUTCMonth(),
        day.getUTCDate(),
        0,
        0,
        0,
      ),
    );
    const end = new Date(
      Date.UTC(
        day.getUTCFullYear(),
        day.getUTCMonth(),
        day.getUTCDate(),
        23,
        59,
        59,
      ),
    );

    return this.prisma.appointment.findMany({
      where: {
        tenantId,
        providerId,
        startAt: { gte: start },
        endAt: { lte: end },
      },
      orderBy: { startAt: 'asc' },
      include: {
        service: { select: { id: true, name: true, durationMin: true } },
        provider: { select: { id: true, name: true } },
      },
    });
  }
}
