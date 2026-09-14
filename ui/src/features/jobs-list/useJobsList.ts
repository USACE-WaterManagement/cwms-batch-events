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
