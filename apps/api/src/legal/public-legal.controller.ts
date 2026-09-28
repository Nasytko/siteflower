import { Controller, Get, NotFoundException, Param } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/decorators';
import { LegalDocumentsService } from './legal-documents.service';
import { LegalEntityService } from './legal-entity.service';

@ApiTags('legal')
@Controller('legal')
export class PublicLegalController {
  constructor(
    private readonly entity: LegalEntityService,
    private readonly documents: LegalDocumentsService,
  ) {}

  @Public()
  @Get('seller')
  getSeller() {
    return this.entity.toPublicSeller();
  }

  @Public()
  @Get('bank')
  getBank() {
    return this.entity.toPublicBank();
  }

  @Public()
  @Get('documents/:kind')
  async getDocument(@Param('kind') kind: string) {
    const parsed = this.documents.parseKind(kind);
    const doc = await this.documents.getPublic(parsed);
    if (!doc) {
      throw new NotFoundException('Published legal document not found');
    }
    return doc;
  }
}
