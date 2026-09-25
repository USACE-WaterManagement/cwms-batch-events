import { createFileRoute, Link } from "@tanstack/react-router";
import { useAuth } from "@usace-watermanagement/groundwork-water";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { MdSearch, MdOpenInNew } from "react-icons/md";
import { Button, UsaceBox } from "@usace/groundwork";
import LoginPrompt from "../features/auth/LoginPrompt";
import { RunDatePicker, type RunDateRange } from "../features/jobs-list/RunHistoryControls";
import { dateParams } from "../features/jobs-list/runDateRange";
import fetchWithAuth from "../utils/fetchWithAuth";

export const Route = createFileRoute("/log-search")({ component: LogSearch });
interface Match { jobId: string; name: string; office: string; createdTime: string; snippets: string[] }
interface Page { results: Match[]; nextCursor: string | null; scannedJobs: number; unavailableJobs: number }

function LogSearch() {
  const auth = useAuth();
  const [text, setText] = useState("");
  const [office, setOffice] = useState("");
  const [range, setRange] = useState<RunDateRange>({ start: "", end: "" });
  const [selection, setSelection] = useState<URLSearchParams>();
  const [results, setResults] = useState<Match[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [scanned, setScanned] = useState(0);
  const [unavailable, setUnavailable] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const offices = useQuery<string[]>({ queryKey: ["accessibleOffices"], enabled: auth.isAuth,
    queryFn: async () => (await fetchWithAuth("/api/users/me/offices", {}, auth.token)).json() });
  let progress = "";
  if (cursor) progress = "More output remains to search.";
  else if (!busy && !error) progress = "Search complete.";
  async function search(next = false) {
    const params = next && selection ? new URLSearchParams(selection) : dateParams(range);
    if (!next) {
      params.set("q", text.trim());
      if (office) params.set("office", office);
      setSelection(params);
      setResults([]);
      setScanned(0);
      setUnavailable(0);
      setCursor(null);
    }
    if (next && cursor) params.set("cursor", cursor);
    setBusy(true);
    setError("");
    try {
      const page: Page = await (await fetchWithAuth(`/api/job-log-search?${params}`, {}, auth.token)).json();
      setResults(previous => {
        const combined = new Map((next ? previous : []).map(row => [row.jobId, row]));
        for (const row of page.results) {
          const saved = combined.get(row.jobId);
          combined.set(row.jobId, { ...row, snippets: [...new Set([...(saved?.snippets ?? []), ...row.snippets])].slice(0, 10) });
        }
        return [...combined.values()];
      });
      setScanned(previous => previous + page.scannedJobs);
      setUnavailable(previous => previous + page.unavailableJobs);
      setCursor(page.nextCursor);
    } catch {
      setError("Could not search logs. Try again. Your existing results are preserved.");
    } finally { setBusy(false); }
  }
  if (!auth.isAuth) return <LoginPrompt title="Sign in to search job logs" description="Search output from runs in your offices." />;
  return <div className="mx-auto max-w-4xl"><UsaceBox title="Search job logs">
    <p className="mb-4 text-sm text-slate-600">Search literal text, ignoring case, across runs in your offices. Dates filter when jobs were submitted. Each request scans a bounded section of saved output.</p>
    <form className="space-y-3" onSubmit={event => { event.preventDefault(); void search(); }}>
      <label className="block font-semibold">Search text<input type="search" minLength={2} maxLength={200} required value={text} onChange={event => setText(event.target.value)} placeholder="For example, failed" className="mt-1 block w-full rounded border p-2" /></label>
      <div className="flex flex-wrap items-start gap-4"><label>Office<select className="ml-2 rounded border py-2 pl-3 pr-9" value={office} onChange={event => setOffice(event.target.value)}><option value="">All my offices</option>{offices.data?.map(value => <option key={value}>{value}</option>)}</select></label>
      <RunDatePicker value={range} onChange={setRange} /></div>
      <Button disabled={busy || text.trim().length < 2 || !!(range.start && range.end && range.start > range.end)} type="submit"><MdSearch aria-hidden />{busy ? "Searching…" : "Search logs"}</Button>
    </form>
    {error && <p role="alert" className="my-3 text-red-800">{error}</p>}
    {selection && <p role="status" className="my-4 text-sm">{results.length} matching jobs · {scanned} runs searched · {unavailable} logs unavailable. {progress}</p>}
    <div className="space-y-3">{results.map(row => <article key={row.jobId} className="min-w-0 rounded-lg border p-3">
      <Link className="action-link" to="/jobs/$jobId" params={{ jobId: row.jobId }}><MdOpenInNew aria-hidden />{row.name} · {row.office}</Link>
      <p className="my-2 text-xs text-slate-600">{new Date(row.createdTime).toLocaleString()}</p>
      {row.snippets.map((snippet, index) => <pre key={index} className="my-2 overflow-x-auto rounded bg-slate-100 p-3 text-sm">{snippet}</pre>)}
    </article>)}</div>
    {cursor && <Button className="mt-4" disabled={busy} onClick={() => void search(true)}>Continue search</Button>}
  </UsaceBox></div>;
}
