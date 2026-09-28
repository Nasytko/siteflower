import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../auth/decorators';
import {
  CreateInstagramPostDto,
  ReorderInstagramPostsDto,
  UpdateInstagramPostDto,
} from './storefront.dto';
import { InstagramService } from './instagram.service';

@ApiTags('admin-storefront-instagram')
@Controller('admin/storefront/instagram/posts')
export class AdminInstagramController {
  constructor(private readonly instagram: InstagramService) {}

  @Get()
  @RequirePermissions('CONTENT_READ')
  list() {
    return this.instagram.listAdmin();
  }

  @Put('order')
  @RequirePermissions('CONTENT_UPDATE')
  reorder(@Body() body: ReorderInstagramPostsDto) {
    return this.instagram.reorder(body.orderedIds);
  }

  @Post()
  @RequirePermissions('CONTENT_UPDATE')
  create(@Body() body: CreateInstagramPostDto) {
    return this.instagram.create(body);
  }

  @Patch(':id')
  @RequirePermissions('CONTENT_UPDATE')
  update(@Param('id') id: string, @Body() body: UpdateInstagramPostDto) {
    return this.instagram.update(id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermissions('CONTENT_UPDATE')
  async remove(@Param('id') id: string) {
    await this.instagram.remove(id);
  }
}
