import { IsBoolean, IsIn, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { OUTBOX_DELIVERY_STATUSES, type OutboxDeliveryStatus } from '@bouquet-one/contracts';

export class AdminOutboxListQueryDto {
  @IsOptional()
  @IsIn([...OUTBOX_DELIVERY_STATUSES])
  status?: OutboxDeliveryStatus;

  /** Filter by order id (outbox aggregateId). */
  @IsOptional()
  @IsUUID()
  orderId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}

export class PatchIntegrationEnabledDto {
  /** When true, worker may claim (paused=false). When false, pause delivery. */
  @IsBoolean()
  enabled!: boolean;
}
