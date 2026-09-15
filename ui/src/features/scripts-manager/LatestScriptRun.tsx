import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import type { JobDetails } from "../jobs-list/useJobDetails";
import { jobStatusLabel } from "../jobs-list/jobStatus";

dayjs.extend(relativeTime);

export function LatestScriptRun({ jobs, now, scriptName, state, onSelectRun }: {
  jobs: JobDetails[];
  now: number;
  scriptName: string;
  state: "loading" | "unavailable" | "ready";
  onSelectRun: (id: string) => void;
}) {
  if (state !== "ready") return <p className="mt-2 text-xs text-gray-500">
    {state === "loading" ? "Loading run history…" : "Run history unavailable"}
  </p>;
  const latest = [...jobs].sort((a, b) => new Date(b.createdTime).getTime() - new Date(a.createdTime).getTime())[0];
  if (!latest) return <p className="mt-2 text-xs text-gray-500">No runs yet</p>;
  const finished = latest.jobStatus === "Completed" || latest.jobStatus === "Failed";
  const hasFinishTime = finished && !!latest.endTime;
  const timestamp = finished ? latest.endTime ?? latest.createdTime : latest.createdTime;
  return <button type="button" aria-label={`View latest run for ${scriptName}`}
    title={`Latest run · ${new Date(timestamp).toLocaleString()}`}
    onClick={event => { event.stopPropagation(); onSelectRun(latest.id); }}
    className="mt-2 block rounded py-1 text-left text-xs text-gray-600 hover:text-blue-700 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">
    Latest run: {jobStatusLabel(latest) === "Pending" ? "Queued" : jobStatusLabel(latest)} · {hasFinishTime ? "" : "submitted "}<time dateTime={timestamp}>{dayjs(timestamp).from(now)}</time>
  </button>;
}
