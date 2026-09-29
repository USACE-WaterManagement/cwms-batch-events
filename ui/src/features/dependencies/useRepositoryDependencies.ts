import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@usace-watermanagement/groundwork-water";
import fetchWithAuth from "../../utils/fetchWithAuth";

export interface DependencyPackage {
  name: string;
  operator: string;
  version: string;
}

export interface RepositoryDependencies {
  repository: string;
  ref: string;
  path: string;
  base_repository: string;
  base_ref: string;
  base_path: string;
  base_packages: DependencyPackage[];
  office_packages: DependencyPackage[];
  warnings: { code: string; message: string }[];
}

export function useRepositoryDependencies(office?: string) {
  const auth = useAuth();
  return useQuery<RepositoryDependencies>({
    queryKey: ["repository-dependencies", office],
    queryFn: async () => {
      const response = await fetchWithAuth(
        "/api/repository-dependencies?office=" + encodeURIComponent(office ?? ""),
        {},
        auth.token,
      );
      if (!response.ok) throw new Error("Requirements file unavailable");
      return response.json();
    },
    enabled: auth.isAuth && Boolean(office),
    staleTime: 60_000,
  });
}
