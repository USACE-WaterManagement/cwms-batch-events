import { RunDatePicker, type RunDateRange } from "./RunHistoryControls";
import { RequestErrorPage } from "../../shared/components/StatePage";
import { useAuth } from "@usace-watermanagement/groundwork-water";
import { LoadingRows } from "../../shared/components/LoadingRows";
import { Button, UsaceBox } from "@usace/groundwork";
import { useQuery } from "@tanstack/react-query";
import fetchWithAuth from "../../utils/fetchWithAuth";
import { useState } from "react";
import { useJobsPage } from "./useJobsList";
import { Link } from "@tanstack/react-router";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import { jobStatusLabel } from "./jobStatus";
import LoginPrompt from "../auth/LoginPrompt";
import { RunTriggerBadge } from "./RunAttribution";
import { submittedBy } from "./submittedBy";

dayjs.extend(relativeTime);

const JobsList = () => {
  const auth = useAuth();
  const [range, setRange] = useState<RunDateRange>({ start: "", end: "" });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number | "all">(10);
  const [offices, setOffices] = useState<string[]>([]);
  const accessible = useQuery<string[]>({ queryKey: ["accessibleOffices"], enabled: auth.isAuth,
    queryFn: async () => (await fetchWithAuth("/api/users/me/offices", {}, auth.token)).json() });
  const { data, isLoading, isPlaceholderData, isError, error, refetch } = useJobsPage(page, pageSize, offices, range);
  const loading = isLoading || isPlaceholderData;
  const jobs = data?.jobs ?? [];
  const total = data?.total ?? 0;
  const pages = pageSize === "all" ? 1 : Math.max(1, Math.ceil(total / pageSize));

  if (!auth.isAuth) {
    return (
      <LoginPrompt
        title="Sign in to view job history"
        description="Review jobs run in your offices, including who submitted them, their status, and output."
      />
    );
  }

  return (
    <div className="mx-auto min-w-0 max-w-4xl space-y-4">
      <UsaceBox title="Job History" className="mb-0!">
      <div className="space-y-3">
      <p className="text-sm text-slate-600">Click a job to open it</p>
      <div className="flex flex-wrap items-start gap-x-6 gap-y-3 border-b border-slate-200 pb-3">
      <fieldset className="min-w-0 flex-1">
        <legend className="mb-2 text-sm font-semibold">Filter offices <span className="font-normal text-slate-500">· {offices.length ? `${offices.length} selected` : "All offices"}</span></legend>
        <div className="flex flex-wrap gap-2">
          {(accessible.data ?? []).map(office => <label key={office} className="flex cursor-pointer select-none items-center gap-2 rounded border border-slate-300 bg-white px-2 py-2 text-sm">
            <input type="checkbox" checked={offices.includes(office)} onChange={event => {
              setOffices(current => event.target.checked ? [...current, office].sort() : current.filter(item => item !== office)); setPage(1);
            }} />{office}
          </label>)}
          {offices.length > 0 && <button type="button" className="action-link" onClick={() => { setOffices([]); setPage(1); }}>All offices</button>}
        </div>
      </fieldset>
      <RunDatePicker value={range} onChange={value => { setRange(value); setPage(1); }} />
      </div>
      {isError && <RequestErrorPage error={error} onRetry={() => void refetch()} />}
      <nav aria-label="Job history pagination" className="flex flex-wrap items-center gap-3 text-sm">
        <label className="flex items-center gap-2">
          Jobs per page
          <select className="rounded border border-gray-400 bg-white min-w-20 pl-3 pr-9 py-2 text-gray-900"
            value={pageSize} onChange={event => {
              setPageSize(event.target.value === "all" ? "all" : Number(event.target.value));
              setPage(1);
            }}>
            <option value={10}>10</option>
            <option value={25}>25</option>
            <option value={50}>50</option>
            <option value="all">All</option>
          </select>
        </label>
        <span role="status">{pageSize === "all" ? `Showing all ${total} jobs` : `Page ${page} of ${pages} (${total} jobs)`}</span>
        {pageSize !== "all" && <>
          <Button type="button" disabled={loading || page <= 1} onClick={() => setPage(page - 1)}>Previous</Button>
          <Button type="button" disabled={loading || page >= pages} onClick={() => setPage(page + 1)}>Next</Button>
        </>}
      </nav>
      <div role="region" aria-label="Job history results" tabIndex={pageSize === "all" ? undefined : 0}
        className={pageSize === "all" ? "space-y-4" : "min-h-64 h-[60vh] space-y-4 overflow-auto overscroll-contain"}>
      {!loading && !isError && jobs.length === 0 && <p>No jobs found for this selection.</p>}
      {loading && <LoadingRows label="Loading job history" />}
      {!loading && jobs.map((job) => {
        const dateAgo = dayjs(job.createdTime).fromNow();
        return (
          <Link key={job.id} to="/jobs/$jobId" params={{ jobId: job.id }}
            aria-label={`Open ${job.scriptName ?? "job"} run ${new Date(job.createdTime).toLocaleString()}`}
            className="flex min-h-16 items-center gap-3 rounded-lg border border-slate-200 bg-white p-4 hover:border-blue-400 hover:bg-blue-50 focus-visible:outline-2 focus-visible:outline-blue-600">
            {
              <span className="flex min-w-0 w-full flex-wrap justify-between gap-2 text-left">
                <span className="min-w-0 break-all">
                  {job.scriptName} ({dateAgo})
                  <span className="mt-1 block text-sm font-normal text-gray-600">{job.office} · {submittedBy(job)}</span>
                </span>
                <span className="inline-flex items-center gap-2"><RunTriggerBadge job={job} />{jobStatusLabel(job)}</span>
              </span>
            }
            <span aria-hidden className="text-xl text-blue-700">›</span>
          </Link>
        );
      })}
      </div>
      </div>
      </UsaceBox>
    </div>
  );
};

export default JobsList;
