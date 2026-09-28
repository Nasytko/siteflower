import {
  Controller,
  Get,
  Headers,
  HttpException,
  HttpStatus,
  NotFoundException,
  Post,
  Req,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { INTEGRATION_HEADERS } from '@bouquet-one/contracts';
import { Public } from '../auth/decorators';
import { IntegrationConfigService } from './config';
import { SimulatorDeliveryError, SimulatorService } from './simulator.service';

type RequestWithRawBody = Request & { rawBody?: Buffer };

@ApiTags('integration-simulator')
@Controller('integration/simulator')
export class SimulatorController {
  constructor(
    private readonly config: IntegrationConfigService,
    private readonly simulator: SimulatorService,
  ) {}

  private assertSimulatorMode(): void {
    if (this.config.mode !== 'SIMULATOR') {
      throw new NotFoundException();
    }
  }

  @Public()
  @Get('health')
  async health() {
    this.assertSimulatorMode();
    return this.simulator.health();
  }

  @Public()
  @Post('orders')
  async orders(
    @Req() req: RequestWithRawBody,
    @Headers(INTEGRATION_HEADERS.key) keyId: string | undefined,
    @Headers(INTEGRATION_HEADERS.timestamp) timestamp: string | undefined,
    @Headers(INTEGRATION_HEADERS.nonce) nonce: string | undefined,
    @Headers(INTEGRATION_HEADERS.signature) signature: string | undefined,
    @Headers('x-bouquet-simulator-fault') fault: string | undefined,
  ) {
    this.assertSimulatorMode();

    const bodyUtf8 =
      req.rawBody?.toString('utf8') ??
      (typeof req.body === 'string' ? req.body : JSON.stringify(req.body ?? {}));

    if (!keyId || !timestamp || !nonce || !signature) {
      throw new HttpException('Missing integration HMAC headers', HttpStatus.UNAUTHORIZED);
    }

    const path = '/api/v1/integration/simulator/orders';
    try {
      return await this.simulator.acceptOrder({
        bodyUtf8,
        headers: { keyId, timestamp, nonce, signature },
        method: 'POST',
        path,
        fault: this.config.nodeEnv !== 'production' ? fault : null,
      });
    } catch (err) {
      if (err instanceof SimulatorDeliveryError) {
        const status =
          err.category === 'AUTH_FAILED'
            ? HttpStatus.UNAUTHORIZED
            : err.category === 'TIMEOUT'
              ? HttpStatus.GATEWAY_TIMEOUT
              : err.category === 'REMOTE_5XX'
                ? HttpStatus.BAD_GATEWAY
                : err.category === 'REMOTE_4XX'
                  ? HttpStatus.BAD_REQUEST
                  : HttpStatus.BAD_REQUEST;
        throw new HttpException(err.message, status);
      }
      throw err;
    }
  }
}
