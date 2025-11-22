import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Req,
  UseGuards,
  Query,
  BadRequestException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiQuery } from '@nestjs/swagger';

import { ProvidersService } from './providers.service';
import { CreateProviderDto } from './dto/create-provider.dto';
import { UpdateProviderDto } from './dto/update-provider.dto';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '@prisma/client';

@ApiTags('Providers')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard) // RolesGuard global, guard de auth aqui
@Controller('providers')
export class ProvidersController {
  constructor(private readonly providersService: ProvidersService) {}

  // owner/admin podem criar provider
  @Roles(Role.owner, Role.admin)
  @Post()
  create(@Req() req: any, @Body() dto: CreateProviderDto) {
    const { tenantId } = req.user as { tenantId: string };
    return this.providersService.create(tenantId, dto);
  }

  // qualquer autenticado do tenant pode listar
  @Get()
  findAll(@Req() req: any) {
    const { tenantId } = req.user as { tenantId: string };
    return this.providersService.findAll(tenantId);
  }

  // qualquer autenticado do tenant pode ler um provider
  @Get(':id')
  findOne(@Req() req: any, @Param('id') id: string) {
    const { tenantId } = req.user as { tenantId: string };
    return this.providersService.findOne(tenantId, id);
  }

  // disponibilidade por dia (owner/admin/attendant/provider)
  @Roles(Role.owner, Role.admin, Role.attendant, Role.provider)
  @Get(':id/availability')
  @ApiQuery({
    name: 'date',
    required: true,
    type: String,
    example: '2025-11-17',
    description: 'Data no formato YYYY-MM-DD (UTC)',
  })
  async getAvailability(
    @Req() req: any,
    @Param('id') id: string,
    @Query('date') date: string,
  ) {
    const tenantId = req.user?.tenantId as string;

    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new BadRequestException('Param "date" deve ser YYYY-MM-DD');
    }

    return this.providersService.getDayAvailability({
      tenantId,
      providerId: id,
      dateISO: date,
    });
  }

  // slots reserváveis para um provider no dia, considerando a duração do service
  @Roles(Role.owner, Role.admin, Role.attendant, Role.provider)
  @Get(':id/slots')
  @ApiQuery({
    name: 'date',
    required: true,
    type: String,
    example: '2025-11-17',
    description: 'Data no formato YYYY-MM-DD (UTC)',
  })
  @ApiQuery({
    name: 'serviceId',
    required: true,
    type: String,
    example: 'cmhvvsuip0006uyqsdne4267g',
    description: 'Service (cuid) para definir a duração do slot',
  })
  async getSlots(
    @Req() req: any,
    @Param('id') id: string,
    @Query('date') date: string,
    @Query('serviceId') serviceId: string,
  ) {
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new BadRequestException('Param "date" deve ser YYYY-MM-DD');
    }

    // validação básica de cuid (opcional, mas evita lixo)
    if (!/^c[a-z0-9]{24}$/i.test(serviceId)) {
      throw new BadRequestException(
        'Param "serviceId" deve ser um cuid válido',
      );
    }

    const tenantId = req.user?.tenantId as string;

    return this.providersService.getDaySlots({
      tenantId,
      providerId: id,
      serviceId,
      dateISO: date,
    });
  }

  // owner/admin podem atualizar provider
  @Roles(Role.owner, Role.admin)
  @Patch(':id')
  update(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateProviderDto,
  ) {
    const { tenantId } = req.user as { tenantId: string };
    return this.providersService.update(tenantId, id, dto);
  }

  // owner/admin podem remover provider
  @Roles(Role.owner, Role.admin)
  @Delete(':id')
  remove(@Req() req: any, @Param('id') id: string) {
    const { tenantId } = req.user as { tenantId: string };
    return this.providersService.remove(tenantId, id);
  }
}
