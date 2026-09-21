export default function CatalogLoading() {
  return (
    <main className="sf-container py-10 md:py-14" aria-busy="true" aria-label="Загрузка каталога">
      <div className="mb-8 space-y-3">
        <div className="sf-skeleton h-10 w-64 rounded-[var(--radius-md)]" />
        <div className="sf-skeleton h-5 w-80 max-w-full rounded-[var(--radius-sm)]" />
      </div>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, index) => (
          <div key={index} className="space-y-3">
            <div className="sf-skeleton aspect-[4/5] rounded-[var(--radius-md)]" />
            <div className="sf-skeleton h-4 w-[75%] rounded-[var(--radius-sm)]" />
            <div className="sf-skeleton h-4 w-[50%] rounded-[var(--radius-sm)]" />
          </div>
        ))}
      </div>
    </main>
  );
}
