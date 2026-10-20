import type { JobDetails } from "./useJobDetails";

export function submittedBy(job: JobDetails): string {
  // Also protect against older API responses that still contain raw principals.
  for (const candidate of [job.displayName, job.username]) {
    if (candidate?.trim() && !/\d{10,}|^\d+$/.test(candidate.trim())) return candidate;
  }
  return "Name unavailable";
}
