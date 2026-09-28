import { useState } from "react";
import { useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { useAuth } from "@usace-watermanagement/groundwork-water";
import { Link, useNavigate } from "@tanstack/react-router";
import { Button, Modal, UsaceBox } from "@usace/groundwork";
import { MdDashboard, MdWarningAmber, MdPieChart, MdSchedule, MdSpeed, MdRefresh, MdOpenInNew, MdHelpOutline } from "react-icons/md";
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid, LineChart, Line } from "recharts";
import fetchWithAuth from "../../utils/fetchWithAuth";
import { LoadingRows } from "../../shared/components/LoadingRows";
import { SchedulerStatus } from "../scripts-manager/SchedulerStatus";
import type { components } from "../../generated/api-types";

type Summary = components["schemas"]["OperationsSummary"];
type Usage = components["schemas"]["Usage"];
type RateLimitRow = {
  office: string;
  requestsPerMinute: number;
  jobSubmissionsPerMinute: number;
  requestOverride: boolean;
  jobSubmissionOverride: boolean;
  changedBy: string | null;
  changedAt: string | null;
};
type RateLimitHistoryRow = {
  id: number;
  office: string;
  action: "created" | "updated" | "reset" | "legacy";
  previousRequestsPerMinute: number | null;
  previousJobSubmissionsPerMinute: number | null;
  newRequestsPerMinute: number | null;
  newJobSubmissionsPerMinute: number | null;
  changedBy: string;
  changedAt: string;
};
const colors = ["#1d4ed8", "#0f766e", "#9333ea", "#c2410c", "#be123c", "#0369a1", "#4d7c0f", "#475569"];
const number = (value: number) => value.toLocaleString(undefined, { maximumFractionDigits: 1 });
export type AdminTab = "overview" | "operations" | "usage" | "scheduler" | "rate-limits";
const tabs = [
  { id: "overview", label: "Overview", icon: MdDashboard, to: "/admin" },
  { id: "operations", label: "Operations", icon: MdWarningAmber, to: "/admin/operations" },
  { id: "usage", label: "Usage", icon: MdPieChart, to: "/admin/usage" },
  { id: "scheduler", label: "Scheduler", icon: MdSchedule, to: "/admin/scheduler" },
  { id: "rate-limits", label: "Rate limits", icon: MdSpeed, to: "/admin/rate-limits" },
] as const;

function RateLimitHistory({ office, authToken, open }: { office: string; authToken?: string; open: boolean }) {
  const query = useQuery<RateLimitHistoryRow[]>({
    queryKey: ["adminRateLimitHistory", office],
    enabled: open,
    queryFn: async () => (await fetchWithAuth(`/api/admin/rate-limits/${encodeURIComponent(office)}/history`, {}, authToken)).json(),
  });
  if (!open) return null;
  if (query.isPending) return <p className="mt-4 text-sm text-slate-600">Loading change history…</p>;
  if (query.isError) return <p role="alert" className="mt-4 text-sm text-red-800">Change history could not be loaded.</p>;
  return <div className="mt-4">
    <h3 className="font-semibold">Change history</h3>
    <div className="mt-2 max-h-64 overflow-y-auto rounded border border-slate-200 [scrollbar-gutter:stable]">
      <table className="w-full min-w-[42rem] text-left text-sm">
        <caption className="sr-only">Rate-limit change history for {office}</caption>
        <thead className="sticky top-0 border-b bg-slate-50 text-slate-600"><tr><th className="p-2">Action</th><th className="p-2">Previous</th><th className="p-2">New</th><th className="p-2">Changed by</th><th className="p-2">Changed at</th></tr></thead>
        <tbody>{query.data?.map(entry => <tr key={entry.id} className="border-b border-slate-100 align-top">
          <td className="p-2 font-semibold capitalize">{entry.action}</td>
          <td className="p-2">{entry.previousRequestsPerMinute == null ? "—" : `${entry.previousRequestsPerMinute} requests, ${entry.previousJobSubmissionsPerMinute} jobs`}</td>
          <td className="p-2">{entry.newRequestsPerMinute == null ? "Defaults" : `${entry.newRequestsPerMinute} requests, ${entry.newJobSubmissionsPerMinute} jobs`}</td>
          <td className="p-2 whitespace-nowrap">{entry.changedBy}</td>
          <td className="p-2 whitespace-nowrap">{new Date(entry.changedAt).toLocaleString()}</td>
        </tr>)}</tbody>
      </table>
      {!query.data?.length && <p className="p-3 text-slate-500">No recorded changes.</p>}
    </div>
  </div>;
}

function RateLimitsPanel({ authToken }: { authToken?: string }) {
  const queryClient = useQueryClient();
  const [drafts, setDrafts] = useState<Record<string, { requestsPerMinute: string; jobSubmissionsPerMinute: string }>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [helpOpen, setHelpOpen] = useState(false);
  const query = useQuery<RateLimitRow[]>({
    queryKey: ["adminRateLimits"],
    queryFn: async () => (await fetchWithAuth("/api/admin/rate-limits", {}, authToken)).json(),
  });
  const valueFor = (row: RateLimitRow) => drafts[row.office] ?? {
    requestsPerMinute: String(row.requestsPerMinute),
    jobSubmissionsPerMinute: String(row.jobSubmissionsPerMinute),
  };
  const save = async (row: RateLimitRow) => {
    const value = valueFor(row);
    await fetchWithAuth(`/api/admin/rate-limits/${encodeURIComponent(row.office)}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requestsPerMinute: Number(value.requestsPerMinute), jobSubmissionsPerMinute: Number(value.jobSubmissionsPerMinute) }),
    }, authToken);
    setDrafts(previous => { const next = { ...previous }; delete next[row.office]; return next; });
    await queryClient.invalidateQueries({ queryKey: ["adminRateLimits"] });
  };
  const reset = async (row: RateLimitRow) => {
    await fetchWithAuth(`/api/admin/rate-limits/${encodeURIComponent(row.office)}`, { method: "DELETE" }, authToken);
    setDrafts(previous => { const next = { ...previous }; delete next[row.office]; return next; });
    await queryClient.invalidateQueries({ queryKey: ["adminRateLimits"] });
  };
  if (query.isPending) return <LoadingRows label="Loading office rate limits" />;
  if (query.isError) return <p role="alert">Office rate limits could not be loaded. Refresh the page to retry.</p>;
  return <>
  <UsaceBox title="Office rate limits">
    <button type="button" className="action-link mb-4" onClick={() => setHelpOpen(true)}><MdHelpOutline aria-hidden />How rate limits are applied</button>
    <p className="mb-4 text-sm text-slate-600">Defaults are 120 API requests and 10 job submissions per minute. Set a higher or lower value for an office when its workload requires it. Scheduled jobs still have a separate five-minute minimum interval.</p>
    <div className="space-y-2" aria-label="Per-office API rate limit overrides">{query.data?.map(row => { const value = valueFor(row); const isOpen = Boolean(expanded[row.office]); return <details key={row.office} open={isOpen} onToggle={event => { const open = event.currentTarget.open; setExpanded(previous => ({ ...previous, [row.office]: open })); }} className="rounded border border-slate-200 bg-white shadow-sm">
      <summary className="grid cursor-pointer list-none gap-2 p-3 pr-10 marker:hidden focus-visible:outline-2 sm:grid-cols-[minmax(5rem,1fr)_minmax(8rem,1.2fr)_minmax(7rem,1.2fr)_minmax(8rem,1.2fr)_minmax(12rem,1.5fr)] [&::-webkit-details-marker]:hidden">
        <span className="font-semibold">{row.office}</span><span><span className="text-slate-500 sm:hidden">Requests/min: </span>{row.requestsPerMinute}</span><span><span className="text-slate-500 sm:hidden">Jobs/min: </span>{row.jobSubmissionsPerMinute}</span><span>{row.changedBy || "Default"}</span><span>{row.changedAt ? new Date(row.changedAt).toLocaleString() : "Default"}</span>
      </summary>
      <div className="border-t border-slate-200 bg-slate-50 p-3">
        <div className="flex flex-wrap items-end gap-4"><label className="text-sm font-semibold">Requests/min<input id={`requests-${row.office}`} type="number" min="1" max="10000" className="mt-1 block w-28 rounded border p-2 font-normal" value={value.requestsPerMinute} onChange={event => setDrafts(previous => ({ ...previous, [row.office]: { ...value, requestsPerMinute: event.target.value } }))} /></label><label className="text-sm font-semibold">Jobs/min<input id={`jobs-${row.office}`} type="number" min="1" max="1000" className="mt-1 block w-28 rounded border p-2 font-normal" value={value.jobSubmissionsPerMinute} onChange={event => setDrafts(previous => ({ ...previous, [row.office]: { ...value, jobSubmissionsPerMinute: event.target.value } }))} /></label><div className="flex gap-2"><button type="button" className="action-link" onClick={() => void save(row)}>Save</button>{(row.requestOverride || row.jobSubmissionOverride) && <button type="button" className="action-link" onClick={() => void reset(row)}>Use defaults</button>}</div></div>
        <RateLimitHistory office={row.office} authToken={authToken} open={isOpen} />
      </div>
    </details>; })}{!query.data?.length && <p className="p-4 text-slate-500">No offices have been registered yet.</p>}</div>
    <p className="mt-4 text-xs text-slate-500">Limits are applied at each API process. Deployments with multiple API workers should also enforce an equivalent limit at the gateway. Health checks and internal service callbacks use separate access controls.</p>
  </UsaceBox>
  <Modal opened={helpOpen} onClose={() => setHelpOpen(false)} dialogTitle="How API rate limits are applied"
    buttons={<div className="flex justify-end"><Button type="button" onClick={() => setHelpOpen(false)}>Close</Button></div>}>
    <div className="max-h-[65dvh] space-y-5 overflow-y-auto p-1 text-sm">
      <section><h3 className="font-semibold">Who shares a limit</h3><p className="mt-1">Limits are tracked per authenticated bearer credential. The same shared token uses the same counters. Different bearer tokens use separate counters. Limits are not assigned by the human name shown in the audit column.</p></section>
      <section><h3 className="font-semibold">Which limit applies</h3><p className="mt-1">General API requests use the requests-per-minute value. Job submissions use a separate jobs-per-minute value. The default values are 120 general requests and 10 job submissions per minute. The five-minute scheduler interval is a separate scheduling rule.</p></section>
      <section><h3 className="font-semibold">How office values work</h3><p className="mt-1">An office override replaces the documented default for requests or job submissions. Requests filtered to multiple offices use the most restrictive applicable value. Resetting an office removes its override and returns it to the default.</p></section>
      <section><h3 className="font-semibold">Where values are kept</h3><p className="mt-1">The active counters are kept in memory by each API process. Office override settings are persisted in the database and refreshed by each process about once per minute. A change is immediate in the process that saves it and reaches other processes during their next refresh.</p></section>
      <section><h3 className="font-semibold">Multiple API processes</h3><p className="mt-1">Each API process maintains its own counters. Deployments with multiple API workers should also enforce equivalent shared limits at the deployment gateway.</p></section>
      <p className="border-t border-slate-200 pt-4 text-slate-600">When a limit is reached, the API returns HTTP 429 with a Retry-After value and a link to the public <Link to="/about/rate-limits" className="font-medium text-blue-700 underline">rate-limit documentation</Link>.</p>
    </div>
  </Modal>
  </>;
}

function UsageTable({ rows, jobs = false, onOffice }: { rows: Usage[]; jobs?: boolean; onOffice: (office: string) => void }) {
  return <div className="overflow-x-auto"><table className="w-full text-left text-sm">
    <caption className="sr-only">Recorded usage by {jobs ? "job" : "office"}</caption>
    <thead className="border-b bg-slate-50 text-slate-600"><tr>{[jobs ? "Job / office" : "Office", "Runs", "Failures", "Users", "Run minutes", "Missing duration"].map(label => <th key={label} className="p-3 font-semibold">{label}</th>)}</tr></thead>
    <tbody>{rows.map((row, index) => <tr key={`${row.office}:${row.scriptId}:${index}`} className="border-b border-slate-100">
      <td className="max-w-64 p-3"><span className="block break-words font-medium">{row.name}</span><button className="font-semibold text-blue-700 underline" onClick={() => onOffice(row.office)}>{row.office}</button></td>
      <td className="p-3">{number(row.runs)}</td><td className="p-3">{number(row.failed)}</td><td className="p-3">{row.users}</td><td className="p-3 tabular-nums">{number(row.runtimeMinutes)}</td><td className="p-3">{row.missingDuration}</td>
    </tr>)}</tbody>
  </table>{!rows.length && <p className="p-4 text-slate-500">No recorded runs in this period.</p>}</div>;
}

export function OperationsDashboard({ initialTab = "overview" }: { initialTab?: AdminTab }) {
  const auth = useAuth();
  const navigate = useNavigate();
  const tab = initialTab;
  const [usageView, setUsageView] = useState("Offices");
  const [days, setDays] = useState(30);
  const [office, setOffice] = useState("");
  const [queueMinutes, setQueueMinutes] = useState(15);
  const [runMinutes, setRunMinutes] = useState(120);
  const [taskSort, setTaskSort] = useState("minutes");
  const [taskDirection, setTaskDirection] = useState("desc");
  const [rate, setRate] = useState("");
  const query = useQuery<Summary>({
    queryKey: ["adminOperations", days, office, queueMinutes, runMinutes, taskSort, taskDirection], placeholderData: keepPreviousData,
    queryFn: async () => {
      const params = new URLSearchParams({ days: String(days), queueMinutes: String(queueMinutes), runMinutes: String(runMinutes), taskSort, taskDirection });
      if (office) params.set("office", office);
      return (await fetchWithAuth(`/api/admin/operations?${params}`, {}, auth.token)).json();
    },
  });
  const data = query.data;
  const usage = data?.usage ?? [];
  const totals = usage.reduce((sum, row) => ({ runs: sum.runs + row.runs, failed: sum.failed + row.failed,
    completed: sum.completed + row.completed, minutes: sum.minutes + row.runtimeMinutes, missing: sum.missing + row.missingDuration }),
    { runs: 0, failed: 0, completed: 0, minutes: 0, missing: 0 });
  const terminal = totals.failed + totals.completed;
  const failureRate = terminal ? `${number(100 * totals.failed / terminal)}%` : "No finished runs";
  const chartOffices = usage.filter(row => row.runtimeMinutes > 0).slice(0, 7).map(row => ({ name: row.office, minutes: row.runtimeMinutes }));
  const otherMinutes = usage.filter(row => row.runtimeMinutes > 0).slice(7).reduce((sum, row) => sum + row.runtimeMinutes, 0);
  if (otherMinutes) chartOffices.push({ name: "Other offices", minutes: otherMinutes });
  const daily = [];
  if (data?.since) {
    const day = new Date(data.since); day.setUTCHours(0, 0, 0, 0);
    while (day <= new Date(data.asOf)) {
      const key = day.toISOString().slice(0, 10);
      daily.push({ day: key, runs: 0, failed: 0, ...data.daily.find(row => row.day === key) });
      day.setUTCDate(day.getUTCDate() + 1);
    }
  }
  const loading = query.isPending || query.isPlaceholderData;
  const chooseOffice = (value: string) => {
    setOffice(value);
    setUsageView("Jobs");
    void navigate({ to: "/admin/usage" });
  };
  const changeTaskSort = (value: string) => {
    if (value === taskSort) setTaskDirection(previous => previous === "asc" ? "desc" : "asc");
    else { setTaskSort(value); setTaskDirection(value === "name" ? "asc" : "desc"); }
  };
  return <section className="mx-auto max-w-7xl space-y-5">
    <header><h1 className="text-2xl font-bold">Administration</h1><p className="mt-1 text-sm text-slate-600">Organization usage and operations across district jobs.</p></header>
    <nav aria-label="Admin sections" className="flex flex-wrap gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2">
      {tabs.map(item => <Link key={item.id} to={item.to} aria-current={tab === item.id ? "page" : undefined} className={`inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-semibold ${tab === item.id ? "bg-blue-700 text-white" : "text-slate-600 hover:bg-white"}`}><item.icon aria-hidden />{item.label}</Link>)}
    </nav>
    {tab === "scheduler" ? <UsaceBox title="Scheduler health"><SchedulerStatus office={office || undefined} /></UsaceBox> : <>
      {tab === "rate-limits" ? <RateLimitsPanel authToken={auth.token} /> : <>
      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 bg-white p-4">
        <label className="text-sm font-semibold">Period<select aria-label="Period" className="mt-1 block rounded border py-2 pl-3 pr-10" value={days} onChange={event => setDays(Number(event.target.value))}><option value={7}>Last 7 days</option><option value={30}>Last 30 days</option><option value={90}>Last 90 days</option></select></label>
        <label className="text-sm font-semibold">Office<select aria-label="Office" className="mt-1 block min-w-36 rounded border py-2 pl-3 pr-10" value={office} onChange={event => chooseOffice(event.target.value)}><option value="">All offices</option>{data?.offices?.map(item => <option key={item}>{item}</option>)}</select></label>
        <button type="button" className="action-link" disabled={query.isFetching} onClick={() => void query.refetch()}><MdRefresh aria-hidden />Refresh metrics</button>
        <p className="ml-auto text-xs text-slate-500">{data?.asOf && `As of ${new Date(data.asOf).toLocaleString()}`}</p>
      </div>
      <p className="text-xs text-slate-500">Usage covers jobs submitted in this period. Run minutes include finished runs with valid start/end timestamps. Queue and running counts include older jobs. Status comes from stored records and may lag AWS.</p>
      {query.isError && <p role="alert">Metrics could not be loaded. Refresh metrics to retry.</p>}
      {loading && <LoadingRows label="Loading administration metrics" />}
      {!loading && !query.isError && data && <>
        {tab === "overview" && <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{[
            ["Runs", number(totals.runs)], ["Recorded run minutes", number(totals.minutes)], ["Failure rate", failureRate], ["Queued / running", `${data?.queued ?? 0} / ${data?.running ?? 0}`],
          ].map(([label, value]) => <div key={label} className="rounded-lg border border-slate-200 border-t-4 border-t-red-700 bg-white p-4"><p className="text-sm text-slate-500">{label}</p><p className="mt-2 text-2xl font-bold tabular-nums">{value}</p></div>)}</div>
          <div className="grid min-w-0 gap-6 lg:grid-cols-2">
            <UsaceBox title="Run minutes by office" className="min-w-0"><div className="h-72 min-w-0" role="img" aria-label="Pie chart of recorded run minutes by office. Exact values are in the office usage table.">
              {chartOffices.length ? <ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={chartOffices} dataKey="minutes" nameKey="name" innerRadius={55} outerRadius={95} isAnimationActive={false}>{chartOffices.map((row, index) => <Cell key={row.name} fill={colors[index % colors.length]} />)}</Pie><Tooltip /></PieChart></ResponsiveContainer> : <p className="p-6 text-slate-500">No recorded run duration in this period.</p>}
            </div><ul className="flex flex-wrap gap-3 text-xs">{chartOffices.map((row, index) => <li key={row.name} className="flex items-center gap-1"><span className="size-3 rounded" style={{ background: colors[index % colors.length] }} />{row.name}: {number(row.minutes)} min</li>)}</ul></UsaceBox>
            <UsaceBox title="Daily runs and failures (UTC)" className="min-w-0"><div className="h-72 min-w-0"><ResponsiveContainer width="100%" height="100%"><LineChart data={daily}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="day" tickFormatter={value => String(value).slice(5)} /><YAxis allowDecimals={false} width={40} /><Tooltip /><Line name="Runs" dataKey="runs" stroke="#1d4ed8" isAnimationActive={false} /><Line name="Failures" dataKey="failed" stroke="#be123c" isAnimationActive={false} /></LineChart></ResponsiveContainer></div><details className="text-sm"><summary className="cursor-pointer">Daily values</summary><ul className="max-h-48 overflow-y-auto">{daily.map(row => <li key={row.day}>{row.day}: {row.runs} runs, {row.failed} failures</li>)}</ul></details></UsaceBox>
          </div>
          <UsaceBox title="Office usage"><UsageTable rows={usage} onOffice={chooseOffice} /></UsaceBox>
          <p className="text-sm text-slate-600">{data?.registered ?? 0} registered jobs, {data?.automatic ?? 0} automatic. {totals.missing} finished runs lack valid duration timestamps.</p>
          <UsaceBox title="Scheduler health"><SchedulerStatus office={office || undefined} /></UsaceBox>
        </>}
        {tab === "operations" && <UsaceBox title="Jobs needing attention">
          <div className="mb-4 flex flex-wrap gap-3">
            <label className="text-sm">Queue age<select aria-label="Queue age" className="ml-2 rounded border py-2 pl-3 pr-8" value={queueMinutes} onChange={event => setQueueMinutes(Number(event.target.value))}>{[5,15,30,60,120].map(value => <option key={value} value={value}>{value} minutes</option>)}</select></label>
            <label className="text-sm">Running time<select aria-label="Running time" className="ml-2 rounded border py-2 pl-3 pr-8" value={runMinutes} onChange={event => setRunMinutes(Number(event.target.value))}>{[30,60,120,360,1440].map(value => <option key={value} value={value}>{value} minutes</option>)}</select></label>
          </div><p className="mb-4 text-sm text-slate-600">Age thresholds flag jobs for investigation, not proven failures. Showing the oldest {data?.attention?.length ?? 0} of {data?.attentionTotal ?? 0}. Opening logs still requires access to that office.</p>
          <div className="space-y-3">{data?.attention?.map(job => <div key={job.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4">
            <div><p className="font-semibold">{job.name}</p><p className="text-sm">{job.office} · {job.status} · {number(job.ageMinutes)} minutes</p><p className="text-xs text-slate-500">{job.batchCheckedAt ? `AWS status last checked ${new Date(job.batchCheckedAt).toLocaleString()}` : "No AWS status check recorded"}</p></div>
            <Link to="/jobs/$jobId" params={{ jobId: job.id }} className="action-link"><MdOpenInNew aria-hidden />Open job</Link>
          </div>)}{!data?.attention?.length && <p>No jobs exceed these thresholds.</p>}</div>
          <h3 className="mt-6 mb-3 font-semibold">Failures by office</h3><UsageTable rows={usage.filter(row => row.failed > 0).sort((a,b) => b.failed-a.failed)} onOffice={chooseOffice} />
          <h3 className="mt-6 mb-3 font-semibold">Recent failed runs</h3><p className="mb-3 text-sm text-slate-500">Latest {data?.failures?.length ?? 0} of {totals.failed} failures in this period.</p>
          <div className="space-y-3">{data?.failures?.map(job => <div key={job.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 p-4">
            <div className="min-w-0"><p className="font-semibold">{job.office} · {job.name}</p><p className="max-w-xl break-words text-sm">{job.reason || "No failure reason recorded. Open the job to inspect its output."}</p></div>
            <Link to="/jobs/$jobId" params={{ jobId: job.id }} className="action-link"><MdOpenInNew aria-hidden />Open job</Link>
          </div>)}</div>
        </UsaceBox>}
        {tab === "usage" && <div className="grid min-w-0 gap-5 md:grid-cols-[10rem_minmax(0,1fr)]">
          <nav aria-label="Usage sections" className="flex flex-wrap content-start gap-1 rounded-lg border border-slate-200 bg-slate-50 p-2 md:flex-col">{["Offices", "Jobs", "Cost"].map(item => <button key={item} aria-pressed={usageView === item} className={`rounded px-3 py-2 text-left text-sm font-semibold ${usageView === item ? "bg-blue-700 text-white" : "text-slate-600"}`} onClick={() => setUsageView(item)}>{item}</button>)}</nav>
          <UsaceBox title={usageView === "Cost" ? "Cost planning" : `${usageView} by recorded runtime`} className="min-w-0">
            {usageView === "Offices" && <><div className="h-80"><ResponsiveContainer width="100%" height="100%"><BarChart data={usage.slice(0,12)}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="office" /><YAxis width={50} /><Tooltip /><Bar name="Run minutes" dataKey="runtimeMinutes" fill="#1d4ed8" isAnimationActive={false} /></BarChart></ResponsiveContainer></div><UsageTable rows={usage} onOffice={chooseOffice} /></>}
            {usageView === "Jobs" && <>
              <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
                <p className="text-sm text-slate-500">{office ? `All task definitions for ${office}.` : "Top 20 task definitions across offices."} Names reflect saved run snapshots.</p>
                <label className="text-sm font-semibold">Sort tasks
                  <select aria-label="Sort tasks" className="ml-2 rounded border py-2 pl-3 pr-8" value={taskSort} onChange={event => changeTaskSort(event.target.value)}>
                    <option value="minutes">Run minutes</option><option value="runs">Runs</option><option value="failures">Failures</option><option value="users">Users</option><option value="name">Task name</option><option value="missing">Missing duration</option>
                  </select>
                </label>
                <button type="button" className="action-link" onClick={() => setTaskDirection(previous => previous === "asc" ? "desc" : "asc")}>Sort {taskDirection === "asc" ? "ascending" : "descending"}</button>
              </div>
              <UsageTable rows={data?.topJobs ?? []} jobs onOffice={chooseOffice} />
            </>}
            {usageView === "Cost" && <div className="space-y-4 text-sm"><p>Actual billing is unavailable. No AWS billing or resource-pricing integration is configured.</p><label className="block font-semibold">Planning rate (USD per job runtime hour)<input aria-label="Planning rate (USD per job runtime hour)" type="number" min="0" step="0.01" value={rate} onChange={event => setRate(event.target.value)} className="mt-2 block w-full max-w-xs rounded border p-2" /></label>
              {rate !== "" && Number.isFinite(Number(rate)) && Number(rate) >= 0 && <p className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-lg font-semibold">Scenario estimate: {(totals.minutes / 60 * Number(rate)).toLocaleString(undefined, { style: "currency", currency: "USD" })}</p>}
              <p>Calculated as recorded runtime hours × your rate. This is not an AWS bill. It excludes running jobs, missing durations, CPU/memory differences, startup time, storage, and data transfer. {totals.missing} finished runs lack duration data. The rate stays in this view and is not saved.</p>
            </div>}
          </UsaceBox>
        </div>}
      </>}
      </>}
    </>}
  </section>;
}
