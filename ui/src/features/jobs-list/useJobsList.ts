import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@usace-watermanagement/groundwork-water";
import fetchWithAuth from "../../utils/fetchWithAuth";
import { JobDetails } from "./useJobDetails";

const useJobsList = (poll = false) => {
  const auth = useAuth();

  return useQuery({
    queryKey: ["jobs"],
    queryFn: () => fetchJobs(auth.token),
    enabled: auth.isAuth,
    refetchInterval: (query) =>
      poll && query.state.status !== "error" ? 5000 : false,
  });
};

const fetchJobs = async (token?: string): Promise<JobDetails[]> => {
  const response = await fetchWithAuth("/api/jobs", {}, token);
  if (!response.ok) {
    throw new Error("Failed to fetch job history");
  }
  return response.json();
};

export default useJobsList;

export const useJobsPage = (page: number, pageSize: number | "all") => {
  const auth = useAuth();
  return useQuery({
    queryKey: ["jobs", "page", page, pageSize],
    enabled: auth.isAuth,
    queryFn: async () => {
      const query = pageSize === "all" ? "" : `?limit=${pageSize}&offset=${(page - 1) * pageSize}`;
      const response = await fetchWithAuth(`/api/jobs${query}`, {}, auth.token);
      if (!response.ok) throw new Error("Failed to fetch job history");
      const jobs: JobDetails[] = await response.json();
      const total = Number(response.headers.get("X-Total-Count") ?? jobs.length);
      return { jobs, total };
    },
  });
};
