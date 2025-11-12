import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { UpdateAppointmentDto } from './dto/update-appointment.dto';
import { addMinutes, isBefore } from 'date-fns';

@Injectable()
export class AppointmentsService {
  constructor(private prisma: PrismaService) {}

  private static ensureSlot30m(start: Date, end: Date) {
    const diff = (end.getTime() - start.getTime()) / 60000;
    if (diff <= 0 || diff % 30 !== 0) {
      throw new BadRequestException(
        'Intervalo deve ser múltiplo de 30 minutos.',
      );
    }
  }

  async create(tenantId: string, userId: string, dto: CreateAppointmentDto) {
    const startAt = new Date(dto.startAt);
    const endAt = new Date(dto.endAt);

    if (isBefore(endAt, startAt)) {
      throw new BadRequestException('endAt deve ser após startAt.');
    }
    AppointmentsService.ensureSlot30m(startAt, endAt);

    // Valida provider e service do mesmo tenant
    const provider = await this.prisma.provider.findUnique({
      where: { id: dto.providerId },
    });
    if (!provider || provider.tenantId !== tenantId)
      throw new ForbiddenException('Provider inválido para este tenant.');

    const service = await this.prisma.service.findUnique({
      where: { id: dto.serviceId },
    });
    if (!service || service.tenantId !== tenantId)
      throw new ForbiddenException('Service inválido para este tenant.');

    // Checa conflito com BLOCKS (qualquer overlap)
    const hasBlockConflict = await this.prisma.block.findFirst({
      where: {
        tenantId,
        providerId: dto.providerId,
        OR: [
          { startAt: { lt: endAt }, endAt: { gt: startAt } }, // overlap geral
        ],
      },
      select: { id: true },
    });
    if (hasBlockConflict)
      throw new BadRequestException('Conflito com bloqueio de agenda.');

    // Checa conflito com outros appointments (qualquer overlap)
    const hasApptConflict = await this.prisma.appointment.findFirst({
      where: {
        tenantId,
        providerId: dto.providerId,
        OR: [{ startAt: { lt: endAt }, endAt: { gt: startAt } }],
      },
      select: { id: true },
    });
    if (hasApptConflict)
      throw new BadRequestException('Conflito com outro agendamento.');

    // (Opcional) Forçar duração pelo service.durationMin
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
    });
  }

  async remove(tenantId: string, id: string) {
    const appt = await this.prisma.appointment.findUnique({ where: { id } });
    if (!appt || appt.tenantId !== tenantId)
      throw new NotFoundException('Agendamento não encontrado.');
    return this.prisma.appointment.delete({ where: { id } });
  }

  // Gerados pelo schematic – mantemos simples para agora
  findAll() {
    return this.prisma.appointment.findMany();
  }
  findOne(id: string) {
    return this.prisma.appointment.findUnique({ where: { id } });
  }
  update(id: string, _dto: UpdateAppointmentDto) {
    throw new BadRequestException(
      'Use cancel/remove ou remarcação específica.',
    );
  }
}
