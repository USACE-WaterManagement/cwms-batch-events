import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@usace-watermanagement/groundwork-water/auth/useAuth";
import fetchWithAuth from "../../utils/fetchWithAuth";
import type { Script } from "../scripts-manager/types";

const useOfficeScripts = (office: string) => {
  const auth = useAuth();

  return useQuery({
    queryKey: ["scripts", office],
    queryFn: () => fetchOfficeScripts(office, auth.token),
  });
};

const fetchOfficeScripts = async (
  office: string,
  token?: string,
): Promise<Script[]> => {
  const response = await fetchWithAuth(
    `/api/scripts?office=${office}`,
    {},
    token,
  );
  if (!response.ok) {
    throw new Error(`Failed to fetch scripts for office '${office}'`);
  }
  return response.json();
};

export default useOfficeScripts;
