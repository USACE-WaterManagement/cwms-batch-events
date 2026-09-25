import { notifySuccess } from "../../utils/actionNotifications";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@usace-watermanagement/groundwork-water";
import fetchWithAuth from "../../utils/fetchWithAuth";
import { Script, ScriptCreate } from "./types";

export const useCreateScript = (office: string) => {
  const queryClient = useQueryClient();
  const auth = useAuth();

  return useMutation({
    mutationFn: (args: Omit<CreateScriptArgs, "token">) =>
      createScript({ ...args, token: auth.token }),

    onSuccess: (createdScript) => {
      notifySuccess("Script created.");
      queryClient.setQueryData<Script[]>(["scripts", office], (oldData) => {
        if (!oldData) return [createdScript];
        return [...oldData, createdScript];
      });
    },
  });
};

interface CreateScriptArgs {
  payload: ScriptCreate;
  token?: string;
}

const createScript = async ({
  payload,
  token,
}: CreateScriptArgs): Promise<Script> => {
  const response = await fetchWithAuth(
    `/api/scripts`,
    {
      method: "POST",
      body: JSON.stringify(payload),
      headers: { "Content-Type": "application/json" },
    },
    token,
  );
  if (!response.ok) {
    if (response.status === 409) {
      const data = await response.json();
      throw new Error(data?.detail ?? `Conflicts with existing script`);
    }
    throw new Error(`Failed to create script '${payload.name}'`);
  }
  return response.json();
};
