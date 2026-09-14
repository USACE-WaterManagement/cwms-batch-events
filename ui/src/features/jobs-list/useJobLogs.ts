import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef } from "react";
import { useAuth } from "@usace-watermanagement/groundwork-water";
import fetchWithAuth from "../../utils/fetchWithAuth";
import { components } from "../../generated/api-types";

export type JobLogPage = components["schemas"]["JobLogPage"];
type LogState = JobLogPage & { truncated: boolean };
const MAX_VISIBLE_CHARACTERS = 2_000_000;

const useJobLogs = (jobId: string, status: string, interval: number) => {
  const auth = useAuth();
  const client = useQueryClient();
  const startFromBeginning = useRef(false);
  const finished = status === "Completed" || status === "Failed";
  const activeKey = ["job", jobId, "logs", "active"];
  // A terminal transition fetches once, even when automatic updates are paused.
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
        logs: combined.slice(-MAX_VISIBLE_CHARACTERS),
        truncated: combined.length > MAX_VISIBLE_CHARACTERS || (!page.reset && !!previous?.truncated),
      };
    },
    enabled: status !== "Pending",
    refetchInterval: query => {
      if (status !== "Running" || interval === 0 || query.state.status === "error"
        || query.state.data?.supportsLive === false) return false;
      return interval;
    },
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
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
