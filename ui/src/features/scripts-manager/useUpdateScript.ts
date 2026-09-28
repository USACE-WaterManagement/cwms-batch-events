import { notifySuccess } from "../../utils/actionNotifications";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@usace-watermanagement/groundwork-water";
import fetchWithAuth from "../../utils/fetchWithAuth";
import { Script, ScriptUpdate } from "./types";

export const useUpdateScript = (office: string) => {
  const queryClient = useQueryClient();
  const auth = useAuth();

  return useMutation({
    mutationFn: (args: Omit<UpdateScriptArgs, "token">) =>
      updateScript({ ...args, token: auth.token }),

    onSuccess: (updatedScript) => {
      notifySuccess("Script saved.");
      void queryClient.invalidateQueries({ queryKey: ["scheduleTiming", updatedScript.id] });
      void queryClient.invalidateQueries({ queryKey: ["catalog"] });
      queryClient.setQueryData<Script[]>(["scripts", office], (oldData) => {
        if (!oldData) return oldData;

        return oldData.map((script) =>
          script.id === updatedScript.id ? updatedScript : script,
        );
      });
    },
  });
};

interface UpdateScriptArgs {
  scriptId: string;
  payload: ScriptUpdate;
  token?: string;
}

const updateScript = async ({
  scriptId,
  payload,
  token,
}: UpdateScriptArgs): Promise<Script> => {
  const response = await fetchWithAuth(
    `/api/scripts/${scriptId}`,
    {
      method: "PUT",
      body: JSON.stringify(payload),
      headers: { "Content-Type": "application/json" },
    },
    token,
  );
  if (!response.ok) {
    throw new Error(`Failed to update script ${scriptId}`);
  }
  return response.json();
};
