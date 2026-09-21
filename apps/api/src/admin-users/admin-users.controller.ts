import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import type { Request } from 'express';
import { getRequestId } from '../common/middleware/request-id.middleware';
import { CurrentAdmin, type AuthenticatedAdmin } from '../auth/current-admin.decorator';
import { RequirePermissions } from '../auth/decorators';
import {
  CreateAdminUserDto,
  ResetPasswordDto,
  UpdateAdminUserDto,
} from './admin-users.dto';
import { AdminUsersService } from './admin-users.service';

class PaginationQueryDto {
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
}

@ApiTags('admin-users')
@Controller('admin/users')
export class AdminUsersController {
  constructor(private readonly users: AdminUsersService) {}

  @Get()
  @RequirePermissions('USERS_READ')
  list(@Query() query: PaginationQueryDto) {
    return this.users.list(query.page ?? 1, query.pageSize ?? 20);
  }

  @Post()
  @RequirePermissions('USERS_CREATE')
  create(
    @Body() body: CreateAdminUserDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Req() req: Request,
  ) {
    return this.users.create({
      ...body,
      actorId: admin.id,
      requestId: getRequestId(req),
      userAgent: req.headers['user-agent'],
      ip: req.ip,
    });
  }

  @Get(':id')
  @RequirePermissions('USERS_READ')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.users.getById(id);
  }

  @Patch(':id')
  @RequirePermissions('USERS_UPDATE')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateAdminUserDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Req() req: Request,
  ) {
    return this.users.update({
      id,
      displayName: body.displayName,
      role: body.role,
      actorId: admin.id,
      requestId: getRequestId(req),
      userAgent: req.headers['user-agent'],
      ip: req.ip,
    });
  }

  @Post(':id/reset-password')
  @RequirePermissions('USERS_RESET_PASSWORD')
  async resetPassword(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ResetPasswordDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Req() req: Request,
  ) {
    await this.users.resetPassword({
      id,
      newPassword: body.newPassword,
      actorId: admin.id,
      requestId: getRequestId(req),
      userAgent: req.headers['user-agent'],
      ip: req.ip,
    });
    return { ok: true };
  }

  @Post(':id/disable')
  @RequirePermissions('USERS_DISABLE')
  disable(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Req() req: Request,
  ) {
    return this.users.setStatus({
      id,
      status: 'DISABLED',
      actorId: admin.id,
      requestId: getRequestId(req),
      userAgent: req.headers['user-agent'],
      ip: req.ip,
    });
  }

  @Post(':id/enable')
  @RequirePermissions('USERS_DISABLE')
  enable(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Req() req: Request,
  ) {
    return this.users.setStatus({
      id,
      status: 'ACTIVE',
      actorId: admin.id,
      requestId: getRequestId(req),
      userAgent: req.headers['user-agent'],
      ip: req.ip,
    });
  }
}
