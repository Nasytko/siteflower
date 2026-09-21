import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { RequirePermissions } from '../auth/decorators';
import { CurrentAdmin, type AuthenticatedAdmin } from '../auth/current-admin.decorator';
import { getRequestId } from '../common/middleware/request-id.middleware';
import {
  AdminOrderListQueryDto,
  CancelOrderBodyDto,
  TransitionOrderBodyDto,
} from './orders.dto';
import { OrdersService } from './orders.service';

@ApiTags('admin-orders')
@Controller('admin/orders')
export class AdminOrdersController {
  constructor(private readonly orders: OrdersService) {}

  @RequirePermissions('ORDERS_READ')
  @Get()
  list(@Query() query: AdminOrderListQueryDto) {
    return this.orders.listAdmin(query);
  }

  @RequirePermissions('ORDERS_READ')
  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.orders.getAdmin(id);
  }

  @RequirePermissions('ORDERS_UPDATE')
  @Post(':id/transition')
  transition(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: TransitionOrderBodyDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Req() req: Request,
  ) {
    return this.orders.transition(id, body.toStatus, {
      id: admin.id,
      requestId: getRequestId(req),
    });
  }

  @RequirePermissions('ORDERS_UPDATE')
  @Post(':id/cancel')
  cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: CancelOrderBodyDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Req() req: Request,
  ) {
    return this.orders.cancel(id, body.reason, {
      id: admin.id,
      requestId: getRequestId(req),
    });
  }
}
