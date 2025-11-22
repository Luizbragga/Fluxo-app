import {
  Body,
  Controller,
  Delete,
  Get,
  Patch,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { BlocksService } from './blocks.service';
import { CreateBlockDto } from './dto/create-block.dto';
import { UpdateBlockDto } from './dto/update-block.dto';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '@prisma/client';

@ApiTags('Blocks')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('blocks')
export class BlocksController {
  constructor(private readonly blocksService: BlocksService) {}

  // owner | admin | provider podem criar bloqueios
  @Roles(Role.owner, Role.admin, Role.provider)
  @Post()
  create(@Req() req: any, @Body() dto: CreateBlockDto) {
    const tenantId = req.user?.tenantId as string;
    const user = {
      id: req.user?.id as string,
      role: req.user?.role as Role,
    };
    return this.blocksService.create(tenantId, user, dto);
  }

  // owner | admin | attendant | provider podem atualizar bloqueios
  @Roles(Role.owner, Role.admin, Role.attendant, Role.provider)
  @Patch(':id')
  update(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateBlockDto,
  ) {
    const tenantId = req.user?.tenantId as string;
    return this.blocksService.update(tenantId, id, dto);
  }

  // owner | admin removem bloqueios
  @Roles(Role.owner, Role.admin)
  @Delete(':id')
  remove(@Req() req: any, @Param('id') id: string) {
    const tenantId = req.user?.tenantId as string;
    return this.blocksService.remove(tenantId, id);
  }

  // owner | admin | provider listam bloqueios (por provider + date)
  @Roles(Role.owner, Role.admin, Role.provider)
  @Get()
  list(
    @Req() req: any,
    @Query('providerId') providerId: string,
    @Query('date') date: string,
  ) {
    const tenantId = req.user?.tenantId as string;
    return this.blocksService.listByProviderAndDate(tenantId, providerId, date);
  }
}
