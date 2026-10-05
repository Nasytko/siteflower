import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import type { Request } from 'express';
import { NAVIGATION_TARGET_TYPES } from '@bouquet-one/contracts';
import { CurrentAdmin, type AuthenticatedAdmin } from '../auth/current-admin.decorator';
import { RequirePermissions } from '../auth/decorators';
import { actorFrom } from '../common/actor.util';
import { ExpectedVersionDto } from '../catalog/products.dto';
import { NavigationMenuService } from './navigation-menu.service';

class CreateNavItemDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  label!: string;

  @IsIn(NAVIGATION_TARGET_TYPES)
  targetType!: (typeof NAVIGATION_TARGET_TYPES)[number];

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUUID()
  targetId?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(500)
  customHref?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUUID()
  parentId?: string | null;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsBoolean()
  openInNewTab?: boolean;

  @IsOptional()
  @IsBoolean()
  accent?: boolean;
}

class UpdateNavItemDto extends ExpectedVersionDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  label?: string;

  @IsOptional()
  @IsIn(NAVIGATION_TARGET_TYPES)
  targetType?: (typeof NAVIGATION_TARGET_TYPES)[number];

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUUID()
  targetId?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(500)
  customHref?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUUID()
  parentId?: string | null;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsBoolean()
  openInNewTab?: boolean;

  @IsOptional()
  @IsBoolean()
  accent?: boolean;
}

class ReorderNavItemDto extends ExpectedVersionDto {
  @IsIn(['up', 'down'])
  direction!: 'up' | 'down';
}

@ApiTags('admin-storefront')
@Controller('admin/storefront/navigation')
export class AdminNavigationController {
  constructor(private readonly navigation: NavigationMenuService) {}

  @Get('main')
  @RequirePermissions('SETTINGS_READ')
  getMain() {
    return this.navigation.getAdminMainMenu();
  }

  @Get('targets')
  @RequirePermissions('SETTINGS_READ')
  listTargets(@Query('type') type?: string) {
    const targetType = (type ?? 'CATEGORY') as (typeof NAVIGATION_TARGET_TYPES)[number];
    return this.navigation.listTargetOptions(targetType);
  }

  @Post('main/items')
  @RequirePermissions('SETTINGS_UPDATE')
  createItem(
    @Body() body: CreateNavItemDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Req() req: Request,
  ) {
    return this.navigation.createItem(body, actorFrom(admin, req));
  }

  @Patch('main/items/:id')
  @RequirePermissions('SETTINGS_UPDATE')
  updateItem(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateNavItemDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Req() req: Request,
  ) {
    return this.navigation.updateItem(id, body, actorFrom(admin, req));
  }

  @Delete('main/items/:id')
  @RequirePermissions('SETTINGS_UPDATE')
  deleteItem(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ExpectedVersionDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Req() req: Request,
  ) {
    return this.navigation.deleteItem(id, body.expectedVersion, actorFrom(admin, req));
  }

  @Post('main/items/:id/reorder')
  @RequirePermissions('SETTINGS_UPDATE')
  reorderItem(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ReorderNavItemDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Req() req: Request,
  ) {
    return this.navigation.reorderItem(id, body.direction, body.expectedVersion, actorFrom(admin, req));
  }
}
