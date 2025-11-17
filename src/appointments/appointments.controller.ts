import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  Req,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiTags,
  ApiQuery,
  ApiBody,
  getSchemaPath,
} from '@nestjs/swagger';
import { AppointmentsService } from './appointments.service';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { ListAppointmentsDayQueryDto } from './dto/list-day.query.dto';
import { RescheduleAppointmentDto } from './dto/reschedule-appointment.dto';
import { UpdateAppointmentStatusDto } from './dto/update-status.dto';

@ApiTags('Appointments')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('appointments')
export class AppointmentsController {
  constructor(private readonly appointmentsService: AppointmentsService) {}

  @Roles('owner', 'admin', 'attendant', 'provider')
  @Post()
  create(@Req() req: any, @Body() dto: CreateAppointmentDto) {
    const tenantId = req.user?.tenantId;
    const userId = req.user?.id;
    return this.appointmentsService.create(tenantId, userId, dto);
  }

  @Roles('owner', 'admin', 'attendant', 'provider')
  @Get()
  @ApiQuery({
    name: 'date',
    required: true,
    type: String,
    example: '2025-11-17',
    description: 'Data no formato YYYY-MM-DD (UTC)',
  })
  @ApiQuery({
    name: 'providerId',
    required: false,
    type: String,
    example: 'cxxxxxxxxxxxxxxxxxxxxxxxxxxx',
    description: 'Opcional: filtra por provider',
  })
  listDayQuery(@Req() req: any, @Query() query: ListAppointmentsDayQueryDto) {
    const tenantId = req.user?.tenantId as string;
    return this.appointmentsService.findByDay(
      tenantId,
      query.date,
      query.providerId,
    );
  }

  @Roles('owner', 'admin', 'attendant', 'provider')
  @Patch(':id')
  @ApiBody({
    description:
      'Envie { status } para mudar status OU { startAt, endAt } para reagendar.',
    schema: {
      oneOf: [
        { $ref: getSchemaPath(UpdateAppointmentStatusDto) },
        { $ref: getSchemaPath(RescheduleAppointmentDto) },
      ],
    },
  })
  updateFlexible(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: RescheduleAppointmentDto & UpdateAppointmentStatusDto,
  ) {
    const tenantId = req.user?.tenantId as string;

    // mudar status?
    if (typeof (body as any).status === 'string') {
      const { status } = body as UpdateAppointmentStatusDto;
      return this.appointmentsService.updateStatus(tenantId, id, status);
    }

    // reagendar?
    if ((body as any).startAt || (body as any).endAt) {
      const { startAt, endAt } = body as RescheduleAppointmentDto;
      if (!startAt && !endAt) {
        throw new BadRequestException(
          'Envie startAt e/ou endAt para reagendar',
        );
      }
      return this.appointmentsService.reschedule(tenantId, id, {
        startAt,
        endAt,
      });
    }

    throw new BadRequestException(
      'Envie { status } para mudar status OU { startAt, endAt } para reagendar.',
    );
  }

  @Roles('owner', 'admin', 'attendant', 'provider')
  @Delete(':id')
  remove(@Req() req: any, @Param('id') id: string) {
    return this.appointmentsService.remove(req.user?.tenantId, id);
  }
}
