import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button, Modal } from "@usace/groundwork";
import { useAuth } from "@usace-watermanagement/groundwork-water";
import { useNavigate } from "@tanstack/react-router";
import fetchWithAuth from "../../utils/fetchWithAuth";
import { notifySuccess } from "../../utils/actionNotifications";
import { notifyError } from "../../utils/errorNotifications";
import type { JobDetails } from "./useJobDetails";

type CancelResponse = {
  action: "cancelled" | "cancel" | "terminate" | "already_finished" | "already_requested";
  status: JobDetails["jobStatus"];
  message: string;
};

export default function CancelJobButton({ job }: { job: Pick<JobDetails, "id" | "scriptName" | "office" | "jobStatus"> }) {
  const auth = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [opened, setOpened] = useState(false);
  const canCancel = job.jobStatus === "Pending" || job.jobStatus === "Running";
  const mutation = useMutation({
    mutationFn: async () => {
      const response = await fetchWithAuth(`/api/jobs/${job.id}/cancel?reason=${encodeURIComponent("User requested cancellation")}`, {
        method: "POST",
      }, auth.token);
      return await response.json() as CancelResponse;
    },
    onSuccess: result => {
      setOpened(false);
      notifySuccess(result.message);
      void queryClient.invalidateQueries({ queryKey: ["job", job.id] });
      void queryClient.invalidateQueries({ queryKey: ["jobs"] });
      void queryClient.invalidateQueries({ queryKey: ["adminQueues"] });
      void navigate({ to: "/jobs/$jobId", params: { jobId: job.id } });
    },
    onError: error => {
      notifyError({ id: `cancel-job-${job.id}`, message: error instanceof Error ? error.message : "The job could not be cancelled." });
    },
  });
  if (job.jobStatus === "Cancelling") {
    return <span className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900">Cancellation requested</span>;
  }
  if (!canCancel) return null;
  return <>
    <Button type="button" className="border-red-700 bg-red-700 text-white hover:bg-red-800" onClick={() => setOpened(true)}>
      Cancel run
    </Button>
    <Modal opened={opened} onClose={() => { if (!mutation.isPending) setOpened(false); }} dialogTitle="Cancel this job run"
      buttons={<div className="flex flex-wrap justify-end gap-3"><Button type="button" disabled={mutation.isPending} onClick={() => setOpened(false)}>Keep running</Button><Button type="button" className="border-red-700 bg-red-700 text-white hover:bg-red-800" disabled={mutation.isPending} onClick={() => mutation.mutate()}> {mutation.isPending ? "Cancelling…" : "Confirm cancellation"}</Button></div>}>
      <div className="space-y-3 text-sm">
        <p>Cancel <strong>{job.scriptName}</strong> for {job.office}?</p>
        <p>{job.jobStatus === "Pending" ? "A queued job will be removed before dispatch when possible." : "A running job will receive a stop request. It remains visible until the runner confirms the final state."}</p>
        <p className="text-slate-600">The request is recorded with your account and the current job state.</p>
      </div>
    </Modal>
  </>;
}
