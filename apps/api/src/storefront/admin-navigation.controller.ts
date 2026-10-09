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
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
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
import { memoryStorage } from 'multer';
import {
  NAVIGATION_PANEL_LAYOUTS,
  NAVIGATION_TARGET_TYPES,
} from '@bouquet-one/contracts';
import { CurrentAdmin, type AuthenticatedAdmin } from '../auth/current-admin.decorator';
import { RequirePermissions } from '../auth/decorators';
import { actorFrom } from '../common/actor.util';
import { ExpectedVersionDto } from '../catalog/products.dto';
import { MEDIA_UPLOAD_MAX_INPUT_BYTES, MEDIA_UPLOAD_THROTTLE } from '../media/media.constants';
import { MEDIA_ERROR_CODES, mediaHttpException } from '../media/media-errors';
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
  @IsString()
  @MaxLength(80)
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
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(40)
  iconKey?: string | null;

  @IsOptional()
  @IsIn(NAVIGATION_PANEL_LAYOUTS)
  panelLayout?: (typeof NAVIGATION_PANEL_LAYOUTS)[number];

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
  @IsString()
  @MaxLength(80)
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
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(40)
  iconKey?: string | null;

  @IsOptional()
  @IsIn(NAVIGATION_PANEL_LAYOUTS)
  panelLayout?: (typeof NAVIGATION_PANEL_LAYOUTS)[number];

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

  @Post('main/items/:id/media')
  @RequirePermissions('SETTINGS_UPDATE')
  @Throttle({ default: { limit: MEDIA_UPLOAD_THROTTLE.limit, ttl: MEDIA_UPLOAD_THROTTLE.ttl } })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: {
        fileSize: Number(process.env.MEDIA_MAX_BYTES ?? MEDIA_UPLOAD_MAX_INPUT_BYTES),
        files: 1,
      },
    }),
  )
  attachMedia(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Req() req: Request,
  ) {
    if (!file) {
      throw mediaHttpException(MEDIA_ERROR_CODES.FILE_REQUIRED);
    }
    return this.navigation.attachItemMedia(
      id,
      { buffer: file.buffer, originalname: file.originalname },
      actorFrom(admin, req),
    );
  }

  @Delete('main/items/:id/media')
  @RequirePermissions('SETTINGS_UPDATE')
  detachMedia(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ExpectedVersionDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Req() req: Request,
  ) {
    return this.navigation.detachItemMedia(id, body.expectedVersion, actorFrom(admin, req));
  }
}
