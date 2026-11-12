export default function Loading() {
  return (
    <div className="min-h-screen bg-slate-50 p-4 sm:p-6 lg:p-8" role="status" aria-label="Loading page">
      <div className="mx-auto w-full max-w-7xl animate-pulse space-y-6">
        <div className="h-10 w-56 rounded-xl bg-slate-200" />
        <div className="h-28 rounded-2xl bg-white shadow-sm ring-1 ring-slate-200" />
        <div className="grid gap-5 md:grid-cols-2">
          <div className="h-56 rounded-2xl bg-white shadow-sm ring-1 ring-slate-200" />
          <div className="h-56 rounded-2xl bg-white shadow-sm ring-1 ring-slate-200" />
        </div>
      </div>
      <span className="sr-only">Loading page content…</span>
    </div>
  );
}
