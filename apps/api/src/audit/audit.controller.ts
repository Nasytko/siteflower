import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDateString, IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';
import type { AuditAction } from '@bouquet-one/database';
import { RequirePermissions } from '../auth/decorators';
import { AuditService } from './audit.service';

class AuditQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number = 20;

  @IsOptional()
  @IsUUID()
  actorAdminUserId?: string;

  @IsOptional()
  @IsString()
  action?: string;

  @IsOptional()
  @IsString()
  entityType?: string;

  @IsOptional()
  @IsUUID()
  entityId?: string;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}

@ApiTags('admin-audit')
@Controller('admin/audit')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  @RequirePermissions('AUDIT_READ')
  async list(@Query() query: AuditQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const { items, total } = await this.audit.list({
      skip: (page - 1) * pageSize,
      take: pageSize,
      actorAdminUserId: query.actorAdminUserId,
      action: query.action as AuditAction | undefined,
      entityType: query.entityType,
      entityId: query.entityId,
      from: query.from ? new Date(query.from) : undefined,
      to: query.to ? new Date(query.to) : undefined,
    });

    return {
      items: items.map((item) => ({
        id: item.id,
        actorAdminUserId: item.actorAdminUserId,
        actorEmail: item.actor?.email ?? null,
        actorDisplayName: item.actor?.displayName ?? null,
        action: item.action,
        entityType: item.entityType,
        entityId: item.entityId,
        metadata: (item.metadata as Record<string, unknown> | null) ?? null,
        requestId: item.requestId,
        createdAt: item.createdAt.toISOString(),
      })),
      total,
      page,
      pageSize,
    };
  }
}
