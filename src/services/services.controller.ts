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
import { ServicesService } from './services.service';
import { CreateServiceDto } from './dto/create-service.dto';
import { UpdateServiceDto } from './dto/update-service.dto';

@ApiTags('Services')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('services')
export class ServicesController {
  constructor(private readonly services: ServicesService) {}

  // Cria serviço (escopo do tenant do usuário autenticado)
  @Post()
  create(@Req() req: Request, @Body() dto: CreateServiceDto) {
    const tenantId = (req as any).user?.tenantId as string;
    return this.services.create(tenantId, dto);
  }

  // Lista serviços do tenant
  @Get()
  findAll(@Req() req: Request) {
    const tenantId = (req as any).user?.tenantId as string;
    return this.services.findAll(tenantId);
  }

  // Busca por ID (escopo)
  @Get(':id')
  findOne(@Req() req: Request, @Param('id') id: string) {
    const tenantId = (req as any).user?.tenantId as string;
    return this.services.findOne(tenantId, id);
  }

  // Atualiza (escopo)
  @Patch(':id')
  update(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() dto: UpdateServiceDto,
  ) {
    const tenantId = (req as any).user?.tenantId as string;
    return this.services.update(tenantId, id, dto);
  }

  // “Delete” (desativar)
  @Delete(':id')
  remove(@Req() req: Request, @Param('id') id: string) {
    const tenantId = (req as any).user?.tenantId as string;
    return this.services.remove(tenantId, id);
  }
}
