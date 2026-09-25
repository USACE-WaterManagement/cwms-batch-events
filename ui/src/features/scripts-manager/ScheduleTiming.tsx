import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@usace-watermanagement/groundwork-water";
import { MdSchedule, MdHistory } from "react-icons/md";
import fetchWithAuth from "../../utils/fetchWithAuth";
import type { Script } from "./types";

interface Timing {
  nextRunAt: string | null;
  lastFinishedAt: string | null;
  lastRunStatus: string | null;
  lastRunTrigger: string | null;
}

export function ScheduleTiming({ script, enabled, editing = false }: { script: Script; enabled: boolean; editing?: boolean }) {
  const auth = useAuth();
  const { data, isPending, isError } = useQuery<Timing>({
    queryKey: ["scheduleTiming", script.id, script.updatedTime], enabled: enabled && auth.isAuth,
    queryFn: async () => (await fetchWithAuth(`/api/scripts/${script.id}/schedule-status`, {}, auth.token)).json(),
    refetchInterval: query => query.state.status === "error" ? false : 30000,
  });
  const timezone = script.scheduleTimezone || "UTC";
  const format = (value: string) => new Date(value).toLocaleString(undefined, { timeZone: timezone });
  let next = "Manual — no automatic run scheduled";
  if (script.scheduleEnabled && script.active) next = "No occurrence in the next eight years. Review the schedule";
  if (data?.nextRunAt) next = format(data.nextRunAt);
  let last = "No finished runs recorded";
  if (data?.lastFinishedAt) last = `${format(data.lastFinishedAt)} · ${data.lastRunStatus} · ${data.lastRunTrigger}`;
  if (isPending) { next = "Loading…"; last = "Loading…"; }
  if (isError) { next = "Timing unavailable"; last = "Timing unavailable"; }
  return <div className="rounded-lg border border-blue-100 bg-blue-50/50 p-3 text-sm">
    <p className="mb-3 inline-flex flex-wrap items-center gap-2 rounded-md border border-blue-200 bg-white px-3 py-2 text-blue-950"><MdSchedule aria-hidden /><span>Timezone</span><strong>{timezone}</strong></p>
    <p className="mb-3 text-xs font-semibold text-slate-700">The minimum schedule interval is 5 minutes.</p>
    {script.scheduleError && <p role="alert" className="mb-3 rounded border border-amber-700 bg-amber-50 p-3 text-amber-950">{script.scheduleError}</p>}
    <dl className="grid gap-3">
      <div><dt className="flex items-center gap-2 font-semibold text-slate-600"><MdSchedule aria-hidden />Next scheduled run</dt><dd className="mt-1">{next}</dd></div>
      <div><dt className="flex items-center gap-2 font-semibold text-slate-600"><MdHistory aria-hidden />Last finished run</dt><dd className="mt-1">{last}</dd></div>
    </dl>
    <p className="mt-3 text-xs text-slate-500">{editing ? "Based on the saved schedule. Save to update the next run." : "Scheduled times are queue times. Execution may start later."}</p>
  </div>;
}
