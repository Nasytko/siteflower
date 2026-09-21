import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { Public } from '../auth/decorators';
import { getRequestId } from '../common/middleware/request-id.middleware';
import { CheckoutValidateBodyDto, CreateOrderBodyDto } from './orders.dto';
import { OrdersService } from './orders.service';
import { FulfillmentSettingsService } from './fulfillment-settings.service';

@ApiTags('checkout')
@Controller()
export class PublicCheckoutController {
  constructor(
    private readonly orders: OrdersService,
    private readonly fulfillment: FulfillmentSettingsService,
  ) {}

  @Public()
  @Get('checkout/fulfillment-options')
  getFulfillmentOptions() {
    return this.fulfillment.getPublic();
  }

  @Public()
  @Post('checkout/validate')
  validate(@Body() body: CheckoutValidateBodyDto) {
    return this.orders.validateCart(body);
  }

  @Public()
  /** Abuse protection; keep high enough for retries without blocking legitimate checkout. */
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Post('orders')
  create(@Body() body: CreateOrderBodyDto, @Req() req: Request) {
    return this.orders.createOrder(body, { requestId: getRequestId(req) });
  }

  @Public()
  @Get('orders/track/:token')
  track(@Param('token') token: string) {
    return this.orders.trackByToken(token);
  }
}
