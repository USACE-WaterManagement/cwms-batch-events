import { useId, useState } from "react";
import useJobLogs from "./useJobLogs";
import { Textarea } from "@usace/groundwork";
import { jobStatusLabel } from "./jobStatus";
import type { JobDetails } from "./useJobDetails";

interface JobLogsProps {
  jobId: string;
  status: JobDetails["jobStatus"];
  batchStatus?: string | null;
}

const JobLogs = ({ jobId, status, batchStatus }: JobLogsProps) => {
  const [interval, setInterval] = useState(5000);
  const intervalId = useId();
  const { data, error, isLoading, isError, isFetching, refresh, dataUpdatedAt } = useJobLogs(jobId, status, interval);
  const pending = status === "Pending";
  const running = status === "Running";
  const live = data?.supportsLive !== false;
  const catchingUp = data?.completionChecks !== undefined && data.completionChecks < 3 && live && !isError;
  const waiting = batchStatus === "STARTING"
    ? "Container is starting. Logs will appear after it begins writing output."
    : pending ? "Job is queued. Logs will appear after the container starts."
    : "Job is running. Waiting for the first log lines to reach CloudWatch.";
  const message = data?.logs || data?.message || (pending ? waiting
    : isLoading ? "Loading logs..."
    : running ? waiting
    : "No logs available. Refresh to check again.");

  return (
    <section aria-label="Job logs" className="min-w-0 overflow-hidden rounded-lg border border-gray-300 bg-white">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-gray-200 px-4 py-3">
        <div className="min-w-0">
          <h3 className="font-semibold text-gray-900">Job output</h3>
          <p className="mt-1 text-sm text-gray-600">
            {isError ? "Automatic updates stopped after an error."
              : catchingUp ? "Checking for final output..."
              : pending ? "Log updates begin when the job runs."
              : !running ? "Automatic updates stopped."
              : !live ? "Logs are available after this job finishes."
              : interval === 0 ? "Automatic updates paused." : "Updates pause when this tab is hidden."}
          </p>
        </div>
        <span className="rounded-full bg-gray-100 px-3 py-1 text-sm font-medium text-gray-800">
          {jobStatusLabel({ jobStatus: status, batchStatus })}
        </span>
      </div>
      <div className="flex flex-wrap items-end justify-between gap-3 bg-gray-50 px-4 py-3">
        <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1 text-sm">
        <label htmlFor={intervalId}>Update interval</label>
        <select id={intervalId} value={interval} disabled={!running || !live}
          onChange={event => setInterval(Number(event.target.value))}
          className="min-h-10 min-w-36 rounded border border-gray-400 bg-white py-2 pl-3 pr-8 text-gray-900 disabled:opacity-60">
          <option value={2000}>2 seconds</option>
          <option value={5000}>5 seconds</option>
          <option value={10000}>10 seconds</option>
          <option value={30000}>30 seconds</option>
          <option value={0}>Paused</option>
        </select>
        </div>
        <button type="button" className="min-h-10 rounded border border-gray-400 bg-white px-3 py-2 text-sm font-medium text-gray-900 hover:bg-gray-100 disabled:opacity-50"
          disabled={isFetching} onClick={() => void refresh()}>
          {isFetching ? "Updating..." : data?.hasMore ? "Load more" : "Refresh logs"}
        </button>
        </div>
        <span className="text-xs text-gray-600">{dataUpdatedAt
          ? `Last checked ${new Date(dataUpdatedAt).toLocaleTimeString()}` : "Logs have not been checked yet."}</span>
      </div>
      <div className="space-y-2 p-4">
      {isError && <p role="alert">{error.message}</p>}
      {data?.hasMore && <p>More output is available. Load more to continue.</p>}
      {data?.truncated && <p>Showing the most recent 2 million characters of loaded output.</p>}
      <Textarea aria-label="Job output" readOnly value={message} className="w-full h-96 font-mono text-sm" />
      </div>
    </section>
  );
};

export default JobLogs;
