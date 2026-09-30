import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useAuth } from "@usace-watermanagement/groundwork-water";
import { UsaceBox } from "@usace/groundwork";
import fetchWithAuth from "../../utils/fetchWithAuth";
import { LoadingRows } from "../../shared/components/LoadingRows";
import CancelJobButton from "../jobs-list/CancelJobButton";
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

export default function QueueDashboard() {
  const auth = useAuth();
  const query = useQuery<QueueSummary>({
    queryKey: ["adminQueues"],
    queryFn: async () => (await fetchWithAuth("/api/admin/queues", {}, auth.token)).json(),
    refetchInterval: 30000,
  });
  if (query.isPending) return <LoadingRows label="Loading queue status" />;
  if (query.isError) return <p role="alert">Queue status could not be loaded. Refresh the page to retry.</p>;
  const data = query.data;
  const jobs = data.offices.flatMap(office => office.jobs);
  return <div className="space-y-5">
    <div className="flex flex-wrap items-end justify-between gap-3 rounded-lg border border-slate-200 bg-white p-4">
      <div><p className="text-sm text-slate-600">Combined application and SQS view</p><p className="text-xs text-slate-500">Updated {new Date(data.asOf).toLocaleString()}</p></div>
      <button type="button" className="action-link" disabled={query.isFetching} onClick={() => void query.refetch()}>{query.isFetching ? "Refreshing…" : "Refresh queues"}</button>
    </div>
    {!data.queueAvailable && <p role="status" className="rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">{data.queueWarning}</p>}
    <div className="grid gap-3 sm:grid-cols-2"><div className="rounded-lg border border-slate-200 bg-white p-4"><p className="text-sm text-slate-500">SQS messages available</p><p className="mt-1 text-2xl font-bold">{data.approximateMessagesAvailable ?? "—"}</p></div><div className="rounded-lg border border-slate-200 bg-white p-4"><p className="text-sm text-slate-500">SQS messages in flight</p><p className="mt-1 text-2xl font-bold">{data.approximateMessagesInFlight ?? "—"}</p></div></div>
    <UsaceBox title="Office queue status">
      <p className="mb-4 text-sm text-slate-600">Submission counts are stored application records from the last minute. They show activity against the configured submissions-per-minute policy, not a shared AWS concurrency limit.</p>
      <div className="overflow-x-auto"><table className="w-full min-w-[52rem] text-left text-sm"><caption className="sr-only">Queue and submission status by office</caption><thead className="border-b bg-slate-50 text-slate-600"><tr>{["Office", "Queued", "Running", "Stopping", "Unknown", "Submissions/min", "Oldest queued"].map(label => <th key={label} className="p-3">{label}</th>)}</tr></thead><tbody>{data.offices.map(office => <tr key={office.office} className="border-b border-slate-100"><th className="p-3 text-left">{office.office}</th><td className="p-3">{office.queued}</td><td className="p-3">{office.running}</td><td className="p-3">{office.cancelling}</td><td className="p-3">{office.dispatchUnknown}</td><td className="p-3">{office.submissionsLastMinute} / {office.submissionLimitPerMinute}</td><td className="p-3">{office.oldestQueuedAt ? new Date(office.oldestQueuedAt).toLocaleString() : "—"}</td></tr>)}</tbody></table>{!data.offices.length && <p className="p-4 text-slate-500">No office queue records are available.</p>}</div>
    </UsaceBox>
    <UsaceBox title="Active jobs">
      <div className="space-y-3">{jobs.map(job => <div key={job.id} className="flex flex-wrap items-center justify-between gap-3 rounded border border-slate-200 p-3"><div className="min-w-0"><p className="font-semibold">{job.office} · {job.scriptName}</p><p className="text-sm text-slate-600">{job.jobStatus} · submitted by {job.username} · {new Date(job.createdTime).toLocaleString()}</p>{job.batchStatusReason && <p className="text-xs text-slate-600">{job.batchStatusReason}</p>}</div><div className="flex flex-wrap items-center gap-2"><CancelJobButton job={job} /><Link to="/jobs/$jobId" params={{ jobId: job.id }} className="action-link">Open job</Link></div></div>)}{!jobs.length && <p className="text-slate-500">No queued or running jobs.</p>}</div>
    </UsaceBox>
  </div>;
}
