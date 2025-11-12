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
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ProvidersService } from './providers.service';
import { CreateProviderDto } from './dto/create-provider.dto';
import { UpdateProviderDto } from './dto/update-provider.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { AvailabilityQueryDto } from './dto/availability-query.dto';
import { Request } from 'express';

@ApiTags('Providers')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller({ path: 'providers' })
export class ProvidersController {
  constructor(private readonly providersService: ProvidersService) {}

  // owner/admin podem criar
  @Roles('owner', 'admin')
  @Post()
  create(@Req() req: any, @Body() dto: CreateProviderDto) {
    const { tenantId } = req.user as { tenantId: string };
    return this.providersService.create(tenantId, dto);
  }

  // qualquer autenticado do tenant pode listar/ler
  @Get()
  findAll(@Req() req: any) {
    const { tenantId } = req.user as { tenantId: string };
    return this.providersService.findAll(tenantId);
  }

  @Get(':id')
  findOne(@Req() req: any, @Param('id') id: string) {
    const { tenantId } = req.user as { tenantId: string };
    return this.providersService.findOne(tenantId, id);
  }

  // owner/admin podem atualizar
  @Roles('owner', 'admin')
  @Patch(':id')
  update(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateProviderDto,
  ) {
    const { tenantId } = req.user as { tenantId: string };
    return this.providersService.update(tenantId, id, dto);
  }

  // owner/admin podem remover
  @Roles('owner', 'admin')
  @Delete(':id')
  remove(@Req() req: any, @Param('id') id: string) {
    const { tenantId } = req.user as { tenantId: string };
    return this.providersService.remove(tenantId, id);
  }

  @Get(':id/availability')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiTags('Providers')
  async availability(
    @Param('id') id: string,
    @Query() query: AvailabilityQueryDto,
    @Req() req: Request & { user?: any },
  ) {
    const tenantId = req.user?.tenantId;
    return this.providersService.getDayAvailability({
      tenantId,
      providerId: id,
      dateISO: `${query.date}T00:00:00Z`,
    });
  }
}
