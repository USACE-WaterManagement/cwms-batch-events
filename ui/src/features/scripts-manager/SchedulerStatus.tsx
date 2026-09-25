import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@usace-watermanagement/groundwork-water";
import fetchWithAuth from "../../utils/fetchWithAuth";
import type { components } from "../../generated/api-types";

export function SchedulerStatus({ office }: { office?: string }) {
  const auth = useAuth();
  const status = useQuery({
    queryKey: ["scheduler-status", office],
    meta: { inlineError: true },
    queryFn: async () => {
      const query = office ? `?office=${encodeURIComponent(office)}` : "";
      const response = await fetchWithAuth(`/api/scheduler/status${query}`, {}, auth.token);
      if (!response.ok) throw new Error("Scheduler status is unavailable");
      const data = await response.json() as components["schemas"]["SchedulerStatus"];
      if (!Array.isArray(data.tasks)) throw new Error("Scheduler status is unavailable");
      return data;
    },
    refetchInterval: query => query.state.status === "error" ? false : 30000,
    retry: false,
  });
  if (status.isPending) return <p className="p-3 text-sm">Checking scheduler…</p>;
  if (status.isError) return <div className="m-2 rounded border border-amber-400 p-3 text-sm">
    Scheduler status is unavailable. <button type="button" className="underline" onClick={() => void status.refetch()}>Refresh scheduler status</button>
  </div>;
  const data = status.data;
  const healthy = data.enabled && data.tasks.length === 2 && data.tasks.every(task => task.healthy);
  let title = "Scheduler needs attention";
  if (!data.enabled) title = "Scheduler is disabled";
  else if (healthy) title = "Scheduler is running";
  return <section aria-label="Scheduler status" className="m-2 rounded border border-gray-300 bg-slate-50 p-3 text-sm">
    <strong>{title}</strong>
    <p>Schedules use each script’s timezone. After downtime, up to five minutes are recovered. Older runs are skipped.</p>
    <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1">
      {data.tasks.map(task => <span key={task.name}>
        {task.name === "schedules" ? "Schedule check" : "Queue delivery"}: {task.lastSuccess ? new Date(task.lastSuccess).toLocaleTimeString() : "Not yet checked"}
      </span>)}
      <span>Waiting for queue delivery: {data.pendingDelivery}</span>
    </div>
    {(data.needsAttention > 0 || data.invalidSchedules > 0) && <p role="alert" className="mt-2 text-amber-900">
      {data.needsAttention} scheduled runs pending for over ten minutes; {data.invalidSchedules} schedules have errors. Review office run history and script settings. Uncertain submissions are not automatically rerun.
    </p>}
  </section>;
}
