'use client';

import { useEffect, useId, useRef, useState, type CSSProperties } from 'react';

const DEFAULT_MIN_MAJOR = 0;
const DEFAULT_MAX_MAJOR = 500;

export function minorToMajorDisplay(minor?: string | null): string {
  if (!minor || !/^\d+$/.test(minor)) return '';
  const value = Number(minor) / 100;
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

export function majorToMinor(raw: string): string | undefined {
  const trimmed = raw.trim().replace(',', '.');
  if (!trimmed) return undefined;
  const num = Number(trimmed);
  if (!Number.isFinite(num) || num < 0) return undefined;
  return String(Math.round(num * 100));
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function parseMajor(raw: string, fallback: number): number {
  const num = Number(raw.trim().replace(',', '.'));
  return Number.isFinite(num) ? num : fallback;
}

type Props = {
  minMinor?: string;
  maxMinor?: string;
  /** Absolute bounds in major currency units (BYN). */
  boundMinMajor?: number;
  boundMaxMajor?: number;
  onApply: (next: { minPriceMinor?: string; maxPriceMinor?: string }) => void;
};

/**
 * Dual inputs + dual-thumb range slider for catalog price filters.
 * Values are edited in major units; `onApply` receives minor-unit strings.
 */
export function PriceRangeFilter({
  minMinor,
  maxMinor,
  boundMinMajor = DEFAULT_MIN_MAJOR,
  boundMaxMajor = DEFAULT_MAX_MAJOR,
  onApply,
}: Props) {
  const boundMin = Math.min(boundMinMajor, boundMaxMajor);
  const boundMax = Math.max(boundMinMajor, boundMaxMajor);
  const span = Math.max(boundMax - boundMin, 1);

  const [minMajor, setMinMajor] = useState(() => {
    const fromUrl = minorToMajorDisplay(minMinor);
    return fromUrl || String(boundMin);
  });
  const [maxMajor, setMaxMajor] = useState(() => {
    const fromUrl = minorToMajorDisplay(maxMinor);
    return fromUrl || String(boundMax);
  });

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const baseId = useId();

  useEffect(() => {
    setMinMajor(minorToMajorDisplay(minMinor) || String(boundMin));
    setMaxMajor(minorToMajorDisplay(maxMinor) || String(boundMax));
  }, [minMinor, maxMinor, boundMin, boundMax]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const minVal = clamp(parseMajor(minMajor, boundMin), boundMin, boundMax);
  const maxVal = clamp(parseMajor(maxMajor, boundMax), boundMin, boundMax);
  const lo = Math.min(minVal, maxVal);
  const hi = Math.max(minVal, maxVal);

  const leftPct = ((lo - boundMin) / span) * 100;
  const rightPct = ((hi - boundMin) / span) * 100;

  const commit = (nextMin: number, nextMax: number) => {
    const a = clamp(Math.min(nextMin, nextMax), boundMin, boundMax);
    const b = clamp(Math.max(nextMin, nextMax), boundMin, boundMax);
    const nextMinMinor = a <= boundMin + 0.001 ? undefined : majorToMinor(String(a));
    const nextMaxMinor = b >= boundMax - 0.001 ? undefined : majorToMinor(String(b));
    onApply({ minPriceMinor: nextMinMinor, maxPriceMinor: nextMaxMinor });
  };

  const commitDebounced = (nextMin: number, nextMax: number) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => commit(nextMin, nextMax), 280);
  };

  const syncFromInputs = () => {
    const a = clamp(parseMajor(minMajor, boundMin), boundMin, boundMax);
    const b = clamp(parseMajor(maxMajor, boundMax), boundMin, boundMax);
    setMinMajor(String(Math.min(a, b)));
    setMaxMajor(String(Math.max(a, b)));
    commit(a, b);
  };

  return (
    <div className="sf-price-range">
      <div className="sf-price-inputs">
        <input
          id={`${baseId}-min`}
          type="text"
          inputMode="decimal"
          aria-label="Цена от"
          value={minMajor}
          onChange={(event) => setMinMajor(event.target.value)}
          onBlur={syncFromInputs}
          onKeyDown={(event) => {
            if (event.key === 'Enter') syncFromInputs();
          }}
        />
        <span className="sf-price-inputs__sep" aria-hidden>
          —
        </span>
        <input
          id={`${baseId}-max`}
          type="text"
          inputMode="decimal"
          aria-label="Цена до"
          value={maxMajor}
          onChange={(event) => setMaxMajor(event.target.value)}
          onBlur={syncFromInputs}
          onKeyDown={(event) => {
            if (event.key === 'Enter') syncFromInputs();
          }}
        />
      </div>

      <div
        className="sf-price-slider"
        style={
          {
            '--sf-range-left': `${leftPct}%`,
            '--sf-range-right': `${rightPct}%`,
          } as CSSProperties
        }
      >
        <div className="sf-price-slider__track" aria-hidden />
        <div className="sf-price-slider__fill" aria-hidden />
        <input
          type="range"
          className="sf-price-slider__thumb"
          min={boundMin}
          max={boundMax}
          step={1}
          value={lo}
          aria-label="Минимальная цена"
          onChange={(event) => {
            const next = Number(event.target.value);
            const nextLo = Math.min(next, hi);
            setMinMajor(String(nextLo));
            commitDebounced(nextLo, hi);
          }}
        />
        <input
          type="range"
          className="sf-price-slider__thumb"
          min={boundMin}
          max={boundMax}
          step={1}
          value={hi}
          aria-label="Максимальная цена"
          onChange={(event) => {
            const next = Number(event.target.value);
            const nextHi = Math.max(next, lo);
            setMaxMajor(String(nextHi));
            commitDebounced(lo, nextHi);
          }}
        />
      </div>
    </div>
  );
}
