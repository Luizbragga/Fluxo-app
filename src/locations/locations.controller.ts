import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { LocationsService } from './locations.service';
import { CreateLocationDto } from './dto/create-location.dto';
import { UpdateLocationDto } from './dto/update-location.dto';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@ApiTags('Locations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('locations')
export class LocationsController {
  constructor(private readonly locationsService: LocationsService) {}

  // owner / admin / attendant podem listar as locations do tenant
  @Get()
  @Roles('owner', 'admin', 'attendant')
  findAll(@Req() req: any) {
    const tenantId = req.user?.tenantId as string;
    return this.locationsService.findAll(tenantId);
  }

  // owner / admin podem criar nova filial
  @Post()
  @Roles('owner', 'admin')
  create(@Req() req: any, @Body() dto: CreateLocationDto) {
    const tenantId = req.user?.tenantId as string;
    return this.locationsService.create(tenantId, dto);
  }

  // qualquer perfil autenticado do tenant pode consultar uma location específica
  @Get(':id')
  @Roles('owner', 'admin', 'attendant', 'provider')
  findOne(@Req() req: any, @Param('id') id: string) {
    const tenantId = req.user?.tenantId as string;
    return this.locationsService.findOne(tenantId, id);
  }

  // owner / admin podem editar uma filial
  @Patch(':id')
  @Roles('owner', 'admin')
  update(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateLocationDto,
  ) {
    const tenantId = req.user?.tenantId as string;
    return this.locationsService.update(tenantId, id, dto);
  }

  // owner / admin podem remover (soft-delete lógico que implementámos no service)
  @Delete(':id')
  @Roles('owner', 'admin')
  remove(@Req() req: any, @Param('id') id: string) {
    const tenantId = req.user?.tenantId as string;
    return this.locationsService.remove(tenantId, id);
  }
}
