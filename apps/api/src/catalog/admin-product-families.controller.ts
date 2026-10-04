import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { RequirePermissions } from '../auth/decorators';
import { MediaService } from '../media/media.service';
import { ProductFamiliesService } from './product-families.service';
import { ExpectedVersionDto } from './products.dto';

class CreateProductFamilyDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;
}

class RenameProductFamilyDto extends ExpectedVersionDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;
}

class ReorderProductFamilyMembersDto {
  @IsArray()
  @ArrayMaxSize(200)
  @IsUUID(undefined, { each: true })
  orderedProductIds!: string[];
}

@ApiTags('admin-catalog')
@Controller('admin/catalog/product-families')
export class AdminProductFamiliesController {
  constructor(
    private readonly families: ProductFamiliesService,
    private readonly media: MediaService,
  ) {}

  @Get()
  @RequirePermissions('CATALOG_READ')
  list() {
    return this.families.list();
  }

  @Get(':id')
  @RequirePermissions('CATALOG_READ')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.families.getDto(id, (key) => this.media.getPublicUrl(key));
  }

  @Post()
  @RequirePermissions('CATALOG_UPDATE')
  create(@Body() body: CreateProductFamilyDto) {
    return this.families.create(body.name);
  }

  @Patch(':id')
  @RequirePermissions('CATALOG_UPDATE')
  rename(@Param('id', ParseUUIDPipe) id: string, @Body() body: RenameProductFamilyDto) {
    return this.families.rename(id, body.name, body.expectedVersion);
  }

  @Put(':id/members/order')
  @RequirePermissions('CATALOG_UPDATE')
  reorder(@Param('id', ParseUUIDPipe) id: string, @Body() body: ReorderProductFamilyMembersDto) {
    return this.families.reorderMembers(id, body.orderedProductIds ?? []);
  }
}
