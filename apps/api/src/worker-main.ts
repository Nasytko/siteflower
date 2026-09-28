import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { IntegrationWorkerService } from './integration/worker.service';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  const logger = new Logger('IntegrationWorker');
  const worker = app.get(IntegrationWorkerService);

  const shutdown = async (signal: string) => {
    logger.log(`Received ${signal}, shutting down…`);
    worker.requestStop();
    // Give in-flight tick a moment, then close context
    setTimeout(() => {
      void app.close().then(() => process.exit(0));
    }, 1500);
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  try {
    await worker.runLoop();
  } catch (err) {
    logger.error(err instanceof Error ? err.message : String(err));
    await app.close();
    process.exit(1);
  }

  await app.close();
  process.exit(0);
}

void bootstrap();
