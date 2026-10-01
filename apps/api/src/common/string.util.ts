/** Trim whitespace; empty or nullish → null. Safe for admin PATCH clearing optional strings. */
export function trimmedOrNull(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}
