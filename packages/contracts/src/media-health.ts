export const MEDIA_ASSET_LIST_STATUSES = ['referenced', 'grace', 'purgeable'] as const;
export type MediaAssetListStatus = (typeof MEDIA_ASSET_LIST_STATUSES)[number];

export type MediaAssetAdminListItemDto = {
  id: string;
  storageKey: string;
  url: string;
  byteSize: number;
  mimeType: string;
  width: number | null;
  height: number | null;
  orphanedAt: string | null;
  createdAt: string;
  refs: Array<
    | { kind: 'product'; productId: string; productSlug: string; productName: string }
    | { kind: 'navigation'; itemId: string; label: string }
  >;
};

export type MediaAssetAdminListDto = {
  status: MediaAssetListStatus;
  items: MediaAssetAdminListItemDto[];
  total: number;
  page: number;
  pageSize: number;
};

export type MediaAssetPurgeResultDto = {
  id: string;
  deleted: boolean;
  deletedKeys: string[];
};
