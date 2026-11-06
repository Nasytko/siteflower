/** Align fee copy with checkout: 0 → Бесплатно, invalid → уточняйте, else keep kopecks. */
export function formatDeliveryFeeLabel(minor: string, currency: string): string {
  const raw = String(minor ?? '').trim();
  if (!/^-?\d+$/.test(raw)) return 'Стоимость уточняйте';
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) return 'Стоимость уточняйте';
  if (value === 0) return 'Бесплатно';
  const major = (value / 100).toFixed(2).replace(/\.?0+$/, '');
  return `${major} ${currency}`;
}
