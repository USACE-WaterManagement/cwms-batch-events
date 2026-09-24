import { FiClock, FiHelpCircle, FiUser } from "react-icons/fi";
import type { JobDetails } from "./useJobDetails";

export function RunTriggerBadge({ job }: { job: JobDetails }) {
  const trigger = job.runTrigger ?? "unknown";
  const [label, Icon, color] = trigger === "scheduled"
    ? ["Scheduled", FiClock, "bg-violet-50 text-violet-800 ring-violet-200"] as const
    : trigger === "manual"
      ? ["Manual", FiUser, "bg-blue-50 text-blue-800 ring-blue-200"] as const
      : ["Unknown", FiHelpCircle, "bg-gray-100 text-gray-700 ring-gray-200"] as const;
  return <span title={trigger === "unknown" ? "The trigger was not recorded for this run." : `${label} run`}
    className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${color}`}>
    <Icon aria-hidden="true" />{label}
  </span>;
}
