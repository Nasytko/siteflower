import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { PrismaClient } from '@bouquet-one/database';
import { AppConfigService } from '../config/app-config.service';

const nodeRequire = createRequire(__filename);

/** Native dynamic import that bypasses Jest's module interceptor. */
const nativeImport = new Function('specifier', 'return import(specifier)') as (
  specifier: string,
) => Promise<{
  createPrismaClient: (options: {
    connectionString: string;
  }) => Promise<PrismaClient>;
}>;

@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  private _client!: PrismaClient;

  constructor(private readonly appConfig: AppConfigService) {}

  get client(): PrismaClient {
    if (!this._client) {
      throw new Error('PrismaClient is not initialized');
    }
    return this._client;
  }

  async onModuleInit(): Promise<void> {
    const connectionString = this.appConfig.databaseUrl;
    if (!connectionString) {
      throw new Error('DATABASE_URL is required for PrismaService');
    }

    const bridgePath = nodeRequire.resolve('@bouquet-one/database/cjs-bridge.cjs');
    const distEntry = pathToFileURL(join(dirname(bridgePath), 'dist', 'index.js')).href;
    const mod = await nativeImport(distEntry);
    this._client = await mod.createPrismaClient({ connectionString });
  }

  async onModuleDestroy(): Promise<void> {
    if (this._client) {
      await this._client.$disconnect();
    }
  }
}
