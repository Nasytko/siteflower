import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { AdminIntegrationController } from './admin-integration.controller';
import { IntegrationConfigService } from './config';
import { DeliveryClient } from './delivery.client';
import { OutboxRepository } from './outbox.repository';
import { SimulatorController } from './simulator.controller';
import { SimulatorService } from './simulator.service';
import { IntegrationWorkerService } from './worker.service';

@Module({
  imports: [AuditModule],
  controllers: [SimulatorController, AdminIntegrationController],
  providers: [
    IntegrationConfigService,
    OutboxRepository,
    SimulatorService,
    DeliveryClient,
    IntegrationWorkerService,
  ],
  exports: [
    IntegrationConfigService,
    OutboxRepository,
    DeliveryClient,
    SimulatorService,
    IntegrationWorkerService,
  ],
})
export class IntegrationModule {}
