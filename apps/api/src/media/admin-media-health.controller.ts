import { Controller, Get, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../auth/decorators';
import { MediaHealthService } from './media-health.service';

@ApiTags('admin-media-health')
@Controller('admin/media/health')
export class AdminMediaHealthController {
  constructor(private readonly health: MediaHealthService) {}

  /** Bounded DB consistency snapshot (no storage probe unless requested separately). */
  @Get()
  @RequirePermissions('SITE_HEALTH_READ')
  status() {
    return this.health.runConsistencyCheck({ probeStorage: false, sampleLimit: 100 });
  }

  /** Safe technical write/read/delete under healthchecks/ — no product media. */
  @Post('probe')
  @RequirePermissions('SITE_HEALTH_READ')
  probe() {
    return this.health.probeStorage();
  }
}
