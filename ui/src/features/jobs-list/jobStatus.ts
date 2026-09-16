import type { JobDetails } from "./useJobDetails";

export function jobStatusLabel(job: Pick<JobDetails, "jobStatus" | "batchStatus">): string {
  // The terminal application state wins over any older Batch observation.
  if (job.jobStatus === "Completed" || job.jobStatus === "Failed") return job.jobStatus;
  const labels: Record<string, string> = {
    SUBMITTED: "Submitted", PENDING: "Queued", RUNNABLE: "Queued",
    STARTING: "Starting", RUNNING: "Running",
  };
  return labels[job.batchStatus ?? ""] ?? job.jobStatus;
}
