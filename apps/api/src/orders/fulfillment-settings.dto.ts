import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { ExpectedVersionDto } from '../catalog/products.dto';

const PRICE_MINOR_PATTERN = /^\d{1,15}$/;
const APPLIES_TO = ['DELIVERY', 'PICKUP', 'BOTH'] as const;

class TimeWindowInputDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  id!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  label!: string;

  @IsInt()
  @Min(0)
  @Max(24 * 60)
  startMinutes!: number;

  @IsInt()
  @Min(0)
  @Max(24 * 60)
  endMinutes!: number;

  @IsBoolean()
  active!: boolean;

  @IsInt()
  @Min(0)
  @Max(9999)
  sortOrder!: number;

  @IsIn(APPLIES_TO)
  appliesTo!: (typeof APPLIES_TO)[number];
}

/** Nest ValidationPipe target for PATCH /admin/fulfillment/settings. */
export class UpdateFulfillmentSettingsBodyDto extends ExpectedVersionDto {
  @IsOptional()
  @IsBoolean()
  deliveryEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  pickupEnabled?: boolean;

  @IsOptional()
  @IsString()
  @Matches(PRICE_MINOR_PATTERN, { message: 'deliveryFeeMinor must be integer minor units as a string' })
  deliveryFeeMinor?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(14 * 24 * 60)
  minLeadTimeMinutes?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(90)
  maxAdvanceDays?: number;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(48)
  @ValidateNested({ each: true })
  @Type(() => TimeWindowInputDto)
  timeWindows?: TimeWindowInputDto[];

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(2000)
  pickupInstructions?: string | null;
}
