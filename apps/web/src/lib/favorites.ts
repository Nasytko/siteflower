/**
 * Local favorites foundation — no auth, refresh-safe.
 * Shape is ready for future authenticated sync (product ids + timestamps).
 */

export const FAVORITES_STORAGE_KEY = 'bouquet-one:favorites:v1';

export type FavoriteEntry = {
  productId: string;
  slug: string;
  savedAt: string;
};

export type FavoritesState = {
  version: 1;
  items: FavoriteEntry[];
};

export function emptyFavorites(): FavoritesState {
  return { version: 1, items: [] };
}

export function parseFavorites(raw: string | null): FavoritesState {
  if (!raw) return emptyFavorites();
  try {
    const parsed = JSON.parse(raw) as FavoritesState;
    if (parsed?.version !== 1 || !Array.isArray(parsed.items)) {
      return emptyFavorites();
    }
    return {
      version: 1,
      items: parsed.items.filter(
        (item) =>
          typeof item?.productId === 'string' &&
          typeof item?.slug === 'string' &&
          typeof item?.savedAt === 'string',
      ),
    };
  } catch {
    return emptyFavorites();
  }
}

export function readFavorites(): FavoritesState {
  if (typeof window === 'undefined') return emptyFavorites();
  return parseFavorites(window.localStorage.getItem(FAVORITES_STORAGE_KEY));
}

export function writeFavorites(state: FavoritesState): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(state));
    window.dispatchEvent(new CustomEvent('bouquet:favorites', { detail: state }));
  } catch {
    // Private mode / quota — keep in-memory state via React only.
  }
}

export function isFavorite(state: FavoritesState, productId: string): boolean {
  return state.items.some((item) => item.productId === productId);
}

export function toggleFavorite(
  state: FavoritesState,
  entry: Omit<FavoriteEntry, 'savedAt'>,
): FavoritesState {
  if (isFavorite(state, entry.productId)) {
    return {
      version: 1,
      items: state.items.filter((item) => item.productId !== entry.productId),
    };
  }
  return {
    version: 1,
    items: [
      ...state.items,
      { productId: entry.productId, slug: entry.slug, savedAt: new Date().toISOString() },
    ],
  };
}
