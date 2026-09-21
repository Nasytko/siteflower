import { NestFactory } from '@nestjs/core';
import { AppModule } from './src/app.module';

async function main() {
  const app = await NestFactory.create(AppModule, { logger: false });
  app.setGlobalPrefix('api/v1');
  await app.init();
  const server = app.getHttpAdapter().getInstance() as unknown as {
    router: { stack: Array<{ route?: { path: string; methods: Record<string, boolean> } }> };
  };
  const routes = server.router.stack
    .filter((layer) => layer.route)
    .map((layer) => `${Object.keys(layer.route!.methods).join(',').toUpperCase()} ${layer.route!.path}`)
    .filter((route) => route.includes('catalog'));
  console.log(routes.join('\n'));
  await app.close();
}

void main().catch((error) => {
  console.error('BOOT FAILED:', error);
  process.exit(1);
});
