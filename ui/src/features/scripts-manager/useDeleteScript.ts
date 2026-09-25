import { notifySuccess } from "../../utils/actionNotifications";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@usace-watermanagement/groundwork-water";
import fetchWithAuth from "../../utils/fetchWithAuth";
import { Script } from "./types";

export const useDeleteScript = (office: string) => {
  const queryClient = useQueryClient();
  const auth = useAuth();

  return useMutation({
    mutationFn: (args: Omit<DeleteScriptArgs, "token">) =>
      deleteScript({ ...args, token: auth.token }),

    onSuccess: (_data, args) => {
      notifySuccess("Script deleted.");
      queryClient.setQueryData<Script[]>(["scripts", office], (old) =>
        old?.filter((script) => script.id !== args.scriptId),
      );
    },
  });
};

interface DeleteScriptArgs {
  scriptId: string;
  token?: string;
}

const deleteScript = async ({
  scriptId,
  token,
}: DeleteScriptArgs): Promise<void> => {
  const response = await fetchWithAuth(
    `/api/scripts/${scriptId}`,
    {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
    },
    token,
  );
  if (!response.ok) {
    throw new Error(`Failed to delete script ${scriptId}`);
  }
};
