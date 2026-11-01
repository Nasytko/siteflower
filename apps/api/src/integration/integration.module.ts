import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { AdminIntegrationController } from './admin-integration.controller';
import { IntegrationAttemptRepository } from './attempt.repository';
import { IntegrationConfigService } from './config';
import { DeliveryClient } from './delivery.client';
import { OutboxRepository } from './outbox.repository';
import { SimulatorController } from './simulator.controller';
import { SimulatorService } from './simulator.service';
import { TelegramClient } from './telegram.client';
import { IntegrationWorkerService } from './worker.service';

@Module({
  imports: [AuditModule],
  controllers: [SimulatorController, AdminIntegrationController],
  providers: [
    IntegrationConfigService,
    OutboxRepository,
    IntegrationAttemptRepository,
    SimulatorService,
    DeliveryClient,
    TelegramClient,
    IntegrationWorkerService,
  ],
  exports: [
    IntegrationConfigService,
    OutboxRepository,
    IntegrationAttemptRepository,
    DeliveryClient,
    SimulatorService,
    TelegramClient,
    IntegrationWorkerService,
  ],
})
export class IntegrationModule {}
