'use client';

import Link from 'next/link';
import { useEffect, useId, useState } from 'react';
import { usePathname } from 'next/navigation';
import type { AdminRole } from '@bouquet-one/contracts';
import {
  adminNavGroupsForRole,
  isAdminNavItemActive,
  type AdminNavGroup,
} from '@/components/admin/admin-shell-nav-data';

type Props = {
  role: AdminRole;
};

function groupIsActive(pathname: string, group: AdminNavGroup): boolean {
  return group.items.some((item) => isAdminNavItemActive(pathname, item));
}

export function AdminShellNav({ role }: Props) {
  const pathname = usePathname();
  const groups = adminNavGroupsForRole(role);
  const baseId = useId();
  const [open, setOpen] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    for (const group of groups) {
      initial[group.id] = groupIsActive(pathname, group) || !group.collapsed;
    }
    return initial;
  });

  useEffect(() => {
    const current = adminNavGroupsForRole(role);
    setOpen((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const group of current) {
        if (groupIsActive(pathname, group) && !next[group.id]) {
          next[group.id] = true;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [pathname, role]);

  return (
    <nav aria-label="Разделы админки" className="admin-nav">
      {groups.map((group) => {
        const active = groupIsActive(pathname, group);
        const collapsible = group.items.length > 1;
        const isOpen = !collapsible || open[group.id] !== false;
        const panelId = `${baseId}-${group.id}`;

        return (
          <div key={group.id} className="admin-nav__group" data-tier={group.tier}>
            {collapsible ? (
              <button
                type="button"
                className={`admin-nav__toggle${active ? ' admin-nav__toggle--active' : ''}`}
                aria-expanded={isOpen}
                aria-controls={panelId}
                onClick={() =>
                  setOpen((prev) => ({
                    ...prev,
                    [group.id]: prev[group.id] === false,
                  }))
                }
              >
                <span>{group.label}</span>
                <span
                  className={`admin-nav__chevron${isOpen ? ' admin-nav__chevron--open' : ''}`}
                  aria-hidden
                />
              </button>
            ) : (
              <p className="admin-nav__group-label">{group.label}</p>
            )}
            <ul id={collapsible ? panelId : undefined} className="admin-nav__list" hidden={!isOpen}>
              {group.items.map((item) => {
                const itemActive = isAdminNavItemActive(pathname, item);
                return (
                  <li key={`${group.id}-${item.href}`}>
                    <Link
                      href={item.href}
                      className={`admin-nav__link ${itemActive ? 'admin-nav__link--active' : ''}`}
                      aria-current={itemActive ? 'page' : undefined}
                    >
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}

/** Where the manager is, using the same groups as the sidebar. */
export function AdminShellCrumb({ role }: Props) {
  const pathname = usePathname();
  const groups = adminNavGroupsForRole(role);
  let match: { group: string; item: string; score: number } | null = null;

  for (const group of groups) {
    for (const item of group.items) {
      if (!isAdminNavItemActive(pathname, item)) continue;
      const score = item.href.length;
      if (!match || score > match.score) {
        match = { group: group.label, item: item.label, score };
      }
    }
  }

  if (!match) return null;

  return (
    <p className="admin-crumb">
      <span>{match.group}</span>
      <span className="admin-crumb__sep" aria-hidden>
        /
      </span>
      <span className="admin-crumb__here">{match.item}</span>
    </p>
  );
}

/** Phone menu. Desktop ignores data-nav and always shows the sidebar. */
export function AdminNavToggle() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    const shell = document.querySelector('.admin-shell');
    if (!shell) return;
    shell.setAttribute('data-nav', open ? 'open' : 'closed');
  }, [open]);

  return (
    <button
      type="button"
      className="admin-nav-toggle"
      aria-expanded={open}
      aria-controls="admin-sidebar-nav"
      onClick={() => setOpen((value) => !value)}
    >
      {open ? 'Закрыть' : 'Меню'}
    </button>
  );
}
