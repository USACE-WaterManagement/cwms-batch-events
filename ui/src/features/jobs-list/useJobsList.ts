import { dateParams, type RunDateRange } from "./runDateRange";
import { useQuery, keepPreviousData, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useAuth } from "@usace-watermanagement/groundwork-water";
import fetchWithAuth from "../../utils/fetchWithAuth";
import { JobDetails } from "./useJobDetails";

const useJobsList = (poll = false, latestPerScript = false) => {
  const auth = useAuth();
  const client = useQueryClient();

  return useQuery({
    queryKey: latestPerScript ? ["jobs", "latest"] : ["jobs"],
    queryFn: async () => mergeObservedJobs(await fetchJobs(auth.token, latestPerScript), client),
    enabled: auth.isAuth,
    refetchInterval: (query) =>
      poll && query.state.status !== "error" ? 5000 : false,
  });
};

function mergeObservedJobs(jobs: JobDetails[], client: QueryClient): JobDetails[] {
  return jobs.map(job => {
    const detail = client.getQueryCache().find({ queryKey: ["job", job.id], exact: true });
    // A concurrently completing list request must not overwrite the open
    // viewer's status. Closed viewers leave future list responses untouched.
    if (job.jobStatus === "Completed" || job.jobStatus === "Failed" || detail?.state.status === "error") return job;
    return detail?.isActive() && detail.state.data ? detail.state.data as JobDetails : job;
  });
}

const fetchJobs = async (token?: string, latestPerScript = false): Promise<JobDetails[]> => {
  const query = latestPerScript ? "?latestPerScript=true" : "";
  const response = await fetchWithAuth(`/api/jobs${query}`, {}, token);
  if (!response.ok) {
    throw new Error("Failed to fetch job history");
  }
  return response.json();
};

export default useJobsList;

export const useJobsPage = (page: number, pageSize: number | "all", offices: string[] = [], range: RunDateRange = { start: "", end: "" }, scriptId?: string) => {
  const auth = useAuth();
  const client = useQueryClient();
  return useQuery({
    queryKey: ["jobs", "page", page, pageSize, offices, range, scriptId],
    placeholderData: keepPreviousData,
    enabled: auth.isAuth && !(range.start && range.end && range.start > range.end),
    queryFn: async () => {
      const params = dateParams(range);
      if (scriptId) params.set("scriptId", scriptId);
      if (pageSize !== "all") { params.set("limit", String(pageSize)); params.set("offset", String((page - 1) * pageSize)); }
      offices.forEach(office => params.append("office", office));
      const query = params.size ? `?${params}` : "";
      const response = await fetchWithAuth(`/api/jobs${query}`, {}, auth.token);
      if (!response.ok) throw new Error("Failed to fetch job history");
      const jobs: JobDetails[] = await response.json();
      const total = Number(response.headers.get("X-Total-Count") ?? jobs.length);
      return { jobs: mergeObservedJobs(jobs, client), total };
    },
  });
};
