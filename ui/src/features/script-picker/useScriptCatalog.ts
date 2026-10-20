import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@usace-watermanagement/groundwork-water/auth/useAuth";
import fetchWithAuth from "../../utils/fetchWithAuth";
import type { Script } from "../scripts-manager/types";

const useScriptsCatalog = () => {
  const auth = useAuth();

  return useQuery({
    queryKey: ["catalog"],
    queryFn: () => fetchCatalog(auth.token),
  });
};

const fetchCatalog = async (token?: string): Promise<Script[]> => {
  const response = await fetchWithAuth("/api/scripts/catalog", {}, token);
  if (!response.ok) {
    throw new Error("Failed to fetch the scripts catalog");
  }
  return response.json();
};

export default useScriptsCatalog;
