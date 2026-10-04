import type { ReactNode } from 'react';

type Props = {
  title: string;
  lead?: ReactNode;
  actions?: ReactNode;
};

/** Shared admin page chrome: title + optional lead + primary actions on the right. */
export function AdminPageHeader({ title, lead, actions }: Props) {
  return (
    <header className="admin-page-header">
      <div className="admin-page-header__text">
        <h1 className="admin-page-title">{title}</h1>
        {lead ? <p className="admin-page-lead">{lead}</p> : null}
      </div>
      {actions ? <div className="admin-page-header__actions">{actions}</div> : null}
    </header>
  );
}
