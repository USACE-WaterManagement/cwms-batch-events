import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@usace-watermanagement/groundwork-water";
import fetchWithAuth from "../../utils/fetchWithAuth";

export interface ApplicationInfo {
  name: string;
  apiVersion: string;
  environment: string;
  buildRevision: string;
  buildTime?: string;
  authenticationEnvironment: string;
  jobRunner: string;
  rootPath: string;
  user: {
    username: string;
    offices: string[];
    adminOffices: string[];
    roles: Record<string, string[]>;
  };
}

export interface SchemaInfo {
  name: string;
  version: string;
  description: string;
  installedOn: string;
}

const fetchInfo = async <T>(path: string, token?: string): Promise<T> => {
  const response = await fetchWithAuth(path, {}, token);
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.detail ?? `Request failed (${response.status})`);
  }
  return response.json();
};

export const useApplicationInfo = () => {
  const auth = useAuth();
  return useQuery({
    queryKey: ["about", "application"],
    queryFn: () => fetchInfo<ApplicationInfo>("/api/about/application", auth.token),
    enabled: auth.isAuth,
  });
};

export const useSchemaInfo = () => {
  const auth = useAuth();
  return useQuery({
    queryKey: ["about", "schema"],
    queryFn: () => fetchInfo<SchemaInfo>("/api/about/schema", auth.token),
    enabled: auth.isAuth,
  });
};
