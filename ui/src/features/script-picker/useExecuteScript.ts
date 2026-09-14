import { useMutation, useQueryClient } from "@tanstack/react-query";
import fetchWithAuth from "../../utils/fetchWithAuth";
import { useAuth } from "@usace-watermanagement/groundwork-water";
import { JobDetails } from "../jobs-list/useJobDetails";
import { useNavigate } from "@tanstack/react-router";
import { components } from "../../generated/api-types";

export type ExecuteScriptPayload = components["schemas"]["ScriptRunRequest"];

const useExecuteScript = (onSubmitted?: (job: JobDetails) => void) => {
  const auth = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: ExecuteScriptPayload) =>
      executeScript(payload, auth.token),
    onSuccess: (job: JobDetails) => {
      queryClient.setQueryData(["job", job.id], job);
      void queryClient.invalidateQueries({ queryKey: ["jobs"] });
      if (onSubmitted) onSubmitted(job);
      else void navigate({ to: "/jobs/$jobId", params: { jobId: job.id } });
    },
  });
};

const executeScript = async (
  payload: ExecuteScriptPayload,
  token?: string
): Promise<JobDetails> => {
  const response = await fetchWithAuth(
    "/api/jobs",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    },
    token
  );

  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }

  return response.json();
};

export default useExecuteScript;
