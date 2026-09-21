import { FaTriangleExclamation } from "react-icons/fa6";
import LoadingSpinner from "../../shared/components/LoadingSpinner";
import type { JobDetails } from "../jobs-list/useJobDetails";
import { jobStatusLabel } from "../jobs-list/jobStatus";

const failureTime = (job: JobDetails) => new Date(job.endTime ?? job.createdTime).getTime();

export const ScriptRunIndicators = ({ jobs, scriptName, onSelectRun }: {
  jobs: JobDetails[];
  scriptName: string;
  onSelectRun: (jobId: string) => void;
}) => {
  const latest = [...jobs].sort((a, b) => new Date(b.createdTime).getTime() - new Date(a.createdTime).getTime())[0];
  const activeRun = latest && (latest.jobStatus === "Running" || latest.jobStatus === "Pending") ? latest : undefined;
  const failed = latest?.jobStatus === "Failed" ? latest : undefined;

  if (!activeRun && !failed) return null;

  return <div className="inline-flex flex-wrap gap-2 whitespace-normal" onClick={event => event.stopPropagation()}>
    {activeRun && <button type="button" onClick={() => onSelectRun(activeRun.id)}
      aria-label={`View active run for ${scriptName}`}
      title={`Latest run: ${jobStatusLabel(activeRun)}`}
      className="inline-flex items-center gap-1.5 rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-800 hover:bg-blue-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">
      <span aria-hidden="true"><LoadingSpinner /></span>
      {activeRun.batchStatus ? jobStatusLabel(activeRun) : activeRun.jobStatus === "Running" ? "Running" : "Queued"}
    </button>}
    {failed && <button type="button" onClick={() => onSelectRun(failed.id)}
      aria-label={`View latest failed run for ${scriptName}`}
      title={`Latest run failed ${new Date(failureTime(failed)).toLocaleString()}.`}
      className="inline-flex items-center gap-1.5 rounded-full border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-900 hover:bg-amber-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-600">
      <FaTriangleExclamation aria-hidden="true" /> Failed
    </button>}
  </div>;
};
