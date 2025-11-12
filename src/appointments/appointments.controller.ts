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
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { AppointmentsService } from './appointments.service';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { UpdateAppointmentDto } from './dto/update-appointment.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

class DayQueryDto {
  date!: string;
} // simples: já mandamos ISO em query

@ApiTags('Appointments')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('/v1/appointments')
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
  @Get(':providerId/day')
  listDay(
    @Req() req: any,
    @Param('providerId') providerId: string,
    @Query() query: DayQueryDto,
  ) {
    return this.appointmentsService.findDay(
      req.user?.tenantId,
      providerId,
      query.date,
    );
  }

  @Roles('owner', 'admin', 'attendant', 'provider')
  @Delete(':id')
  remove(@Req() req: any, @Param('id') id: string) {
    return this.appointmentsService.remove(req.user?.tenantId, id);
  }

  // endpoints gerados — úteis para debug
  @Get() findAll() {
    return this.appointmentsService.findAll();
  }
  @Get('one/:id') findOne(@Param('id') id: string) {
    return this.appointmentsService.findOne(id);
  }
  @Patch('one/:id') update(
    @Param('id') id: string,
    @Body() dto: UpdateAppointmentDto,
  ) {
    return this.appointmentsService.update(id, dto);
  }
}
