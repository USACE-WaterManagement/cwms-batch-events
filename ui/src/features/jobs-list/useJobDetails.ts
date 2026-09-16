import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { useAuth } from "@usace-watermanagement/groundwork-water";
import fetchWithAuth from "../../utils/fetchWithAuth";
import { components } from "../../generated/api-types";

export type JobDetails = components["schemas"]["JobRecord"];

const useJobDetails = (jobId: string) => {
  const auth = useAuth();
  const client = useQueryClient();

  const query = useQuery({
    queryKey: ["job", jobId],
    queryFn: () => fetchJob(jobId, auth.token),
    refetchInterval: (query) => {
      if (query.state.status === "error") return false;
      const data = query.state.data;
      if (
        data &&
        (data.jobStatus === "Completed" || data.jobStatus === "Failed")
      )
        return false;
      return 5000;
    },
  });
  useEffect(() => {
    if (!query.data) return;
    const fresh = query.data;
    // Reuse the selected job's poll in run lists and history, with no extra GET.
    client.setQueriesData<JobDetails[] | { jobs: JobDetails[]; total: number }>(
      { queryKey: ["jobs"] }, cached => {
        if (!cached) return cached;
        const update = (jobs: JobDetails[]) => jobs.map(job => job.id === fresh.id ? fresh : job);
        return Array.isArray(cached) ? update(cached) : { ...cached, jobs: update(cached.jobs) };
      },
    );
  }, [client, query.data, query.dataUpdatedAt]);
  return query;
};

const fetchJob = async (jobId: string, token?: string): Promise<JobDetails> => {
  const response = await fetchWithAuth(`/api/jobs/${jobId}`, {}, token);
  if (!response.ok) {
    throw new Error(`Failed to fetch job ${jobId}`);
  }
  return response.json();
};

export default useJobDetails;
