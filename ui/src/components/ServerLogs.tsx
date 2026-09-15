import { useEffect, useState } from "react";
import { useAuth } from "@usace-watermanagement/groundwork-water";
import { Button } from "@usace/groundwork";
import fetchWithAuth from "../utils/fetchWithAuth";

interface LogEntry {
  eventId: string;
  timestamp: number;
  ingestionTime: number | null;
  logStreamName: string;
  level: string;
  message: string;
  fields: Record<string, unknown> | null;
}
interface LogPage {
  entries: LogEntry[];
  nextCursor: string | null;
  startTime: number;
  endTime: number;
  logGroup: string;
}
const MAX_ENTRIES = 2000;

export function ServerLogs() {
  const auth = useAuth();
  const [level, setLevel] = useState("ALL");
  const [hours, setHours] = useState(1);
  const [request, setRequest] = useState<{ serial: number; cursor?: string; start?: number; end?: number }>({ serial: 0 });
  const [data, setData] = useState<LogPage>();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!auth.isAuth) return;
    const controller = new AbortController();
    const end = request.end ?? Date.now();
    const params = new URLSearchParams({ start_time: String(request.start ?? end - hours * 3600000), end_time: String(end) });
    if (request.cursor) params.set("cursor", request.cursor);
    void fetchWithAuth(`/api/server-logs?${params}`, { signal: controller.signal }, auth.token)
      .then(response => response.json() as Promise<LogPage>)
      .then(page => {
        if (controller.signal.aborted) return;
        if (!Array.isArray(page.entries) || !Number.isFinite(page.startTime) || !Number.isFinite(page.endTime)) {
          throw new Error("The server returned an invalid log response.");
        }
        setData(previous => {
          const entries = request.cursor ? [...(previous?.entries ?? []), ...page.entries] : page.entries;
          return { ...page, entries: [...new Map(entries.map(entry => [entry.eventId, entry])).values()].slice(0, MAX_ENTRIES) };
        });
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Unable to load server logs.");
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [auth.isAuth, auth.token, hours, request]);

  const refresh = (newHours = hours) => {
    setLoading(true);
    setError("");
    setData(undefined);
    setHours(newHours);
    setRequest(previous => ({ serial: previous.serial + 1 }));
  };
  const entries = data?.entries.filter(entry => level === "ALL" || entry.level === level) ?? [];
  return <section aria-labelledby="server-logs-heading" className="mt-5 min-w-0 space-y-3 border-t pt-4">
    <h2 id="server-logs-heading" className="font-semibold">Server logs</h2>
    <p className="text-sm text-gray-600">API server output from CloudWatch. For Java or other job output, open the run in Job History.</p>
    <div className="flex flex-wrap items-end gap-3">
      <label className="text-sm">Log level
        <select aria-label="Log level" className="ml-2 rounded border p-2" value={level} onChange={event => setLevel(event.target.value)}>
          {["ALL", "TRACE", "DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL", "UNKNOWN"].map(value => <option key={value} value={value}>{value === "ALL" ? "All levels" : value}</option>)}
        </select>
      </label>
      <label className="text-sm">Time range
        <select aria-label="Time range" className="ml-2 rounded border p-2" value={hours} onChange={event => refresh(Number(event.target.value))}>
          <option value={0.25}>Last 15 minutes</option><option value={1}>Last hour</option><option value={6}>Last 6 hours</option><option value={24}>Last 24 hours</option>
        </select>
      </label>
      <Button type="button" disabled={loading} onClick={() => refresh()}>Refresh server logs</Button>
    </div>
    {error && <p role="alert" className="text-sm text-red-800">Server logs unavailable. {error} Use Refresh server logs to try again.</p>}
    <p role="status" className="text-sm text-gray-600">{loading ? "Loading server logs…" : `${entries.length} shown of ${data?.entries.length ?? 0} loaded entries. Level filtering applies to loaded entries.`}</p>
    {data && <>
      <p className="break-all text-xs text-gray-600">{data.logGroup} · {new Date(data.startTime).toLocaleString()} – {new Date(data.endTime).toLocaleString()} · Oldest first</p>
      <div role="region" aria-label="Server log entries" tabIndex={0} className="max-h-[35dvh] overflow-auto overscroll-contain rounded border">
        <table className="w-full min-w-[640px] table-fixed text-left text-sm">
          <caption className="sr-only">Server log entries with CloudWatch details</caption>
          <thead className="sticky top-0 bg-gray-100"><tr><th className="w-28 p-2">Time</th><th className="w-24 p-2">Level</th><th className="p-2">Message</th></tr></thead>
          <tbody>{entries.map(entry => <tr key={entry.eventId} className="border-t align-top">
            <td className="break-words p-2"><time dateTime={new Date(entry.timestamp).toISOString()}>{new Date(entry.timestamp).toLocaleString()}</time></td>
            <td className={`p-2 font-semibold ${["ERROR", "CRITICAL"].includes(entry.level) ? "text-red-800" : entry.level === "WARNING" ? "text-amber-800" : "text-gray-700"}`}>{entry.level}</td>
            <td className="min-w-0 p-2"><pre className="whitespace-pre-wrap break-words [overflow-wrap:anywhere] text-xs">{entry.message}</pre>
              <details className="mt-2 text-xs"><summary className="cursor-pointer">CloudWatch details</summary>
                <dl className="space-y-1 break-all"><dt>Stream</dt><dd>{entry.logStreamName}</dd><dt>Event ID</dt><dd>{entry.eventId}</dd><dt>Ingested</dt><dd>{entry.ingestionTime == null ? "Unavailable" : new Date(entry.ingestionTime).toISOString()}</dd></dl>
                {entry.fields && <pre className="mt-2 whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{JSON.stringify(entry.fields, null, 2)}</pre>}
              </details>
            </td>
          </tr>)}</tbody>
        </table>
      </div>
      {!entries.length && <p className="text-sm">{data.nextCursor ? "No matching entries on the loaded pages. Load more to continue searching." : "No matching entries in the loaded time range."}</p>}
      {data.entries.length >= MAX_ENTRIES ? <p className="text-sm">Reached the 2,000-entry display limit. Choose a shorter time range to narrow the results.</p> : data.nextCursor && <Button type="button" disabled={loading || Boolean(error)} onClick={() => {
        setLoading(true);
        setError("");
        setRequest(previous => ({ serial: previous.serial + 1, cursor: data.nextCursor!, start: data.startTime, end: data.endTime }));
      }}>Load more server logs</Button>}
    </>}
  </section>;
}
