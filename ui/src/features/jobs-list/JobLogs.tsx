import { useId, useState } from "react";
import useJobLogs from "./useJobLogs";
import { Textarea } from "@usace/groundwork";

interface JobLogsProps {
  jobId: string;
  status: string;
}

const JobLogs = ({ jobId, status }: JobLogsProps) => {
  const [interval, setInterval] = useState(2000);
  const intervalId = useId();
  const { data, error, isLoading, isError, isFetching, refresh } = useJobLogs(jobId, status, interval);
  const pending = status === "Pending";
  const running = status === "Running";
  const live = data?.supportsLive !== false;
  const message = data?.logs || (pending ? "Waiting for the job to start."
    : isLoading ? "Loading logs..."
    : running ? "Waiting for job output."
    : "No logs available. Refresh to check again.");

  return (
    <div className="min-w-0 space-y-2">
      <div className="flex flex-wrap items-center gap-3">
        <label htmlFor={intervalId}>Update interval</label>
        <select id={intervalId} value={interval} disabled={!running || !live}
          onChange={event => setInterval(Number(event.target.value))}
          className="rounded border px-2 py-1">
          <option value={2000}>2 seconds</option>
          <option value={5000}>5 seconds</option>
          <option value={10000}>10 seconds</option>
          <option value={30000}>30 seconds</option>
          <option value={0}>Paused</option>
        </select>
        <button type="button" className="rounded border px-3 py-1 disabled:opacity-50"
          disabled={pending || isFetching} onClick={() => void refresh()}>
          {data?.hasMore ? "Load more" : "Refresh logs"}
        </button>
        <span className="text-sm text-gray-600">
          {isFetching ? "Updating..." : !running ? "Automatic updates stopped."
            : !live ? "Logs are available after this job finishes."
            : isError ? "Automatic updates stopped after an error."
            : interval === 0 ? "Automatic updates paused." : "Updates pause when this tab is hidden."}
        </span>
      </div>
      {isError && <p role="alert">{error.message}</p>}
      {data?.hasMore && <p>More output is available. Load more to continue.</p>}
      {data?.truncated && <p>Showing the most recent 2 million characters of loaded output.</p>}
      <Textarea aria-label="Job output" readOnly value={message} className="w-full h-96" />
    </div>
  );
};

export default JobLogs;
