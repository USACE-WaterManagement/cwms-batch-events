import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@usace-watermanagement/groundwork-water";
import fetchWithAuth from "../../utils/fetchWithAuth";

export function useSystemAdmin() {
  const auth = useAuth();
  return useQuery({
    queryKey: ["system-admin"], enabled: auth.isAuth, retry: false,
    queryFn: async () => {
      const response = await fetchWithAuth("/api/users/me/system-admin", {}, auth.token);
      if (!response.ok) throw new Error("Admin access could not be checked");
      return await response.json() === true;
    },
  });
}
