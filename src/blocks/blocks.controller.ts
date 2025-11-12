import {
  Body,
  Controller,
  Delete,
  Get,
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
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@ApiTags('Blocks')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller({ path: 'v1/blocks' })
export class BlocksController {
  constructor(private readonly blocksService: BlocksService) {}

  // owner | admin | provider
  @Post()
  @Roles('owner', 'admin', 'provider')
  create(@Req() req: any, @Body() dto: CreateBlockDto) {
    const tenantId = req.user?.tenantId as string;
    const user = {
      id: req.user?.sub as string,
      role: req.user?.role as string,
    };
    return this.blocksService.create(tenantId, user, dto);
  }

  // owner | admin
  @Delete(':id')
  @Roles('owner', 'admin')
  remove(@Req() req: any, @Param('id') id: string) {
    const tenantId = req.user?.tenantId as string;
    return this.blocksService.remove(tenantId, id);
  }

  // opcional: listar por dia
  @Get()
  @Roles('owner', 'admin', 'provider')
  list(
    @Req() req: any,
    @Query('providerId') providerId: string,
    @Query('date') date: string,
  ) {
    const tenantId = req.user?.tenantId as string;
    return this.blocksService.listByProviderAndDate(tenantId, providerId, date);
  }
}
