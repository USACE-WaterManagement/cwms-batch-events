import { notifySuccess } from "../../utils/actionNotifications";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import fetchWithAuth from "../../utils/fetchWithAuth";
import { useAuth } from "@usace-watermanagement/groundwork-water";
import { JobDetails } from "../jobs-list/useJobDetails";
import { useNavigate } from "@tanstack/react-router";
import { components } from "../../generated/api-types";

export type ExecuteScriptPayload = Omit<components["schemas"]["ScriptRunRequest"], "runTrigger">;

export type JobRateLimitStatus = {
  office: string;
  limit: number;
  used: number;
  remaining: number;
  resetAfterSeconds: number;
};

const useExecuteScript = (onSubmitted?: (job: JobDetails) => void) => {
  const auth = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (payload: ExecuteScriptPayload) =>
      executeScript(payload, auth.token),
    onSuccess: (job: JobDetails, payload) => {
      notifySuccess("Job submitted.");
      queryClient.setQueryData(["job", job.id], job);
      void queryClient.invalidateQueries({ queryKey: ["jobs"] });
      if (payload.upgradeToVersion) {
        void queryClient.invalidateQueries({ queryKey: ["scripts"] });
        void queryClient.invalidateQueries({ queryKey: ["catalog"] });
      }
      if (onSubmitted) onSubmitted(job);
      else void navigate({ to: "/jobs/$jobId", params: { jobId: job.id } });
    },
  });
  return {
    ...mutation,
    checkRateLimit: (office: string) => getJobRateLimitStatus(office, auth.token),
  };
};

export const getJobRateLimitStatus = async (office: string, token?: string): Promise<JobRateLimitStatus> => {
  const response = await fetchWithAuth(`/api/jobs/rate-limit-status?office=${encodeURIComponent(office)}`, {}, token);
  const status: unknown = await response.json();
  if (!status || typeof status !== "object" || typeof (status as { remaining?: unknown }).remaining !== "number") {
    throw new Error("The server returned an invalid rate-limit status.");
  }
  return status as JobRateLimitStatus;
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
      body: JSON.stringify({ ...payload, runTrigger: "manual" }),
    },
    token
  );

  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }

  return response.json();
};

export default useExecuteScript;
