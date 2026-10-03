import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsUUID,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import {
  BULK_PRODUCT_OPERATIONS,
  BULK_PRODUCTS_MAX_ITEMS,
  COMMERCIAL_AVAILABILITIES,
  type BulkProductOperation,
  type CommercialAvailability,
} from '@bouquet-one/contracts';

export class BulkProductItemDto {
  @IsUUID()
  productId!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedVersion!: number;
}

export class BulkProductsDto {
  @IsIn(BULK_PRODUCT_OPERATIONS)
  operation!: BulkProductOperation;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(BULK_PRODUCTS_MAX_ITEMS)
  @ValidateNested({ each: true })
  @Type(() => BulkProductItemDto)
  items!: BulkProductItemDto[];

  /** Required when operation = SET_AVAILABILITY. */
  @ValidateIf((o: BulkProductsDto) => o.operation === 'SET_AVAILABILITY')
  @IsIn(COMMERCIAL_AVAILABILITIES)
  availability?: CommercialAvailability;
}
