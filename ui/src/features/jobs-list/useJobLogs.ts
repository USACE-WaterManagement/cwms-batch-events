import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef } from "react";
import { useAuth } from "@usace-watermanagement/groundwork-water";
import fetchWithAuth from "../../utils/fetchWithAuth";
import { components } from "../../generated/api-types";

export type JobLogPage = components["schemas"]["JobLogPage"];
type LogState = JobLogPage & { truncated: boolean; completionChecks?: number };
const MAX_VISIBLE_CHARACTERS = 2_000_000;
export const FINAL_LOG_CHECKS = 6;

const useJobLogs = (jobId: string, status: string, interval: number, endTime?: string | null) => {
  const auth = useAuth();
  const client = useQueryClient();
  const startFromBeginning = useRef(false);
  const finished = status === "Completed" || status === "Failed";
  const activeKey = ["job", jobId, "logs", "active"];
  // Also catch up when a newly opened terminal job has not received its output
  // yet. Keep the budget in the cache so remounting cannot restart polling.
  const queryKey = finished ? ["job", jobId, "logs", "finished"] : activeKey;

  const query = useQuery({
    queryKey,
    queryFn: async ({ signal }): Promise<LogState> => {
      const previous = startFromBeginning.current ? undefined : (client.getQueryData<LogState>(queryKey)
        ?? (finished ? client.getQueryData<LogState>(activeKey) : undefined));
      const params = new URLSearchParams();
      if (previous?.nextCursor) params.set("cursor", previous.nextCursor);
      const response = await fetchWithAuth(
        `/api/jobs/${jobId}/logs/page?${params}`, { signal }, auth.token,
      );
      const page: JobLogPage = await response.json();
      startFromBeginning.current = false;
      const combined = page.reset ? page.logs
        : [previous?.logs, page.logs].filter(Boolean).join("\n");
      return {
        ...page,
        completionChecks: finished && (previous?.completionChecks !== undefined
          || client.getQueryData<LogState>(activeKey) || !page.available
          || !combined || (endTime && Date.now() - Date.parse(endTime) < 60_000))
          ? (previous?.completionChecks ?? -1) + 1 : undefined,
        logs: combined.slice(-MAX_VISIBLE_CHARACTERS),
        truncated: combined.length > MAX_VISIBLE_CHARACTERS || (!page.reset && !!previous?.truncated),
      };
    },
    enabled: status !== "Pending",
    refetchInterval: query => {
      if (query.state.status === "error") return false;
      const checks = query.state.data?.completionChecks;
      if (finished && checks !== undefined && checks < FINAL_LOG_CHECKS
        && (query.state.data?.supportsLive !== false || !query.state.data?.available)) return 5000;
      if (status !== "Running" || interval === 0
        || query.state.data?.supportsLive === false) return false;
      return interval;
    },
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false,
  });
  return {
    ...query,
    refresh: () => {
      if (query.isError) startFromBeginning.current = true;
      return query.refetch({ cancelRefetch: false });
    },
  };
};

export default useJobLogs;
