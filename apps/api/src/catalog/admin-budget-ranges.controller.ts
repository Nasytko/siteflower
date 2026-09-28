import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Req,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { CurrentAdmin, type AuthenticatedAdmin } from '../auth/current-admin.decorator';
import { RequirePermissions } from '../auth/decorators';
import { actorFrom } from '../common/actor.util';
import { BudgetRangesService } from './budget-ranges.service';
import { ExpectedVersionDto } from './products.dto';

const PRICE_MINOR_PATTERN = /^\d{1,15}$/;

class CreateBudgetRangeDto {
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  label!: string;

  /** Inclusive lower bound in minor units; null = open bound. */
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @Matches(PRICE_MINOR_PATTERN, { message: 'minMinor must be integer minor units as a string' })
  minMinor?: string | null;

  /** Inclusive upper bound in minor units; null = open bound. */
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @Matches(PRICE_MINOR_PATTERN, { message: 'maxMinor must be integer minor units as a string' })
  maxMinor?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(9999)
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

class UpdateBudgetRangeDto extends ExpectedVersionDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  label?: string;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @Matches(PRICE_MINOR_PATTERN, { message: 'minMinor must be integer minor units as a string' })
  minMinor?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @Matches(PRICE_MINOR_PATTERN, { message: 'maxMinor must be integer minor units as a string' })
  maxMinor?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(9999)
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

class ReorderBudgetRangesDto {
  @IsArray()
  @ArrayMaxSize(50)
  @IsUUID(undefined, { each: true })
  ids!: string[];
}

@ApiTags('admin-catalog-budget-ranges')
@Controller('admin/catalog/budget-ranges')
export class AdminBudgetRangesController {
  constructor(private readonly budgetRanges: BudgetRangesService) {}

  @Get()
  @RequirePermissions('CATALOG_READ')
  list() {
    return this.budgetRanges.list();
  }

  @Post()
  @RequirePermissions('CATALOG_CREATE')
  create(
    @Body() body: CreateBudgetRangeDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Req() req: Request,
  ) {
    return this.budgetRanges.create(body, actorFrom(admin, req));
  }

  @Put('order')
  @RequirePermissions('CATALOG_UPDATE')
  reorder(
    @Body() body: ReorderBudgetRangesDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Req() req: Request,
  ) {
    return this.budgetRanges.reorder(body.ids, actorFrom(admin, req));
  }

  @Get(':id')
  @RequirePermissions('CATALOG_READ')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.budgetRanges.getById(id);
  }

  @Patch(':id')
  @RequirePermissions('CATALOG_UPDATE')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateBudgetRangeDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Req() req: Request,
  ) {
    return this.budgetRanges.update(id, body, actorFrom(admin, req));
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermissions('CATALOG_UPDATE')
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ExpectedVersionDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Req() req: Request,
  ) {
    return this.budgetRanges.remove(id, body.expectedVersion, actorFrom(admin, req));
  }
}
