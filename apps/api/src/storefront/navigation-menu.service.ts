import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  categoryPublicHref,
  isNavigationIconKey,
  isNavigationPageKey,
  isNavigationTargetType,
  MAIN_NAVIGATION_MENU_KEY,
  navigationCategoryTargetAvailability,
  navigationPageHref,
  validateNavigationCustomHref,
  type NavigationMenuAdminDto,
  type NavigationMenuItemAdminDto,
  type NavigationMenuItemPublicDto,
  type NavigationMenuPublicDto,
  type NavigationTargetOptionDto,
  type NavigationTargetType,
} from '@bouquet-one/contracts';
import { AuditService } from '../audit/audit.service';
import { hashIp } from '../auth/crypto.util';
import type { ActorContext } from '../common/actor.util';
import { AppConfigService } from '../config/app-config.service';
import { PrismaService } from '../database/prisma.service';
import { StorefrontRevalidateService } from './storefront-revalidate.service';

type ItemRow = {
  id: string;
  menuId: string;
  parentId: string | null;
  label: string;
  targetType: NavigationTargetType;
  targetId: string | null;
  customHref: string | null;
  iconKey: string | null;
  sortOrder: number;
  enabled: boolean;
  openInNewTab: boolean;
  accent: boolean;
  version: number;
};

@Injectable()
export class NavigationMenuService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly appConfig: AppConfigService,
    private readonly revalidate: StorefrontRevalidateService,
  ) {}

  private actorMeta(actor?: ActorContext) {
    if (!actor) return {};
    return {
      requestId: actor.requestId,
      ipHash: hashIp(actor.ip, this.appConfig.sessionHmacSecret),
      userAgent: actor.userAgent,
    };
  }

  async getPublicMainMenu(): Promise<NavigationMenuPublicDto> {
    const menu = await this.ensureMainMenu();
    const items = await this.prisma.client.navigationMenuItem.findMany({
      where: { menuId: menu.id, enabled: true },
      orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }],
    });
    const resolved = await this.resolveItems(items);
    // Hide unavailable targets (e.g. HIDDEN category). Keep admin rows intact.
    const available = resolved.filter((row) => !row.unavailable);
    const availableIds = new Set(available.map((row) => row.id));
    // Children of unavailable parents surface as roots (menu ≠ category tree),
    // except links under an available GROUP stay nested.
    const roots = available.filter(
      (row) => !row.parentId || !availableIds.has(row.parentId),
    );
    const tree = this.toPublicTree(roots, available);
    return {
      key: menu.key,
      items: this.pruneEmptyGroups(tree),
    };
  }

  async getAdminMainMenu(): Promise<NavigationMenuAdminDto> {
    const menu = await this.ensureMainMenu();
    const items = await this.prisma.client.navigationMenuItem.findMany({
      where: { menuId: menu.id },
      orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }],
    });
    const resolved = await this.resolveItems(items);
    return {
      id: menu.id,
      key: menu.key,
      name: menu.name,
      version: menu.version,
      items: this.toAdminTree(resolved.filter((row) => !row.parentId), resolved),
    };
  }

  async listTargetOptions(
    targetType: NavigationTargetType,
  ): Promise<NavigationTargetOptionDto[]> {
    switch (targetType) {
      case 'CATEGORY': {
        const rows = await this.prisma.client.catalogCategory.findMany({
          where: { visibility: 'VISIBLE' },
          orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
          select: { id: true, name: true, slug: true },
        });
        return rows.map((row) => ({
          id: row.id,
          label: row.name,
          href: categoryPublicHref(row.slug),
        }));
      }
      case 'PROMOTIONS':
        return [{ id: 'promotions', label: 'Акции', href: '/akcii' }];
      case 'BESTSELLERS': {
        const groups = await this.prisma.client.bestsellerGroup.findMany({
          where: { active: true },
          orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
          select: { id: true, name: true, slug: true },
        });
        return [
          { id: 'bestsellers', label: 'Бестселлеры (каталог)', href: '/bukety' },
          ...groups.map((row) => ({
            id: row.id,
            label: row.name,
            href: `/bukety?bestseller=${encodeURIComponent(row.slug)}`,
          })),
        ];
      }
      case 'PAGE':
        return [
          { id: 'bukety', label: 'Букеты', href: '/bukety' },
          { id: 'cvety', label: 'Цветы', href: '/cvety' },
          { id: 'povod', label: 'Повод', href: '/povod' },
          { id: 'akcii', label: 'Акции', href: '/akcii' },
          { id: 'dostavka', label: 'Доставка', href: '/dostavka' },
          { id: 'o-nas', label: 'О нас', href: '/o-nas' },
          { id: 'kontakty', label: 'Контакты', href: '/kontakty' },
        ];
      case 'CUSTOM_URL':
        return [];
      case 'GROUP':
        return [];
      case 'PRODUCT': {
        const rows = await this.prisma.client.product.findMany({
          where: { lifecycle: { in: ['PUBLISHED', 'DRAFT'] } },
          orderBy: [{ updatedAt: 'desc' }],
          take: 200,
          select: { id: true, name: true, slug: true, lifecycle: true },
        });
        return rows.map((row) => ({
          id: row.id,
          label: row.lifecycle === 'PUBLISHED' ? row.name : `${row.name} (черновик)`,
          href: `/bukety/${encodeURIComponent(row.slug)}`,
        }));
      }
      default:
        return [];
    }
  }

  async createItem(
    input: {
      label: string;
      targetType: string;
      targetId?: string | null;
      customHref?: string | null;
      parentId?: string | null;
      iconKey?: string | null;
      enabled?: boolean;
      openInNewTab?: boolean;
      accent?: boolean;
    },
    actor?: ActorContext,
  ): Promise<NavigationMenuAdminDto> {
    const menu = await this.ensureMainMenu();
    const prepared = await this.prepareTarget(input);
    const maxOrder = await this.prisma.client.navigationMenuItem.aggregate({
      where: { menuId: menu.id, parentId: prepared.parentId },
      _max: { sortOrder: true },
    });

    await this.prisma.client.$transaction(async (tx) => {
      const created = await tx.navigationMenuItem.create({
        data: {
          menuId: menu.id,
          parentId: prepared.parentId,
          label: prepared.label,
          targetType: prepared.targetType,
          targetId: prepared.targetId,
          customHref: prepared.customHref,
          iconKey: prepared.iconKey,
          sortOrder: (maxOrder._max.sortOrder ?? 0) + 10,
          enabled: input.enabled ?? true,
          openInNewTab: input.openInNewTab ?? false,
          accent: input.accent ?? prepared.targetType === 'PROMOTIONS',
        },
      });
      await tx.navigationMenu.update({
        where: { id: menu.id },
        data: { version: { increment: 1 } },
      });
      if (actor) {
        await this.audit.record(
          {
            actorAdminUserId: actor.actorId,
            action: 'STOREFRONT_SETTINGS_UPDATED',
            entityType: 'NavigationMenuItem',
            entityId: created.id,
            metadata: { create: true, label: created.label, targetType: created.targetType },
            ...this.actorMeta(actor),
          },
          tx,
        );
      }
    });

    await this.revalidate.ping({ tags: ['storefront', 'navigation'], paths: ['/'] });
    return this.getAdminMainMenu();
  }

  async updateItem(
    id: string,
    input: {
      expectedVersion: number;
      label?: string;
      targetType?: string;
      targetId?: string | null;
      customHref?: string | null;
      parentId?: string | null;
      iconKey?: string | null;
      enabled?: boolean;
      openInNewTab?: boolean;
      accent?: boolean;
    },
    actor?: ActorContext,
  ): Promise<NavigationMenuAdminDto> {
    const existing = await this.prisma.client.navigationMenuItem.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Пункт меню не найден');
    if (existing.version !== input.expectedVersion) {
      throw new ConflictException('Пункт меню был изменён в другом окне');
    }

    const nextTargetType = input.targetType ?? existing.targetType;
    const nextTargetId = input.targetId === undefined ? existing.targetId : input.targetId;
    const targetUnchanged =
      nextTargetType === existing.targetType && nextTargetId === existing.targetId;
    const prepared = await this.prepareTarget(
      {
        label: input.label ?? existing.label,
        targetType: nextTargetType,
        targetId: nextTargetId,
        customHref: input.customHref === undefined ? existing.customHref : input.customHref,
        parentId: input.parentId === undefined ? existing.parentId : input.parentId,
        iconKey: input.iconKey === undefined ? existing.iconKey : input.iconKey,
      },
      // Keep existing HIDDEN-category links editable (label/enabled) without re-assigning.
      { allowExistingHiddenCategory: targetUnchanged },
    );

    if (prepared.parentId === id) {
      throw new BadRequestException('Пункт меню не может быть родителем самого себя');
    }
    if (prepared.parentId) {
      const descendants = await this.collectDescendantIds(id);
      if (descendants.has(prepared.parentId)) {
        throw new BadRequestException('Нельзя переместить пункт под собственного потомка');
      }
    }

    const result = await this.prisma.client.navigationMenuItem.updateMany({
      where: { id, version: input.expectedVersion },
      data: {
        label: prepared.label,
        targetType: prepared.targetType,
        targetId: prepared.targetId,
        customHref: prepared.customHref,
        parentId: prepared.parentId,
        iconKey: prepared.iconKey,
        ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
        ...(input.openInNewTab !== undefined ? { openInNewTab: input.openInNewTab } : {}),
        ...(input.accent !== undefined ? { accent: input.accent } : {}),
        version: { increment: 1 },
      },
    });
    if (result.count === 0) {
      throw new ConflictException('Пункт меню был изменён в другом окне');
    }

    await this.prisma.client.navigationMenu.update({
      where: { id: existing.menuId },
      data: { version: { increment: 1 } },
    });

    if (actor) {
      await this.audit.record({
        actorAdminUserId: actor.actorId,
        action: 'STOREFRONT_SETTINGS_UPDATED',
        entityType: 'NavigationMenuItem',
        entityId: id,
        metadata: { update: true, fields: Object.keys(input).filter((k) => k !== 'expectedVersion') },
        ...this.actorMeta(actor),
      });
    }

    await this.revalidate.ping({ tags: ['storefront', 'navigation'], paths: ['/'] });
    return this.getAdminMainMenu();
  }

  async deleteItem(
    id: string,
    expectedVersion: number,
    actor?: ActorContext,
  ): Promise<NavigationMenuAdminDto> {
    const existing = await this.prisma.client.navigationMenuItem.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Пункт меню не найден');
    if (existing.version !== expectedVersion) {
      throw new ConflictException('Пункт меню был изменён в другом окне');
    }

    await this.prisma.client.$transaction(async (tx) => {
      await tx.navigationMenuItem.delete({ where: { id } });
      await tx.navigationMenu.update({
        where: { id: existing.menuId },
        data: { version: { increment: 1 } },
      });
      if (actor) {
        await this.audit.record(
          {
            actorAdminUserId: actor.actorId,
            action: 'STOREFRONT_SETTINGS_UPDATED',
            entityType: 'NavigationMenuItem',
            entityId: id,
            metadata: { delete: true, label: existing.label },
            ...this.actorMeta(actor),
          },
          tx,
        );
      }
    });

    await this.revalidate.ping({ tags: ['storefront', 'navigation'], paths: ['/'] });
    return this.getAdminMainMenu();
  }

  async reorderItem(
    id: string,
    direction: 'up' | 'down',
    expectedVersion: number,
    actor?: ActorContext,
  ): Promise<NavigationMenuAdminDto> {
    const item = await this.prisma.client.navigationMenuItem.findUnique({ where: { id } });
    if (!item) throw new NotFoundException('Пункт меню не найден');
    if (item.version !== expectedVersion) {
      throw new ConflictException('Пункт меню был изменён в другом окне');
    }

    const siblings = await this.prisma.client.navigationMenuItem.findMany({
      where: { menuId: item.menuId, parentId: item.parentId },
      orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }],
    });
    const index = siblings.findIndex((row) => row.id === id);
    if (index < 0) throw new NotFoundException('Пункт меню не найден');
    const swapWith = direction === 'up' ? siblings[index - 1] : siblings[index + 1];
    if (!swapWith) return this.getAdminMainMenu();

    await this.prisma.client.$transaction(async (tx) => {
      await tx.navigationMenuItem.update({
        where: { id: item.id },
        data: { sortOrder: swapWith.sortOrder, version: { increment: 1 } },
      });
      await tx.navigationMenuItem.update({
        where: { id: swapWith.id },
        data: { sortOrder: item.sortOrder, version: { increment: 1 } },
      });
      await tx.navigationMenu.update({
        where: { id: item.menuId },
        data: { version: { increment: 1 } },
      });
      if (actor) {
        await this.audit.record(
          {
            actorAdminUserId: actor.actorId,
            action: 'STOREFRONT_SETTINGS_UPDATED',
            entityType: 'NavigationMenuItem',
            entityId: id,
            metadata: { reorder: direction },
            ...this.actorMeta(actor),
          },
          tx,
        );
      }
    });

    await this.revalidate.ping({ tags: ['storefront', 'navigation'], paths: ['/'] });
    return this.getAdminMainMenu();
  }

  private async ensureMainMenu() {
    const existing = await this.prisma.client.navigationMenu.findUnique({
      where: { key: MAIN_NAVIGATION_MENU_KEY },
    });
    if (existing) return existing;
    return this.prisma.client.navigationMenu.create({
      data: {
        key: MAIN_NAVIGATION_MENU_KEY,
        name: 'Главное меню',
      },
    });
  }

  private async prepareTarget(
    input: {
      label: string;
      targetType: string;
      targetId?: string | null;
      customHref?: string | null;
      parentId?: string | null;
      iconKey?: string | null;
    },
    options?: { allowExistingHiddenCategory?: boolean },
  ): Promise<{
    label: string;
    targetType: NavigationTargetType;
    targetId: string | null;
    customHref: string | null;
    parentId: string | null;
    iconKey: string | null;
  }> {
    const label = input.label.trim();
    if (!label) throw new BadRequestException('Укажите название пункта меню');
    if (!isNavigationTargetType(input.targetType)) {
      throw new BadRequestException('Неизвестный тип ссылки');
    }

    let iconKey: string | null = null;
    if (input.iconKey != null && String(input.iconKey).trim()) {
      const key = String(input.iconKey).trim();
      if (!isNavigationIconKey(key)) {
        throw new BadRequestException('Неизвестная иконка');
      }
      iconKey = key;
    }

    const parentId = input.parentId ?? null;
    if (parentId) {
      const parent = await this.prisma.client.navigationMenuItem.findUnique({
        where: { id: parentId },
      });
      if (!parent) throw new BadRequestException('Родительский пункт меню не найден');
      if (parent.parentId) {
        // Depth 2: parent is already nested — must be a GROUP, child cannot be GROUP.
        if (parent.targetType !== 'GROUP') {
          throw new BadRequestException(
            'Вложенные пункты можно добавлять только в группу dropdown',
          );
        }
        if (input.targetType === 'GROUP') {
          throw new BadRequestException('Группу нельзя вложить в другую группу');
        }
      } else if (input.targetType === 'GROUP' && parent.targetType === 'GROUP') {
        throw new BadRequestException('Группу нельзя вложить в другую группу');
      }
    } else if (input.targetType === 'GROUP') {
      throw new BadRequestException('Группа должна быть внутри пункта основного меню');
    }

    switch (input.targetType) {
      case 'GROUP':
        return {
          label,
          targetType: 'GROUP',
          targetId: null,
          customHref: null,
          parentId,
          iconKey,
        };
      case 'CATEGORY': {
        if (!input.targetId) throw new BadRequestException('Выберите категорию');
        const category = await this.prisma.client.catalogCategory.findUnique({
          where: { id: input.targetId },
        });
        if (!category) throw new BadRequestException('Категория не найдена');
        if (category.visibility === 'HIDDEN' && !options?.allowExistingHiddenCategory) {
          throw new BadRequestException(
            'Скрытую категорию нельзя назначить в меню. Сначала сделайте её видимой.',
          );
        }
        return {
          label,
          targetType: 'CATEGORY',
          targetId: category.id,
          customHref: null,
          parentId,
          iconKey,
        };
      }
      case 'PRODUCT': {
        if (!input.targetId) throw new BadRequestException('Выберите товар');
        const product = await this.prisma.client.product.findUnique({
          where: { id: input.targetId },
          select: { id: true, slug: true, lifecycle: true },
        });
        if (!product) throw new BadRequestException('Товар не найден');
        if (product.lifecycle === 'ARCHIVED' && !options?.allowExistingHiddenCategory) {
          throw new BadRequestException('Архивный товар нельзя назначить в меню');
        }
        return {
          label,
          targetType: 'PRODUCT',
          targetId: product.id,
          customHref: null,
          parentId,
          iconKey,
        };
      }
      case 'PROMOTIONS':
        return {
          label,
          targetType: 'PROMOTIONS',
          targetId: null,
          customHref: null,
          parentId,
          iconKey,
        };
      case 'BESTSELLERS': {
        if (!input.targetId || input.targetId === 'bestsellers') {
          return {
            label,
            targetType: 'BESTSELLERS',
            targetId: null,
            customHref: null,
            parentId,
            iconKey,
          };
        }
        const group = await this.prisma.client.bestsellerGroup.findUnique({
          where: { id: input.targetId },
        });
        if (!group) throw new BadRequestException('Подборка бестселлеров не найдена');
        return {
          label,
          targetType: 'BESTSELLERS',
          targetId: group.id,
          customHref: null,
          parentId,
          iconKey,
        };
      }
      case 'PAGE': {
        const key = (input.customHref ?? '').trim();
        if (!isNavigationPageKey(key)) {
          throw new BadRequestException('Выберите страницу');
        }
        return {
          label,
          targetType: 'PAGE',
          targetId: null,
          customHref: key,
          parentId,
          iconKey,
        };
      }
      case 'CUSTOM_URL': {
        let href: string;
        try {
          href = validateNavigationCustomHref(input.customHref ?? '');
        } catch (err) {
          const code = err instanceof Error ? err.message : 'NAV_HREF_INVALID';
          if (code === 'NAV_HREF_EMPTY') {
            throw new BadRequestException('Укажите ссылку');
          }
          if (code === 'NAV_HREF_UNSAFE') {
            throw new BadRequestException('Небезопасная ссылка');
          }
          throw new BadRequestException('Некорректная ссылка. Используйте путь /… или https://…');
        }
        return {
          label,
          targetType: 'CUSTOM_URL',
          targetId: null,
          customHref: href,
          parentId,
          iconKey,
        };
      }
      default:
        throw new BadRequestException('Неизвестный тип ссылки');
    }
  }

  private async resolveItems(items: ItemRow[]): Promise<
    Array<
      ItemRow & {
        href: string;
        targetLabel: string;
        unavailable: boolean;
        unavailableReason: string | null;
      }
    >
  > {
    const categoryIds = items
      .filter((row) => row.targetType === 'CATEGORY' && row.targetId)
      .map((row) => row.targetId!);
    const groupIds = items
      .filter((row) => row.targetType === 'BESTSELLERS' && row.targetId)
      .map((row) => row.targetId!);
    const productIds = items
      .filter((row) => row.targetType === 'PRODUCT' && row.targetId)
      .map((row) => row.targetId!);

    const [categories, groups, products] = await Promise.all([
      categoryIds.length
        ? this.prisma.client.catalogCategory.findMany({
            where: { id: { in: categoryIds } },
            select: { id: true, name: true, slug: true, visibility: true },
          })
        : Promise.resolve([]),
      groupIds.length
        ? this.prisma.client.bestsellerGroup.findMany({
            where: { id: { in: groupIds } },
            select: { id: true, name: true, slug: true },
          })
        : Promise.resolve([]),
      productIds.length
        ? this.prisma.client.product.findMany({
            where: { id: { in: productIds } },
            select: { id: true, name: true, slug: true, lifecycle: true },
          })
        : Promise.resolve([]),
    ]);
    const categoryById = new Map(categories.map((row) => [row.id, row]));
    const groupById = new Map(groups.map((row) => [row.id, row]));
    const productById = new Map(products.map((row) => [row.id, row]));

    return items.map((row) => {
      if (row.targetType === 'GROUP') {
        return {
          ...row,
          href: '',
          targetLabel: 'Группа',
          unavailable: false,
          unavailableReason: null,
        };
      }
      if (row.targetType === 'CATEGORY' && row.targetId) {
        const category = categoryById.get(row.targetId);
        const status = navigationCategoryTargetAvailability(category);
        return {
          ...row,
          href: category ? categoryPublicHref(category.slug) : '#',
          targetLabel: status.targetLabel,
          unavailable: !status.available,
          unavailableReason: status.reason,
        };
      }
      if (row.targetType === 'PRODUCT' && row.targetId) {
        const product = productById.get(row.targetId);
        if (!product || product.lifecycle === 'ARCHIVED') {
          return {
            ...row,
            href: '#',
            targetLabel: 'Товар · (недоступен)',
            unavailable: true,
            unavailableReason: 'Товар удалён или в архиве — пункт не показывается на витрине',
          };
        }
        return {
          ...row,
          href: `/bukety/${encodeURIComponent(product.slug)}`,
          targetLabel: `Товар · ${product.name}`,
          unavailable: product.lifecycle !== 'PUBLISHED',
          unavailableReason:
            product.lifecycle !== 'PUBLISHED'
              ? 'Товар не опубликован — пункт не показывается на витрине'
              : null,
        };
      }
      if (row.targetType === 'PROMOTIONS') {
        return {
          ...row,
          href: '/akcii',
          targetLabel: 'Акции',
          unavailable: false,
          unavailableReason: null,
        };
      }
      if (row.targetType === 'BESTSELLERS') {
        if (row.targetId) {
          const group = groupById.get(row.targetId);
          if (!group) {
            return {
              ...row,
              href: '/bukety',
              targetLabel: 'Бестселлеры · (удалена)',
              unavailable: true,
              unavailableReason: 'Подборка бестселлеров удалена — пункт не показывается на витрине',
            };
          }
          return {
            ...row,
            href: `/bukety?bestseller=${encodeURIComponent(group.slug)}`,
            targetLabel: `Бестселлеры · ${group.name}`,
            unavailable: false,
            unavailableReason: null,
          };
        }
        return {
          ...row,
          href: '/bukety',
          targetLabel: 'Бестселлеры',
          unavailable: false,
          unavailableReason: null,
        };
      }
      if (row.targetType === 'PAGE' && row.customHref) {
        const href = navigationPageHref(row.customHref) ?? '#';
        return {
          ...row,
          href,
          targetLabel: `Страница · ${row.customHref}`,
          unavailable: href === '#',
          unavailableReason: href === '#' ? 'Страница недоступна' : null,
        };
      }
      return {
        ...row,
        href: row.customHref ?? '#',
        targetLabel: `Ссылка · ${row.customHref ?? '—'}`,
        unavailable: false,
        unavailableReason: null,
      };
    });
  }

  private pruneEmptyGroups(
    items: NavigationMenuItemPublicDto[],
  ): NavigationMenuItemPublicDto[] {
    return items
      .map((item) => {
        const children = this.pruneEmptyGroups(item.children);
        return { ...item, children };
      })
      .filter((item) => item.targetType !== 'GROUP' || item.children.length > 0);
  }

  private toPublicTree(
    roots: Array<ItemRow & { href: string; unavailable: boolean }>,
    all: Array<ItemRow & { href: string; unavailable: boolean }>,
  ): NavigationMenuItemPublicDto[] {
    return roots.map((row) => ({
      id: row.id,
      label: row.label,
      href: row.href,
      accent: row.accent,
      openInNewTab: row.openInNewTab,
      iconKey: row.iconKey,
      targetType: row.targetType,
      children: this.toPublicTree(
        all.filter((child) => child.parentId === row.id),
        all,
      ),
    }));
  }

  private toAdminTree(
    roots: Array<
      ItemRow & {
        href: string;
        targetLabel: string;
        unavailable: boolean;
        unavailableReason: string | null;
      }
    >,
    all: Array<
      ItemRow & {
        href: string;
        targetLabel: string;
        unavailable: boolean;
        unavailableReason: string | null;
      }
    >,
  ): NavigationMenuItemAdminDto[] {
    return roots.map((row) => ({
      id: row.id,
      parentId: row.parentId,
      label: row.label,
      targetType: row.targetType,
      targetId: row.targetId,
      customHref: row.customHref,
      iconKey: row.iconKey,
      href: row.href,
      sortOrder: row.sortOrder,
      enabled: row.enabled,
      openInNewTab: row.openInNewTab,
      accent: row.accent,
      version: row.version,
      targetLabel: row.targetLabel,
      unavailable: row.unavailable,
      unavailableReason: row.unavailableReason,
      children: this.toAdminTree(
        all.filter((child) => child.parentId === row.id),
        all,
      ),
    }));
  }

  private async collectDescendantIds(rootId: string): Promise<Set<string>> {
    const all = await this.prisma.client.navigationMenuItem.findMany({
      select: { id: true, parentId: true },
    });
    const children = new Map<string, string[]>();
    for (const row of all) {
      if (!row.parentId) continue;
      const list = children.get(row.parentId) ?? [];
      list.push(row.id);
      children.set(row.parentId, list);
    }
    const out = new Set<string>();
    const stack = [rootId];
    while (stack.length > 0) {
      const id = stack.pop()!;
      for (const childId of children.get(id) ?? []) {
        if (out.has(childId)) continue;
        out.add(childId);
        stack.push(childId);
      }
    }
    return out;
  }
}
