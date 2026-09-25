import { useState } from "react";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { useAuth } from "@usace-watermanagement/groundwork-water";
import { Link } from "@tanstack/react-router";
import { UsaceBox } from "@usace/groundwork";
import { MdDashboard, MdWarningAmber, MdPieChart, MdSchedule, MdRefresh, MdOpenInNew } from "react-icons/md";
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid, LineChart, Line } from "recharts";
import fetchWithAuth from "../../utils/fetchWithAuth";
import { LoadingRows } from "../../shared/components/LoadingRows";
import { SchedulerStatus } from "../scripts-manager/SchedulerStatus";
import type { components } from "../../generated/api-types";

type Summary = components["schemas"]["OperationsSummary"];
type Usage = components["schemas"]["Usage"];
const colors = ["#1d4ed8", "#0f766e", "#9333ea", "#c2410c", "#be123c", "#0369a1", "#4d7c0f", "#475569"];
const number = (value: number) => value.toLocaleString(undefined, { maximumFractionDigits: 1 });
const tabs = [{ id: "overview", label: "Overview", icon: MdDashboard }, { id: "operations", label: "Operations", icon: MdWarningAmber },
  { id: "usage", label: "Usage", icon: MdPieChart }, { id: "scheduler", label: "Scheduler", icon: MdSchedule }] as const;

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

export function OperationsDashboard() {
  const auth = useAuth();
  const [tab, setTab] = useState<typeof tabs[number]["id"]>("overview");
  const [usageView, setUsageView] = useState("Offices");
  const [days, setDays] = useState(30);
  const [office, setOffice] = useState("");
  const [queueMinutes, setQueueMinutes] = useState(15);
  const [runMinutes, setRunMinutes] = useState(120);
  const [rate, setRate] = useState("");
  const query = useQuery<Summary>({
    queryKey: ["adminOperations", days, office, queueMinutes, runMinutes], placeholderData: keepPreviousData,
    queryFn: async () => {
      const params = new URLSearchParams({ days: String(days), queueMinutes: String(queueMinutes), runMinutes: String(runMinutes) });
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
  const chooseOffice = (value: string) => { setOffice(value); };
  return <section className="mx-auto max-w-7xl space-y-5">
    <header><h1 className="text-2xl font-bold">Administration</h1><p className="mt-1 text-sm text-slate-600">Organization usage and operations across district jobs.</p></header>
    <nav aria-label="Admin sections" className="flex flex-wrap gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2">
      {tabs.map(item => <button key={item.id} aria-pressed={tab === item.id} onClick={() => setTab(item.id)} className={`inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-semibold ${tab === item.id ? "bg-blue-700 text-white" : "text-slate-600 hover:bg-white"}`}><item.icon aria-hidden />{item.label}</button>)}
    </nav>
    {tab === "scheduler" ? <UsaceBox title="Scheduler health"><SchedulerStatus office={office || undefined} /></UsaceBox> : <>
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
            {usageView === "Jobs" && <><p className="mb-3 text-sm text-slate-500">Top 20 job definitions by recorded runtime, then run count. Names reflect saved run snapshots.</p><UsageTable rows={data?.topJobs ?? []} jobs onOffice={chooseOffice} /></>}
            {usageView === "Cost" && <div className="space-y-4 text-sm"><p>Actual billing is unavailable. No AWS billing or resource-pricing integration is configured.</p><label className="block font-semibold">Planning rate (USD per job runtime hour)<input aria-label="Planning rate (USD per job runtime hour)" type="number" min="0" step="0.01" value={rate} onChange={event => setRate(event.target.value)} className="mt-2 block w-full max-w-xs rounded border p-2" /></label>
              {rate !== "" && Number.isFinite(Number(rate)) && Number(rate) >= 0 && <p className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-lg font-semibold">Scenario estimate: {(totals.minutes / 60 * Number(rate)).toLocaleString(undefined, { style: "currency", currency: "USD" })}</p>}
              <p>Calculated as recorded runtime hours × your rate. This is not an AWS bill. It excludes running jobs, missing durations, CPU/memory differences, startup time, storage, and data transfer. {totals.missing} finished runs lack duration data. The rate stays in this view and is not saved.</p>
            </div>}
          </UsaceBox>
        </div>}
      </>}
    </>}
  </section>;
}
