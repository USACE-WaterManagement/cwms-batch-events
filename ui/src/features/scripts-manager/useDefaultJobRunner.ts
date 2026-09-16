import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@usace-watermanagement/groundwork-water";
import fetchWithAuth from "../../utils/fetchWithAuth";

interface DefaultJobRunner {
  id: string;
  slug: string;
}

export const useDefaultJobRunner = () => {
  const auth = useAuth();

  return useQuery({
    queryKey: ["job-runners", "default"],
    queryFn: () => fetchDefaultJobRunner(auth.token),
  });
};

const fetchDefaultJobRunner = async (
  token?: string,
): Promise<DefaultJobRunner> => {
  const response = await fetchWithAuth("/api/job-runners/default", {}, token);
  if (!response.ok) {
    throw new Error("Failed to fetch default job runner");
  }
  return response.json();
};
