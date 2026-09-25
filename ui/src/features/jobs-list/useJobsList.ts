import { useQuery, useInfiniteQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
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

export function useScriptRuns(scriptId: string) {
  const auth = useAuth();
  const client = useQueryClient();
  return useInfiniteQuery({
    queryKey: ["jobs", "script", scriptId], enabled: auth.isAuth,
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      const response = await fetchWithAuth(`/api/jobs?scriptId=${encodeURIComponent(scriptId)}&limit=10&offset=${pageParam}`, {}, auth.token);
      if (!response.ok) throw new Error("Failed to fetch script runs");
      const jobs: JobDetails[] = await response.json();
      const totalHeader = response.headers.get("X-Total-Count");
      const total = totalHeader === null ? pageParam + jobs.length : Number(totalHeader);
      return { jobs: mergeObservedJobs(jobs, client), total, offset: pageParam };
    },
    getNextPageParam: last => {
      const next = last.offset + last.jobs.length;
      if (!last.jobs.length || next >= last.total) return undefined;
      return next;
    },
  });
}

export const useJobsPage = (page: number, pageSize: number | "all", offices: string[] = []) => {
  const auth = useAuth();
  const client = useQueryClient();
  return useQuery({
    queryKey: ["jobs", "page", page, pageSize, offices],
    enabled: auth.isAuth,
    queryFn: async () => {
      const params = new URLSearchParams();
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
