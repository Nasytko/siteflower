import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  LEGAL_DOCUMENT_KINDS,
  isLegalDocumentKind,
  type LegalDocumentAdminDto,
  type LegalDocumentKind,
  type LegalDocumentPublicDto,
  type LegalDocumentVersionDto,
} from '@bouquet-one/contracts';
import type { Prisma } from '@bouquet-one/database';
import { AuditService } from '../audit/audit.service';
import { hashIp } from '../auth/crypto.util';
import type { ActorContext } from '../common/actor.util';
import { AppConfigService } from '../config/app-config.service';
import { PrismaService } from '../database/prisma.service';
import { DRAFT_LEGAL_DOCUMENTS } from './legal-document-drafts';

type DocumentWithVersions = Prisma.LegalDocumentGetPayload<{
  include: { versions: true };
}>;

type VersionRow = DocumentWithVersions['versions'][number];

@Injectable()
export class LegalDocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly appConfig: AppConfigService,
  ) {}

  parseKind(raw: string): LegalDocumentKind {
    const normalized = raw.trim().toUpperCase().replace(/-/g, '_');
    if (!isLegalDocumentKind(normalized)) {
      throw new BadRequestException('Invalid legal document kind');
    }
    return normalized;
  }

  async ensureDocuments(): Promise<void> {
    for (const kind of LEGAL_DOCUMENT_KINDS) {
      const existing = await this.prisma.client.legalDocument.findUnique({
        where: { kind },
        include: { versions: true },
      });
      if (existing) {
        continue;
      }

      const draft = DRAFT_LEGAL_DOCUMENTS[kind];
      try {
        await this.prisma.client.legalDocument.create({
          data: {
            kind,
            title: draft.title,
            versions: {
              create: {
                version: 1,
                status: 'DRAFT',
                title: draft.title,
                bodyMarkdown: draft.bodyMarkdown,
              },
            },
          },
        });
      } catch {
        // Concurrent ensure — ignore unique race.
      }
    }
  }

  async listAdmin(): Promise<LegalDocumentAdminDto[]> {
    await this.ensureDocuments();
    const rows = await this.prisma.client.legalDocument.findMany({
      include: { versions: true },
      orderBy: { kind: 'asc' },
    });
    return rows.map((row) => this.toAdminDto(row));
  }

  async getAdmin(kind: LegalDocumentKind): Promise<LegalDocumentAdminDto> {
    await this.ensureDocuments();
    const row = await this.prisma.client.legalDocument.findUnique({
      where: { kind },
      include: { versions: true },
    });
    if (!row) {
      throw new NotFoundException('Legal document not found');
    }
    return this.toAdminDto(row);
  }

  async updateDraft(
    kind: LegalDocumentKind,
    input: { title: string; bodyMarkdown: string },
    actor: ActorContext,
  ): Promise<LegalDocumentAdminDto> {
    await this.ensureDocuments();
    const title = input.title.trim();
    const bodyMarkdown = input.bodyMarkdown.trim();
    if (!title || !bodyMarkdown) {
      throw new BadRequestException('title and bodyMarkdown are required');
    }

    await this.prisma.client.$transaction(async (tx) => {
      const document = await tx.legalDocument.findUnique({
        where: { kind },
        include: { versions: true },
      });
      if (!document) {
        throw new NotFoundException('Legal document not found');
      }

      const draft = this.pickDraft(document.versions);
      if (draft) {
        await tx.legalDocumentVersion.update({
          where: { id: draft.id },
          data: {
            title,
            bodyMarkdown,
            updatedByAdminUserId: actor.actorId,
          },
        });
      } else {
        const nextVersion =
          document.versions.reduce((max, row) => Math.max(max, row.version), 0) + 1;
        await tx.legalDocumentVersion.create({
          data: {
            documentId: document.id,
            version: nextVersion,
            status: 'DRAFT',
            title,
            bodyMarkdown,
            createdByAdminUserId: actor.actorId,
            updatedByAdminUserId: actor.actorId,
          },
        });
      }

      await tx.legalDocument.update({
        where: { id: document.id },
        data: { title },
      });

      await this.audit.record(
        {
          actorAdminUserId: actor.actorId,
          action: 'LEGAL_DOCUMENT_UPDATED',
          entityType: 'LegalDocument',
          entityId: document.id,
          metadata: { kind, title },
          requestId: actor.requestId,
          ipHash: hashIp(actor.ip, this.appConfig.sessionHmacSecret),
          userAgent: actor.userAgent,
        },
        tx,
      );
    });

    return this.getAdmin(kind);
  }

  async publish(
    kind: LegalDocumentKind,
    actor: ActorContext,
    effectiveAt?: string | null,
  ): Promise<LegalDocumentAdminDto> {
    await this.ensureDocuments();

    await this.prisma.client.$transaction(async (tx) => {
      const document = await tx.legalDocument.findUnique({
        where: { kind },
        include: { versions: true },
      });
      if (!document) {
        throw new NotFoundException('Legal document not found');
      }

      const draft = this.pickDraft(document.versions);
      if (!draft) {
        throw new BadRequestException('No draft to publish');
      }

      const now = new Date();
      const effective =
        effectiveAt && effectiveAt.trim()
          ? new Date(effectiveAt.trim())
          : now;

      // Previous PUBLISHED versions stay PUBLISHED (historical, immutable).
      await tx.legalDocumentVersion.update({
        where: { id: draft.id },
        data: {
          status: 'PUBLISHED',
          effectiveAt: effective,
          publishedAt: now,
          updatedByAdminUserId: actor.actorId,
        },
      });

      await tx.legalDocument.update({
        where: { id: document.id },
        data: { title: draft.title },
      });

      await this.audit.record(
        {
          actorAdminUserId: actor.actorId,
          action: 'LEGAL_DOCUMENT_PUBLISHED',
          entityType: 'LegalDocument',
          entityId: document.id,
          metadata: {
            kind,
            version: draft.version,
            versionId: draft.id,
          },
          requestId: actor.requestId,
          ipHash: hashIp(actor.ip, this.appConfig.sessionHmacSecret),
          userAgent: actor.userAgent,
        },
        tx,
      );
    });

    return this.getAdmin(kind);
  }

  async getPublic(kind: LegalDocumentKind): Promise<LegalDocumentPublicDto | null> {
    const document = await this.prisma.client.legalDocument.findUnique({
      where: { kind },
      include: { versions: true },
    });
    if (!document) {
      return null;
    }
    const published = this.pickLatestPublished(document.versions);
    if (!published) {
      return null;
    }
    return {
      kind,
      title: published.title,
      bodyMarkdown: published.bodyMarkdown,
      version: published.version,
      effectiveAt: published.effectiveAt?.toISOString() ?? null,
      publishedAt: published.publishedAt?.toISOString() ?? null,
    };
  }

  async documentPublishStates(): Promise<
    Array<{ kind: LegalDocumentKind; hasPublished: boolean; hasDraft: boolean }>
  > {
    await this.ensureDocuments();
    const rows = await this.prisma.client.legalDocument.findMany({
      include: { versions: true },
    });
    const byKind = new Map(rows.map((row) => [row.kind as LegalDocumentKind, row]));
    return LEGAL_DOCUMENT_KINDS.map((kind) => {
      const row = byKind.get(kind);
      const versions = row?.versions ?? [];
      return {
        kind,
        hasPublished: versions.some((v) => v.status === 'PUBLISHED'),
        hasDraft: versions.some((v) => v.status === 'DRAFT'),
      };
    });
  }

  private toAdminDto(row: DocumentWithVersions): LegalDocumentAdminDto {
    const kind = row.kind as LegalDocumentKind;
    const draft = this.pickDraft(row.versions);
    const published = this.pickLatestPublished(row.versions);
    return {
      id: row.id,
      kind,
      title: row.title,
      draft: draft ? this.toVersionDto(kind, draft) : null,
      published: published ? this.toVersionDto(kind, published) : null,
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private toVersionDto(
    kind: LegalDocumentKind,
    row: VersionRow,
  ): LegalDocumentVersionDto {
    return {
      id: row.id,
      documentId: row.documentId,
      kind,
      version: row.version,
      status: row.status as LegalDocumentVersionDto['status'],
      title: row.title,
      bodyMarkdown: row.bodyMarkdown,
      effectiveAt: row.effectiveAt?.toISOString() ?? null,
      publishedAt: row.publishedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private pickDraft(versions: VersionRow[]): VersionRow | null {
    return versions.find((v) => v.status === 'DRAFT') ?? null;
  }

  private pickLatestPublished(versions: VersionRow[]): VersionRow | null {
    const published = versions.filter((v) => v.status === 'PUBLISHED');
    if (published.length === 0) {
      return null;
    }
    return published.reduce((best, row) => (row.version > best.version ? row : best));
  }
}
