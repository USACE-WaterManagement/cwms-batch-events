import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@usace-watermanagement/groundwork-water";
import fetchWithAuth from "../../utils/fetchWithAuth";

export interface RepositoryWarning { code: string; message: string }
interface Catalog { repository: string; ref: string; paths: string[]; warnings?: RepositoryWarning[]; mock?: boolean }

export function useRepositoryStatus() {
  const auth = useAuth();
  return useQuery<{ warnings: RepositoryWarning[]; mock: boolean; repositories?: Record<string, string> }>({
    queryKey: ["repository-status", auth.isAuth],
    queryFn: async () => (await fetchWithAuth("/api/repository-status", {}, auth.token)).json(),
    enabled: auth.isAuth,
    staleTime: 60_000,
  });
}

export function useRepositoryFiles(office: string, enabled = true) {
  const auth = useAuth();
  return useQuery<Catalog>({
    queryKey: ["repository-files", office],
    queryFn: async () => {
      const response = await fetchWithAuth(`/api/repository-files?office=${encodeURIComponent(office)}`, {}, auth.token);
      if (!response.ok) throw new Error("Repository files unavailable");
      return response.json();
    },
    enabled: enabled && auth.isAuth && Boolean(office),
    staleTime: 60_000,
  });
}
