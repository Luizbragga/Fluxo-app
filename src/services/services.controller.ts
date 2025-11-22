import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '@prisma/client';

import { ServicesService } from './services.service';
import { CreateServiceDto } from './dto/create-service.dto';
import { UpdateServiceDto } from './dto/update-service.dto';

@ApiTags('Services')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard) // RolesGuard já está global
@Controller('services')
export class ServicesController {
  constructor(private readonly services: ServicesService) {}

  // Cria serviço (apenas owner/admin do tenant)
  @Roles(Role.owner, Role.admin)
  @Post()
  create(@Req() req: Request, @Body() dto: CreateServiceDto) {
    const tenantId = (req as any).user?.tenantId as string;
    return this.services.create(tenantId, dto);
  }

  // Lista serviços do tenant (qualquer usuário autenticado do tenant)
  @Get()
  findAll(@Req() req: Request) {
    const tenantId = (req as any).user?.tenantId as string;
    return this.services.findAll(tenantId);
  }

  // Busca por ID (escopo do tenant)
  @Get(':id')
  findOne(@Req() req: Request, @Param('id') id: string) {
    const tenantId = (req as any).user?.tenantId as string;
    return this.services.findOne(tenantId, id);
  }

  // Atualiza serviço (apenas owner/admin)
  @Roles(Role.owner, Role.admin)
  @Patch(':id')
  update(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() dto: UpdateServiceDto,
  ) {
    const tenantId = (req as any).user?.tenantId as string;
    return this.services.update(tenantId, id, dto);
  }

  // “Delete” (desativar) serviço (apenas owner/admin)
  @Roles(Role.owner, Role.admin)
  @Delete(':id')
  remove(@Req() req: Request, @Param('id') id: string) {
    const tenantId = (req as any).user?.tenantId as string;
    return this.services.remove(tenantId, id);
  }
}
