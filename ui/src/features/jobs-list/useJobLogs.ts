import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@usace-watermanagement/groundwork-water";
import fetchWithAuth from "../../utils/fetchWithAuth";
import { components } from "../../generated/api-types";

export type JobLogs = components["schemas"]["JobLogs"];

const useJobLogs = (jobId: string, enabled: boolean) => {
  const auth = useAuth();

  return useQuery({
    queryKey: ["job", jobId, "logs"],
    queryFn: () => fetchJobs(jobId, auth.token),
    enabled,
  });
};

const fetchJobs = async (jobId: string, token?: string): Promise<JobLogs> => {
  const response = await fetchWithAuth(`/api/jobs/${jobId}/logs`, {}, token);
  if (!response.ok) {
    const payload = await response.json().catch(() => undefined);
    const detail =
      payload && typeof payload.detail === "string"
        ? payload.detail
        : `Failed to fetch logs for job ${jobId}`;
    throw new Error(detail);
  }
  return response.json();
};

export default useJobLogs;
