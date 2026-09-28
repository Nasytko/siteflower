export default function CatalogLoading() {
  return (
    <main className="sf-container-wide py-5 sm:py-7" aria-busy="true" aria-label="Загрузка каталога">
      <div className="mb-5 space-y-2.5">
        <div className="sf-skeleton h-8 w-48 rounded-[var(--radius-sm)]" />
        <div className="sf-skeleton h-5 w-80 max-w-full rounded-[var(--radius-sm)]" />
      </div>
      <div className="mb-5 flex flex-wrap gap-2">
        {Array.from({ length: 5 }).map((_, index) => (
          <div key={index} className="sf-skeleton h-11 w-32 rounded-full" />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-8 md:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, index) => (
          <div key={index} className="space-y-3">
            <div className="sf-skeleton aspect-[4/5] rounded-[var(--radius-lg)]" />
            <div className="sf-skeleton h-4 w-[75%] rounded-[var(--radius-sm)]" />
            <div className="sf-skeleton h-4 w-[50%] rounded-[var(--radius-sm)]" />
          </div>
        ))}
      </div>
    </main>
  );
}
