import type { RunDateRange } from "./runDateRange";
export type { RunDateRange } from "./runDateRange";
export function RunDatePicker({ value, onChange }: { value: RunDateRange; onChange: (range: RunDateRange) => void }) {
  return <fieldset className="min-w-0">
    <legend className="mb-2 text-sm font-semibold">Submitted date range</legend>
    <div className="flex flex-wrap items-center gap-2">
      <label className="flex items-center gap-2 text-sm">From<input aria-label="From date" type="date" max={value.end || undefined} value={value.start} onChange={event => onChange({ ...value, start: event.target.value })} className="min-w-0 rounded border bg-white p-2" /></label>
      <label className="flex items-center gap-2 text-sm">Through<input aria-label="Through date" type="date" min={value.start || undefined} value={value.end} onChange={event => onChange({ ...value, end: event.target.value })} className="min-w-0 rounded border bg-white p-2" /></label>
      {(value.start || value.end) && <button className="action-link" onClick={() => onChange({ start: "", end: "" })}>Clear dates</button>}
    </div>
    <p className="mt-1 text-xs text-slate-600">Both dates included · {Intl.DateTimeFormat().resolvedOptions().timeZone}</p>
    {value.start && value.end && value.start > value.end && <p role="alert">The start date must be on or before the end date.</p>}
  </fieldset>;
}

export function RunPagination({ page, size, total, loading, onPage, onSize }: {
  page: number; size: number; total: number; loading: boolean; onPage: (page: number) => void; onSize: (size: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / size));
  return <nav aria-label="Run history pagination" className="flex flex-wrap items-center gap-3 text-sm">
    <label>Runs per page<select aria-label="Runs per page" className="ml-2 min-w-20 rounded border bg-white py-2 pl-3 pr-9" value={size} onChange={event => onSize(Number(event.target.value))}>
      {[10,25,50,100].map(value => <option key={value}>{value}</option>)}
    </select></label>
    <span role="status">Page {page} of {pages} ({total} runs)</span>
    <button className="action-link disabled:opacity-50" disabled={loading || page <= 1} onClick={() => onPage(page - 1)}>Previous</button>
    <button className="action-link disabled:opacity-50" disabled={loading || page >= pages} onClick={() => onPage(page + 1)}>Next</button>
  </nav>;
}
