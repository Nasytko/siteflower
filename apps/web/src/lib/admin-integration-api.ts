/**
 * Server-side Admin ERP integration reads.
 * Client mutations: `@/lib/admin-integration-client`.
 */

import type {
  IntegrationStatusDto,
  OutboxEventAdminDetail,
  OutboxEventAdminListItem,
  PaginatedResponse,
} from '@bouquet-one/contracts';
import { adminFetch } from './admin-api';
import { adminEndpoints, withQuery, type QueryValue } from './admin-endpoints';

export type IntegrationEventsQuery = {
  status?: string;
  orderId?: string;
  page?: number;
  pageSize?: number;
};

export function fetchIntegrationStatus(): Promise<IntegrationStatusDto> {
  return adminFetch<IntegrationStatusDto>(adminEndpoints.integrationErpStatus);
}

export function fetchIntegrationEvents(
  query: IntegrationEventsQuery = {},
): Promise<PaginatedResponse<OutboxEventAdminListItem>> {
  const params: Record<string, QueryValue> = {
    status: query.status,
    orderId: query.orderId,
    page: query.page,
    pageSize: query.pageSize,
  };
  return adminFetch<PaginatedResponse<OutboxEventAdminListItem>>(
    withQuery(adminEndpoints.integrationErpEvents, params),
  );
}

export function fetchIntegrationEvent(id: string): Promise<OutboxEventAdminDetail> {
  return adminFetch<OutboxEventAdminDetail>(adminEndpoints.integrationErpEvent(id));
}
