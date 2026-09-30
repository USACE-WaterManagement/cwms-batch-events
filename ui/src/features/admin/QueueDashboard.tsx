import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useAuth } from "@usace-watermanagement/groundwork-water";
import { Button, Modal, UsaceBox } from "@usace/groundwork";
import fetchWithAuth from "../../utils/fetchWithAuth";
import { LoadingRows } from "../../shared/components/LoadingRows";
import CancelJobButton from "../jobs-list/CancelJobButton";
import { notifyError } from "../../utils/errorNotifications";
import { notifySuccess } from "../../utils/actionNotifications";
import type { JobDetails } from "../jobs-list/useJobDetails";

type QueueJob = {
  id: string;
  office: string;
  scriptName: string;
  username: string;
  jobStatus: JobDetails["jobStatus"];
  createdTime: string;
  runTime?: string | null;
  externalJobId?: string | null;
  batchStatus?: string | null;
  batchStatusReason?: string | null;
  cancellationRequestedAt?: string | null;
};
type QueueOffice = {
  office: string;
  queued: number;
  running: number;
  cancelling: number;
  dispatchUnknown: number;
  submissionsLastMinute: number;
  submissionLimitPerMinute: number;
  oldestQueuedAt?: string | null;
  jobs: QueueJob[];
};
type QueueSummary = {
  asOf: string;
  queueAvailable: boolean;
  queueWarning?: string | null;
  approximateMessagesAvailable?: number | null;
  approximateMessagesInFlight?: number | null;
  offices: QueueOffice[];
};

type AuditRow = {
  id: number;
  requestedBy: string;
  action: string;
  previousStatus: string;
  resultingStatus: string;
  reason: string;
  createdTime: string;
};

function ControlAudit({ jobId, token }: { jobId: string; token?: string }) {
  const [open, setOpen] = useState(false);
  const audit = useQuery<AuditRow[]>({
    queryKey: ["jobControlAudit", jobId],
    enabled: open,
    queryFn: async () => (await fetchWithAuth(`/api/admin/queues/${jobId}/audit`, {}, token)).json(),
  });
  return <details onToggle={event => setOpen(event.currentTarget.open)}>
    <summary className="cursor-pointer text-sm text-slate-700">View control audit</summary>
    {audit.isPending && <p className="mt-2 text-xs text-slate-500">Loading audit…</p>}
    {audit.isError && <p className="mt-2 text-xs text-red-700">Audit history could not be loaded.</p>}
    {audit.data && <ul className="mt-2 space-y-1 text-xs text-slate-600">{audit.data.map(row => <li key={row.id}>{new Date(row.createdTime).toLocaleString()} · {row.action} by {row.requestedBy} · {row.previousStatus} → {row.resultingStatus}<br />{row.reason}</li>)}{!audit.data.length && <li>No control actions recorded.</li>}</ul>}
  </details>;
}

export default function QueueDashboard() {
  const auth = useAuth();
  const [office, setOffice] = useState("");
  const [script, setScript] = useState("");
  const [state, setState] = useState("");
  const [minutes, setMinutes] = useState("1440");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkOpen, setBulkOpen] = useState(false);
  const queryClient = useQueryClient();
  const query = useQuery<QueueSummary>({
    queryKey: ["adminQueues", office, script, state, minutes],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (office) params.set("office", office);
      if (script) params.set("script", script);
      if (state) params.set("state", state);
      params.set("minutes", minutes);
      const suffix = params.toString();
      return (await fetchWithAuth(`/api/admin/queues?${suffix}`, {}, auth.token)).json();
    },
    refetchInterval: 30000,
  });
  if (query.isPending) return <LoadingRows label="Loading queue status" />;
  if (query.isError) return <p role="alert">Queue status could not be loaded. Refresh the page to retry.</p>;
  const data = query.data;
  const jobs = data.offices.flatMap(office => office.jobs);
  const cancellableJobs = jobs.filter(job => job.jobStatus === "Pending" || job.jobStatus === "Running");
  const toggleSelected = (id: string) => setSelected(current => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });
  const selectAll = () => setSelected(new Set(cancellableJobs.map(job => job.id)));
  const bulkCancel = async () => {
    const results = await Promise.allSettled([...selected].map(id => fetchWithAuth(
      `/api/jobs/${id}/cancel?reason=${encodeURIComponent("Bulk cancellation requested by HQ operator")}`,
      { method: "POST" }, auth.token,
    )));
    const failed = results.filter(result => result.status === "rejected").length;
    const completed = results.length - failed;
    setSelected(new Set());
    setBulkOpen(false);
    void queryClient.invalidateQueries({ queryKey: ["adminQueues"] });
    if (failed) notifyError({ id: "bulk-cancel-jobs", message: `${completed} job cancellation request${completed === 1 ? "" : "s"} sent. ${failed} failed.` });
    else notifySuccess(`${completed} job cancellation request${completed === 1 ? "" : "s"} sent.`);
  };
  return <div className="space-y-5">
    <div className="flex flex-wrap items-end justify-between gap-3 rounded-lg border border-slate-200 bg-white p-4">
      <div><p className="text-sm text-slate-600">Combined application and SQS view</p><p className="text-xs text-slate-500">Updated {new Date(data.asOf).toLocaleString()}</p></div>
      <button type="button" className="action-link" disabled={query.isFetching} onClick={() => void query.refetch()}>{query.isFetching ? "Refreshing…" : "Refresh queues"}</button>
    </div>
    {!data.queueAvailable && <p role="status" className="rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">{data.queueWarning}</p>}
    <div className="grid gap-3 sm:grid-cols-2"><div className="rounded-lg border border-slate-200 bg-white p-4"><p className="text-sm text-slate-500">SQS messages available</p><p className="mt-1 text-2xl font-bold">{data.approximateMessagesAvailable ?? "—"}</p></div><div className="rounded-lg border border-slate-200 bg-white p-4"><p className="text-sm text-slate-500">SQS messages in flight</p><p className="mt-1 text-2xl font-bold">{data.approximateMessagesInFlight ?? "—"}</p></div></div>
    <UsaceBox title="Filter active jobs">
      <div className="grid gap-3 md:grid-cols-4">
        <label className="text-sm">Office<input value={office} onChange={event => setOffice(event.target.value.toUpperCase())} className="mt-1 w-full rounded border p-2" placeholder="All offices" /></label>
        <label className="text-sm">Script<input value={script} onChange={event => setScript(event.target.value)} className="mt-1 w-full rounded border p-2" placeholder="Name contains…" /></label>
        <label className="text-sm">State<select value={state} onChange={event => setState(event.target.value)} className="mt-1 w-full rounded border p-2"><option value="">All active states</option><option value="Pending">Pending</option><option value="Running">Running</option><option value="Cancelling">Cancelling</option><option value="Dispatch unknown">Dispatch unknown</option></select></label>
        <label className="text-sm">Created within<select value={minutes} onChange={event => setMinutes(event.target.value)} className="mt-1 w-full rounded border p-2"><option value="60">Last hour</option><option value="1440">Last 24 hours</option><option value="10080">Last 7 days</option></select></label>
      </div>
      <p className="mt-3 text-xs text-slate-600">Filters apply to the active-job list. Office totals remain visible for cross-office pressure monitoring.</p>
    </UsaceBox>
    <UsaceBox title="Office queue status">
      <p className="mb-4 text-sm text-slate-600">Submission counts are stored application records from the last minute. They show activity against the configured submissions-per-minute policy, not a shared AWS concurrency limit.</p>
      <div className="overflow-x-auto"><table className="w-full min-w-[52rem] text-left text-sm"><caption className="sr-only">Queue and submission status by office</caption><thead className="border-b bg-slate-50 text-slate-600"><tr>{["Office", "Queued", "Running", "Stopping", "Unknown", "Submissions/min", "Oldest queued"].map(label => <th key={label} className="p-3">{label}</th>)}</tr></thead><tbody>{data.offices.map(office => <tr key={office.office} className="border-b border-slate-100"><th className="p-3 text-left">{office.office}</th><td className="p-3">{office.queued}</td><td className="p-3">{office.running}</td><td className="p-3">{office.cancelling}</td><td className="p-3">{office.dispatchUnknown}</td><td className="p-3">{office.submissionsLastMinute} / {office.submissionLimitPerMinute}</td><td className="p-3">{office.oldestQueuedAt ? new Date(office.oldestQueuedAt).toLocaleString() : "—"}</td></tr>)}</tbody></table>{!data.offices.length && <p className="p-4 text-slate-500">No office queue records are available.</p>}</div>
    </UsaceBox>
    <UsaceBox title="Active jobs">
      <div className="mb-3 flex flex-wrap items-center gap-2"><Button type="button" disabled={!cancellableJobs.length} onClick={selectAll}>Select all cancellable</Button><Button type="button" disabled={!selected.size} className="border-red-700 bg-red-700 text-white hover:bg-red-800" onClick={() => setBulkOpen(true)}>Cancel selected ({selected.size})</Button></div>
      <div className="space-y-3">{jobs.map(job => <div key={job.id} className="flex flex-wrap items-center justify-between gap-3 rounded border border-slate-200 p-3"><div className="flex min-w-0 gap-3"><input type="checkbox" aria-label={`Select ${job.scriptName} for cancellation`} disabled={job.jobStatus !== "Pending" && job.jobStatus !== "Running"} checked={selected.has(job.id)} onChange={() => toggleSelected(job.id)} className="mt-1 h-4 w-4" /><div><p className="font-semibold">{job.office} · {job.scriptName}</p><p className="text-sm text-slate-600">{job.jobStatus} · submitted by {job.username} · {new Date(job.createdTime).toLocaleString()}</p>{job.batchStatusReason && <p className="text-xs text-slate-600">{job.batchStatusReason}</p>}<ControlAudit jobId={job.id} token={auth.token} /></div></div><div className="flex flex-wrap items-center gap-2"><CancelJobButton job={job} /><Link to="/jobs/$jobId" params={{ jobId: job.id }} className="action-link">Open job</Link></div></div>)}{!jobs.length && <p className="text-slate-500">No queued or running jobs.</p>}</div>
      <Modal opened={bulkOpen} onClose={() => setBulkOpen(false)} dialogTitle="Cancel selected job runs" buttons={<div className="flex flex-wrap justify-end gap-3"><Button type="button" onClick={() => setBulkOpen(false)}>Keep running</Button><Button type="button" className="border-red-700 bg-red-700 text-white hover:bg-red-800" onClick={() => void bulkCancel()}>Confirm cancellation</Button></div>}><p className="text-sm">This will request cancellation for {selected.size} selected job runs. Queued jobs are removed when possible. Running jobs receive a stop request and remain visible until the runner confirms the final state.</p></Modal>
    </UsaceBox>
  </div>;
}
