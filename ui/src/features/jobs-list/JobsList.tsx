import { useAuth } from "@usace-watermanagement/groundwork-water";
import { Accordion, Button, H1 } from "@usace/groundwork";
import { useState } from "react";
import { useJobsPage } from "./useJobsList";
import { Link } from "@tanstack/react-router";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import JobDetail from "./JobDetail";
import { jobStatusLabel } from "./jobStatus";
import LoginPrompt from "../auth/LoginPrompt";
import { RunTriggerBadge } from "./RunAttribution";
import { submittedBy } from "./submittedBy";

dayjs.extend(relativeTime);

const JobsList = () => {
  const auth = useAuth();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number | "all">(10);
  const { data, isLoading, isError } = useJobsPage(page, pageSize);
  const jobs = data?.jobs;
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

  if (isError) return <section><H1>Job History</H1><p role="alert">Error occurred while fetching job history.</p></section>;

  if (isLoading) return <section><H1>Job History</H1><p role="status">Loading job history...</p></section>;

  if (!jobs || (total === 0 && page === 1))
    return (
      <section><H1>Job History</H1><p className="mt-4">
        No jobs found! You can submit a job{" "}
        <span className="underline">
          <Link to="/submit">here</Link>
        </span>
        .
      </p></section>
    );

  return (
    <div className="mx-auto min-w-0 max-w-4xl space-y-4">
      <H1>Job History</H1>
      <p>Runs shared across your offices, with who submitted them, their status, and output.</p>
      <nav aria-label="Job history pagination" className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2">
          Jobs per page
          <select className="rounded border border-gray-400 bg-white px-2 py-1 text-gray-900"
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
          <Button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button>
          <Button type="button" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</Button>
        </>}
      </nav>
      <div role="region" aria-label="Job history results" tabIndex={pageSize === "all" ? undefined : 0}
        className={pageSize === "all" ? "space-y-4" : "max-h-[60vh] space-y-4 overflow-auto overscroll-contain"}>
      {jobs.length === 0 && <p>No jobs on this page. Select Previous to return to earlier results.</p>}
      {jobs.map((job) => {
        const dateAgo = dayjs(job.createdTime).fromNow();
        return (
          <Accordion
            key={job.id}
            heading={
              <span className="flex min-w-0 w-full flex-wrap justify-between gap-2 text-left">
                <span className="min-w-0 break-all">
                  {job.scriptName} ({dateAgo})
                  <span className="mt-1 block text-sm font-normal text-gray-600">{job.office} · {submittedBy(job)}</span>
                </span>
                <span className="inline-flex items-center gap-2"><RunTriggerBadge job={job} />{jobStatusLabel(job)}</span>
              </span>
            }
          >
            <div className="flex min-w-0 flex-col sm:flex-row">
              <JobDetail job={job} />
              <Link
                to={`/jobs/$jobId`}
                params={{ jobId: job.id }}
                className="px-4 pb-4 content-end"
              >
                <Button>Details</Button>
              </Link>
            </div>
          </Accordion>
        );
      })}
      </div>
    </div>
  );
};

export default JobsList;
