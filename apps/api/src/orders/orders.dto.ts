import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import {
  ERP_SYNC_STATUSES,
  FULFILLMENT_TYPES,
  ORDER_STATUSES,
  PAYMENT_METHODS,
  PAYMENT_STATUSES,
  TELEGRAM_NOTIFY_STATUSES,
} from '@bouquet-one/contracts';

export class CartLineDto {
  @IsUUID()
  productId!: string;

  @IsUUID()
  variantId!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  quantity!: number;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsUUID('4', { each: true })
  optionValueIds?: string[];
}

export class PriorUnitPriceDto {
  @IsUUID()
  variantId!: string;

  @IsString()
  @Matches(/^\d+$/)
  unitPriceMinor!: string;
}

export class ConfirmedQuoteLineDto {
  @IsUUID()
  productId!: string;

  @IsUUID()
  variantId!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  quantity!: number;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsUUID('4', { each: true })
  optionValueIds?: string[];

  @IsString()
  @Matches(/^\d+$/)
  unitPriceMinor!: string;

  @IsString()
  @Matches(/^\d+$/)
  optionsTotalMinor!: string;

  @IsString()
  @Matches(/^\d+$/)
  lineTotalMinor!: string;
}

export class ConfirmedQuoteDto {
  @IsIn(FULFILLMENT_TYPES as unknown as string[])
  fulfillmentType!: (typeof FULFILLMENT_TYPES)[number];

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => ConfirmedQuoteLineDto)
  items!: ConfirmedQuoteLineDto[];

  @IsString()
  @Matches(/^\d+$/)
  subtotalMinor!: string;

  @IsString()
  @Matches(/^\d+$/)
  deliveryFeeMinor!: string;

  @IsString()
  @Matches(/^\d+$/)
  totalMinor!: string;
}

export class CheckoutValidateBodyDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => CartLineDto)
  items!: CartLineDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PriorUnitPriceDto)
  priorUnitPrices?: PriorUnitPriceDto[];

  @IsOptional()
  @IsIn(FULFILLMENT_TYPES as unknown as string[])
  fulfillmentType?: (typeof FULFILLMENT_TYPES)[number];
}

export class CreateOrderBodyDto {
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  idempotencyKey!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => CartLineDto)
  items!: CartLineDto[];

  @IsIn(FULFILLMENT_TYPES as unknown as string[])
  fulfillmentType!: (typeof FULFILLMENT_TYPES)[number];

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  purchaserName!: string;

  @IsString()
  @MinLength(7)
  @MaxLength(40)
  purchaserPhone!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  recipientName?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  recipientPhone?: string | null;

  @IsOptional()
  @IsBoolean()
  surprise?: boolean;

  @IsOptional()
  @IsBoolean()
  addressKnown?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  deliveryAddress?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  addressDetails?: string | null;

  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  fulfillmentDate!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(64)
  timeWindowId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  cardMessage?: string | null;

  @IsOptional()
  @IsBoolean()
  anonymousCard?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  customerComment?: string | null;

  /** Defaults to CASH_ON_DELIVERY. CARD_ONLINE rejected until provider is configured. */
  @IsOptional()
  @IsIn(PAYMENT_METHODS as unknown as string[])
  paymentMethod?: (typeof PAYMENT_METHODS)[number];

  /** Buyer-confirmed commercial terms; compared to fresh server pricing inside the create TX. */
  @ValidateNested()
  @Type(() => ConfirmedQuoteDto)
  confirmedQuote!: ConfirmedQuoteDto;
}

export class TransitionOrderBodyDto {
  @IsIn(ORDER_STATUSES as unknown as string[])
  toStatus!: (typeof ORDER_STATUSES)[number];
}

export class CancelOrderBodyDto {
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}

export class AdminOrderListQueryDto {
  @IsOptional()
  @IsIn(ORDER_STATUSES as unknown as string[])
  status?: (typeof ORDER_STATUSES)[number];

  @IsOptional()
  @IsIn(FULFILLMENT_TYPES as unknown as string[])
  fulfillmentType?: (typeof FULFILLMENT_TYPES)[number];

  @IsOptional()
  @IsIn(PAYMENT_STATUSES as unknown as string[])
  paymentStatus?: (typeof PAYMENT_STATUSES)[number];

  @IsOptional()
  @IsIn(ERP_SYNC_STATUSES as unknown as string[])
  erpSyncStatus?: (typeof ERP_SYNC_STATUSES)[number];

  @IsOptional()
  @IsIn(TELEGRAM_NOTIFY_STATUSES as unknown as string[])
  telegramNotifyStatus?: (typeof TELEGRAM_NOTIFY_STATUSES)[number];

  @IsOptional()
  @IsString()
  @MaxLength(32)
  date?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  q?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  pageSize?: number;
}
