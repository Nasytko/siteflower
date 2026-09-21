import type { HealthResponse } from '@bouquet-one/contracts';
import { Controller, Get, Req } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import type { Request } from 'express';
import { Public } from '../auth/decorators';
import { getRequestId } from '../common/middleware/request-id.middleware';
import { AppConfigService } from '../config/app-config.service';
import { HealthService } from './health.service';

@ApiTags('health')
@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(
    private readonly healthService: HealthService,
    private readonly appConfig: AppConfigService,
  ) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Application health check for monitoring' })
  @ApiOkResponse({ description: 'Service is healthy' })
  getHealth(@Req() req: Request): HealthResponse {
    return this.healthService.getHealth({
      service: this.appConfig.appName,
      version: this.appConfig.appVersion,
      requestId: getRequestId(req),
    });
  }
}
