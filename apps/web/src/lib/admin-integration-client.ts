/**
 * Browser-side Admin ERP integration mutations (cookie session). Safe for 'use client'.
 */

import type {
  IntegrationStatusDto,
  IntegrationTestConnectionResult,
  OutboxEventAdminListItem,
  PaginatedResponse,
} from '@bouquet-one/contracts';
import { adminGet, adminPatch, adminPost } from './admin-client';
import { adminEndpoints, withQuery, type QueryValue } from './admin-endpoints';

export type IntegrationEnabledResult = {
  enabled: boolean;
  paused: boolean;
  updatedAt: string;
  note: string;
};

export type IntegrationRetryResult = {
  ok: boolean;
  id: string;
  status: string;
};

export type IntegrationTestEventResult = {
  ok: boolean;
  eventId: string;
  status: string;
};

export type IntegrationEventsQuery = {
  status?: string;
  orderId?: string;
  page?: number;
  pageSize?: number;
};

export const integrationClientApi = {
  getStatus: () => adminGet<IntegrationStatusDto>(adminEndpoints.integrationErpStatus),

  listEvents: (query: IntegrationEventsQuery = {}) => {
    const params: Record<string, QueryValue> = {
      status: query.status,
      orderId: query.orderId,
      page: query.page,
      pageSize: query.pageSize,
    };
    return adminGet<PaginatedResponse<OutboxEventAdminListItem>>(
      withQuery(adminEndpoints.integrationErpEvents, params),
    );
  },

  retryEvent: (id: string) =>
    adminPost<IntegrationRetryResult>(adminEndpoints.integrationErpEventRetry(id)),

  testConnection: () =>
    adminPost<IntegrationTestConnectionResult>(adminEndpoints.integrationErpTestConnection),

  testEvent: () => adminPost<IntegrationTestEventResult>(adminEndpoints.integrationErpTestEvent),

  setEnabled: (enabled: boolean) =>
    adminPatch<IntegrationEnabledResult>(adminEndpoints.integrationErpEnabled, { enabled }),
};
