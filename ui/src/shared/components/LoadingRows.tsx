export function LoadingRows({ count = 5, label = "Loading jobs" }: { count?: number; label?: string }) {
  return <div role="status" aria-label={label} className="space-y-4">
    <span className="sr-only">{label}</span>
    {Array.from({ length: count }, (_, index) => <div key={index} aria-hidden className="h-20 animate-pulse rounded-lg border border-slate-200 bg-slate-50 p-4 motion-reduce:animate-none">
      <div className="mb-3 h-3 w-2/5 rounded bg-slate-200" /><div className="h-3 w-3/5 rounded bg-slate-200" />
    </div>)}
  </div>;
}
