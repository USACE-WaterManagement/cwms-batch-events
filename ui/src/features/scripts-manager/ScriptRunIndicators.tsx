import { FaTriangleExclamation } from "react-icons/fa6";
import LoadingSpinner from "../../shared/components/LoadingSpinner";
import type { JobDetails } from "../jobs-list/useJobDetails";
import { jobStatusLabel } from "../jobs-list/jobStatus";

const recentFailureWindow = 24 * 60 * 60 * 1000;
const failureTime = (job: JobDetails) => new Date(job.endTime ?? job.createdTime).getTime();

export const ScriptRunIndicators = ({ jobs, now, scriptName, onSelectRun }: {
  jobs: JobDetails[];
  now: number;
  scriptName: string;
  onSelectRun: (jobId: string) => void;
}) => {
  const active = jobs
    .filter(job => job.jobStatus === "Running" || job.jobStatus === "Pending")
    .sort((a, b) => new Date(b.createdTime).getTime() - new Date(a.createdTime).getTime());
  const activeRun = active.find(job => job.jobStatus === "Running") ?? active[0];
  const failed = jobs
    .filter(job => job.jobStatus === "Failed" && now >= failureTime(job) && now - failureTime(job) <= recentFailureWindow)
    .sort((a, b) => failureTime(b) - failureTime(a))[0];

  if (!activeRun && !failed) return null;

  return <div className="mt-2 flex flex-wrap gap-2 whitespace-normal" onClick={event => event.stopPropagation()}>
    {activeRun && <button type="button" onClick={() => onSelectRun(activeRun.id)}
      aria-label={`View active run for ${scriptName}`}
      title={`${active.length} active run${active.length === 1 ? "" : "s"}. Open ${jobStatusLabel(activeRun).toLowerCase()} run.`}
      className="inline-flex items-center gap-1.5 rounded border border-blue-200 bg-blue-50 px-2 py-1 text-xs font-medium text-blue-800 hover:bg-blue-100">
      <span aria-hidden="true"><LoadingSpinner /></span>
      {active.length > 1 ? `${active.length} active runs` : activeRun.batchStatus ? jobStatusLabel(activeRun) : activeRun.jobStatus === "Running" ? "Running" : "Queued"}
    </button>}
    {failed && <button type="button" onClick={() => onSelectRun(failed.id)}
      aria-label={`View recent failed run for ${scriptName}`}
      title={`Failed ${new Date(failureTime(failed)).toLocaleString()}. Failures from the past 24 hours are shown.`}
      className="inline-flex items-center gap-1.5 rounded border border-amber-300 bg-amber-50 px-2 py-1 text-xs font-medium text-amber-900 hover:bg-amber-100">
      <FaTriangleExclamation aria-hidden="true" /> Recent failure
    </button>}
  </div>;
};
