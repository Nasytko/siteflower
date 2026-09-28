'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { BudgetRangeDto, PaginatedResponse } from '@bouquet-one/contracts';
import { Button } from '@bouquet-one/ui';
import { adminGet, adminPatch, adminPost, errorMessage } from '@/lib/admin-client';
import { adminEndpoints } from '@/lib/admin-endpoints';
import { unwrapAdminList } from '@/lib/admin-list';
import { isMajorInputValid, majorInputToMinor, minorToMajorInput } from '@/lib/admin-money';

type Props = {
  initial: BudgetRangeDto[];
  canUpdate: boolean;
};

type Draft = {
  label: string;
  minMajor: string;
  maxMajor: string;
};

function byOrder(a: BudgetRangeDto, b: BudgetRangeDto): number {
  return a.sortOrder - b.sortOrder || a.label.localeCompare(b.label, 'ru');
}

function toDraft(range: BudgetRangeDto): Draft {
  return {
    label: range.label,
    minMajor: minorToMajorInput(range.minMinor),
    maxMajor: minorToMajorInput(range.maxMinor),
  };
}

function validateDraft(draft: Draft): string | null {
  if (draft.label.trim().length === 0) return 'Укажите название диапазона';
  if (!isMajorInputValid(draft.minMajor) || !isMajorInputValid(draft.maxMajor)) {
    return 'Сумма указывается в BYN, например 150 или 150,50';
  }
  const min = majorInputToMinor(draft.minMajor);
  const max = majorInputToMinor(draft.maxMajor);
  if (min !== null && max !== null && BigInt(min) > BigInt(max)) {
    return '«От» не может быть больше «До»';
  }
  if (min === null && max === null) return 'Заполните хотя бы одну границу';
  return null;
}

export function BudgetRangesEditor({ initial, canUpdate }: Props) {
  const router = useRouter();
  const [ranges, setRanges] = useState<BudgetRangeDto[]>(() => [...initial].sort(byOrder));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function reload() {
    const payload = await adminGet<PaginatedResponse<BudgetRangeDto> | BudgetRangeDto[]>(
      adminEndpoints.budgetRanges,
    );
    setRanges(unwrapAdminList(payload).sort(byOrder));
  }

  async function run(action: () => Promise<void>) {
    setPending(true);
    setError(null);
    try {
      await action();
      await reload();
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPending(false);
    }
  }

  async function onCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canUpdate) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const next: Draft = {
      label: String(data.get('label') ?? ''),
      minMajor: String(data.get('min') ?? ''),
      maxMajor: String(data.get('max') ?? ''),
    };
    const problem = validateDraft(next);
    if (problem) {
      setError(problem);
      return;
    }
    await run(async () => {
      await adminPost(adminEndpoints.budgetRanges, {
        label: next.label.trim(),
        minMinor: majorInputToMinor(next.minMajor),
        maxMinor: majorInputToMinor(next.maxMajor),
        sortOrder: (ranges.at(-1)?.sortOrder ?? 0) + 10,
        active: true,
      });
      form.reset();
    });
  }

  async function saveEdit(range: BudgetRangeDto) {
    if (!canUpdate || !draft) return;
    const problem = validateDraft(draft);
    if (problem) {
      setError(problem);
      return;
    }
    await run(async () => {
      await adminPatch(adminEndpoints.budgetRange(range.id), {
        expectedVersion: range.version,
        label: draft.label.trim(),
        minMinor: majorInputToMinor(draft.minMajor),
        maxMinor: majorInputToMinor(draft.maxMajor),
      });
      setEditingId(null);
      setDraft(null);
    });
  }

  async function toggleActive(range: BudgetRangeDto) {
    if (!canUpdate) return;
    await run(async () => {
      await adminPatch(adminEndpoints.budgetRange(range.id), {
        expectedVersion: range.version,
        active: !range.active,
      });
    });
  }

  async function move(range: BudgetRangeDto, direction: -1 | 1) {
    if (!canUpdate) return;
    const index = ranges.findIndex((item) => item.id === range.id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= ranges.length) return;
    const reordered = [...ranges];
    const [moved] = reordered.splice(index, 1);
    reordered.splice(target, 0, moved!);

    await run(async () => {
      for (const [position, item] of reordered.entries()) {
        const sortOrder = (position + 1) * 10;
        if (item.sortOrder === sortOrder) continue;
        await adminPatch(adminEndpoints.budgetRange(item.id), {
          expectedVersion: item.version,
          sortOrder,
        });
      }
    });
  }

  return (
    <section className="admin-section">
      <h2 className="admin-section__title">Бюджет</h2>
      <p className="admin-section__lead">
        Диапазоны цен для подбора букета на витрине. Суммы вводятся в BYN.
      </p>

      {error ? (
        <p role="alert" className="admin-error">
          {error}
        </p>
      ) : null}

      <div className="admin-panel overflow-x-auto">
        <table className="admin-table min-w-[720px]">
          <thead>
            <tr>
              <th className="w-24">Порядок</th>
              <th>Название</th>
              <th className="w-32">От, BYN</th>
              <th className="w-32">До, BYN</th>
              <th className="w-32">Витрина</th>
              <th className="w-56">Действия</th>
            </tr>
          </thead>
          <tbody>
            {ranges.length === 0 ? (
              <tr>
                <td colSpan={6}>
                  <p className="admin-empty">Диапазоны не заданы</p>
                </td>
              </tr>
            ) : (
              ranges.map((range, index) => {
                const editing = editingId === range.id && draft !== null;
                return (
                  <tr key={range.id} className={range.active ? '' : 'admin-row--muted'}>
                    <td>
                      <div className="admin-row-actions">
                        <button
                          type="button"
                          className="admin-icon-btn"
                          aria-label="Выше"
                          disabled={!canUpdate || pending || index === 0}
                          onClick={() => void move(range, -1)}
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          className="admin-icon-btn"
                          aria-label="Ниже"
                          disabled={!canUpdate || pending || index === ranges.length - 1}
                          onClick={() => void move(range, 1)}
                        >
                          ↓
                        </button>
                      </div>
                    </td>
                    <td>
                      {editing ? (
                        <input
                          className="admin-input"
                          aria-label="Название"
                          value={draft.label}
                          onChange={(event) =>
                            setDraft((prev) => (prev ? { ...prev, label: event.target.value } : prev))
                          }
                        />
                      ) : (
                        <span className="font-semibold text-[var(--admin-ink)]">{range.label}</span>
                      )}
                    </td>
                    <td className="tabular-nums">
                      {editing ? (
                        <input
                          className="admin-input w-28"
                          aria-label="От"
                          inputMode="decimal"
                          placeholder="без границы"
                          value={draft.minMajor}
                          onChange={(event) =>
                            setDraft((prev) =>
                              prev ? { ...prev, minMajor: event.target.value } : prev,
                            )
                          }
                        />
                      ) : (
                        minorToMajorInput(range.minMinor) || '—'
                      )}
                    </td>
                    <td className="tabular-nums">
                      {editing ? (
                        <input
                          className="admin-input w-28"
                          aria-label="До"
                          inputMode="decimal"
                          placeholder="без границы"
                          value={draft.maxMajor}
                          onChange={(event) =>
                            setDraft((prev) =>
                              prev ? { ...prev, maxMajor: event.target.value } : prev,
                            )
                          }
                        />
                      ) : (
                        minorToMajorInput(range.maxMinor) || '—'
                      )}
                    </td>
                    <td>
                      <span className={`admin-chip ${range.active ? '' : 'admin-chip--muted'}`}>
                        {range.active ? 'Показан' : 'Скрыт'}
                      </span>
                    </td>
                    <td>
                      {canUpdate ? (
                        <div className="admin-row-actions">
                          {editing ? (
                            <>
                              <button
                                type="button"
                                className="admin-btn-ghost"
                                disabled={pending}
                                onClick={() => void saveEdit(range)}
                              >
                                Сохранить
                              </button>
                              <button
                                type="button"
                                className="admin-btn-ghost"
                                disabled={pending}
                                onClick={() => {
                                  setEditingId(null);
                                  setDraft(null);
                                }}
                              >
                                Отмена
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                type="button"
                                className="admin-btn-ghost"
                                disabled={pending}
                                onClick={() => {
                                  setEditingId(range.id);
                                  setDraft(toDraft(range));
                                  setError(null);
                                }}
                              >
                                Изменить
                              </button>
                              <button
                                type="button"
                                className="admin-btn-ghost"
                                disabled={pending}
                                onClick={() => void toggleActive(range)}
                              >
                                {range.active ? 'Скрыть' : 'Показать'}
                              </button>
                            </>
                          )}
                        </div>
                      ) : (
                        <span className="text-sm text-[var(--admin-muted)]">Только просмотр</span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {canUpdate ? (
        <form onSubmit={onCreate} className="admin-toolbar">
          <label className="admin-field">
            <span>Название</span>
            <input name="label" required className="admin-input w-48" placeholder="До 100 BYN" />
          </label>
          <label className="admin-field">
            <span>От, BYN</span>
            <input name="min" className="admin-input w-28" inputMode="decimal" placeholder="—" />
          </label>
          <label className="admin-field">
            <span>До, BYN</span>
            <input name="max" className="admin-input w-28" inputMode="decimal" placeholder="100" />
          </label>
          <Button type="submit" disabled={pending} className="!rounded-lg !bg-[var(--admin-brand)]">
            Добавить диапазон
          </Button>
        </form>
      ) : null}

      <p className="admin-help">
        Пустая граница означает «без ограничения»: «До 100» — только верхняя граница, «200 и выше» —
        только нижняя.
      </p>
    </section>
  );
}
