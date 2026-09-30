import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@usace-watermanagement/groundwork-water/auth/useAuth";
import fetchWithAuth from "../../utils/fetchWithAuth";

const useAdminOffices = () => {
  const auth = useAuth();

  return useQuery({
    queryKey: ["adminOffices"],
    queryFn: () => fetchAdminOffices(auth.token),
    enabled: auth.isAuth,
  });
};

const fetchAdminOffices = async (token?: string): Promise<string[]> => {
  const response = await fetchWithAuth(
    "/api/users/me/admin-offices",
    {},
    token,
  );
  if (!response.ok) {
    throw new Error("Failed to fetch admin offices for user");
  }
  return response.json();
};

export default useAdminOffices;
