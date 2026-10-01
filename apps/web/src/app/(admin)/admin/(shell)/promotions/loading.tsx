export default function AdminPromotionsLoading() {
  return (
    <main id="main-content" className="space-y-6" aria-busy="true">
      <header>
        <h1 className="admin-page-title">Акции</h1>
        <p className="admin-page-lead">Загрузка акций…</p>
      </header>
      <div className="admin-panel py-10 text-center text-sm text-[var(--admin-muted)]">
        Загрузка акций…
      </div>
    </main>
  );
}
