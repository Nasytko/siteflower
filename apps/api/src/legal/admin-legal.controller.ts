import { Body, Controller, Get, Param, Patch, Post, Put, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { CurrentAdmin, type AuthenticatedAdmin } from '../auth/current-admin.decorator';
import { RequirePermissions } from '../auth/decorators';
import { actorFrom } from '../common/actor.util';
import { ComplianceService } from './compliance.service';
import { LegalDocumentsService } from './legal-documents.service';
import { LegalEntityService } from './legal-entity.service';
import {
  PublishLegalDocumentDto,
  UpdateLegalDocumentDraftDto,
  UpdateLegalEntitySettingsDto,
} from './legal.dto';

@ApiTags('admin-legal')
@Controller('admin/legal')
export class AdminLegalController {
  constructor(
    private readonly entity: LegalEntityService,
    private readonly documents: LegalDocumentsService,
    private readonly compliance: ComplianceService,
  ) {}

  @Get('entity')
  @RequirePermissions('LEGAL_READ')
  getEntity() {
    return this.entity.getAdmin();
  }

  @Patch('entity')
  @RequirePermissions('LEGAL_PUBLISH')
  updateEntity(
    @Body() body: UpdateLegalEntitySettingsDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Req() req: Request,
  ) {
    return this.entity.update(body, actorFrom(admin, req));
  }

  @Get('compliance')
  @RequirePermissions('LEGAL_READ')
  getCompliance() {
    return this.compliance.getStatus();
  }

  @Get('documents')
  @RequirePermissions('LEGAL_READ')
  listDocuments() {
    return this.documents.listAdmin();
  }

  @Get('documents/:kind')
  @RequirePermissions('LEGAL_READ')
  getDocument(@Param('kind') kind: string) {
    return this.documents.getAdmin(this.documents.parseKind(kind));
  }

  @Put('documents/:kind/draft')
  @RequirePermissions('LEGAL_EDIT')
  updateDraft(
    @Param('kind') kind: string,
    @Body() body: UpdateLegalDocumentDraftDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Req() req: Request,
  ) {
    return this.documents.updateDraft(
      this.documents.parseKind(kind),
      body,
      actorFrom(admin, req),
    );
  }

  @Post('documents/:kind/publish')
  @RequirePermissions('LEGAL_PUBLISH')
  publish(
    @Param('kind') kind: string,
    @Body() body: PublishLegalDocumentDto = {},
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Req() req: Request,
  ) {
    return this.documents.publish(
      this.documents.parseKind(kind),
      actorFrom(admin, req),
      body.effectiveAt,
    );
  }
}
