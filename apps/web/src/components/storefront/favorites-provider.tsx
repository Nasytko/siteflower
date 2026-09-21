'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { trackEvent } from '@/lib/analytics';
import {
  emptyFavorites,
  isFavorite,
  readFavorites,
  toggleFavorite,
  writeFavorites,
  type FavoritesState,
} from '@/lib/favorites';

type FavoritesContextValue = {
  state: FavoritesState;
  ready: boolean;
  has: (productId: string) => boolean;
  toggle: (input: { productId: string; slug: string }) => void;
};

const FavoritesContext = createContext<FavoritesContextValue | null>(null);

export function FavoritesProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<FavoritesState>(emptyFavorites);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setState(readFavorites());
    setReady(true);
    const onStorage = (event: StorageEvent) => {
      if (event.key === 'bouquet-one:favorites:v1') {
        setState(readFavorites());
      }
    };
    const onCustom = () => setState(readFavorites());
    window.addEventListener('storage', onStorage);
    window.addEventListener('bouquet:favorites', onCustom as EventListener);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('bouquet:favorites', onCustom as EventListener);
    };
  }, []);

  const toggle = useCallback((input: { productId: string; slug: string }) => {
    setState((prev) => {
      const next = toggleFavorite(prev, input);
      writeFavorites(next);
      const added = isFavorite(next, input.productId);
      trackEvent(added ? 'add_to_favorites' : 'remove_from_favorites', input);
      return next;
    });
  }, []);

  const value = useMemo<FavoritesContextValue>(
    () => ({
      state,
      ready,
      has: (productId: string) => isFavorite(state, productId),
      toggle,
    }),
    [state, ready, toggle],
  );

  return <FavoritesContext.Provider value={value}>{children}</FavoritesContext.Provider>;
}

export function useFavorites(): FavoritesContextValue {
  const ctx = useContext(FavoritesContext);
  if (!ctx) {
    throw new Error('useFavorites must be used within FavoritesProvider');
  }
  return ctx;
}
