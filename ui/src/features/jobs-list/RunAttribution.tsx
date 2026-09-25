import { FiClock, FiHelpCircle, FiUser } from "react-icons/fi";
import type { JobDetails } from "./useJobDetails";

export function RunTriggerBadge({ job }: { job: JobDetails }) {
  const trigger = job.runTrigger ?? "unknown";
  let label = "Unknown";
  let Icon = FiHelpCircle;
  let color = "border-dashed border-slate-600 bg-white text-slate-800";
  if (trigger === "scheduled") {
    label = "Scheduled";
    Icon = FiClock;
    color = "border-indigo-950 bg-indigo-950 text-white";
  }
  if (trigger === "manual") {
    label = "Manual";
    Icon = FiUser;
    color = "border-slate-600 bg-white text-slate-900";
  }
  return <span title={trigger === "unknown" ? "The trigger was not recorded for this run." : `${label} run`}
    className={`inline-flex shrink-0 items-center gap-1 rounded border px-2 py-0.5 text-xs font-semibold ${color}`}>
    <Icon aria-hidden="true" />{label}
  </span>;
}
