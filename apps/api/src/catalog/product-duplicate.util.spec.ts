import {
  allocateDuplicateSlug,
  buildDuplicateProductName,
  buildDuplicateSlugCandidate,
  DUPLICATE_SLUG_MAX_ATTEMPTS,
} from './product-duplicate.util';

describe('product-duplicate.util', () => {
  describe('buildDuplicateProductName', () => {
    it('appends Russian copy suffix', () => {
      expect(buildDuplicateProductName('Красные розы')).toBe('Красные розы — копия');
    });

    it('truncates long names to fit VARCHAR(200)', () => {
      const long = 'А'.repeat(220);
      const result = buildDuplicateProductName(long);
      expect(result.length).toBeLessThanOrEqual(200);
      expect(result.endsWith(' — копия')).toBe(true);
    });
  });

  describe('buildDuplicateSlugCandidate', () => {
    it('uses -kopiya for the first attempt', () => {
      expect(buildDuplicateSlugCandidate('krasnye-rozy', 1)).toBe('krasnye-rozy-kopiya');
    });

    it('uses numeric suffix on collision attempts', () => {
      expect(buildDuplicateSlugCandidate('krasnye-rozy', 2)).toBe('krasnye-rozy-kopiya-2');
      expect(buildDuplicateSlugCandidate('krasnye-rozy', 3)).toBe('krasnye-rozy-kopiya-3');
    });

    it('stays within slug length bound', () => {
      const long = 'a'.repeat(160);
      const candidate = buildDuplicateSlugCandidate(long, 12);
      expect(candidate.length).toBeLessThanOrEqual(160);
    });
  });

  describe('allocateDuplicateSlug', () => {
    it('returns first free candidate', async () => {
      const taken = new Set(['krasnye-rozy-kopiya']);
      const slug = await allocateDuplicateSlug('krasnye-rozy', async (s) => taken.has(s));
      expect(slug).toBe('krasnye-rozy-kopiya-2');
    });

    it('stops after max attempts', async () => {
      await expect(
        allocateDuplicateSlug('x', async () => true),
      ).rejects.toThrow(/unique slug/);
      expect(DUPLICATE_SLUG_MAX_ATTEMPTS).toBeGreaterThan(1);
    });
  });
});
