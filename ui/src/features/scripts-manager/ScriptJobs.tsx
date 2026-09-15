import { Button, H3 } from "@usace/groundwork";
import { Link } from "@tanstack/react-router";
import useExecuteScript from "../script-picker/useExecuteScript";
import useJobsList from "../jobs-list/useJobsList";
import JobDetailFull from "../jobs-list/JobDetailFull";
import type { JobDetails } from "../jobs-list/useJobDetails";
import type { Script } from "./types";
import LoadingSpinner from "../../shared/components/LoadingSpinner";
import { jobStatusLabel } from "../jobs-list/jobStatus";
import { RunTriggerBadge } from "../jobs-list/RunAttribution";
import { submittedBy } from "../jobs-list/submittedBy";

export const ScriptRunJob = ({ script, onSubmitted }: {
  script: Script;
  onSubmitted: (job: JobDetails) => void;
}) => {
  const run = useExecuteScript(onSubmitted);
  return <div className="space-y-4 p-4">
    <H3>Run {script.name}</H3>
    <p>{script.description}</p>
    <dl className="space-y-2 text-sm">
      <div><dt className="font-semibold">{script.executionType === "command" ? "Executable" : "File"}</dt><dd className="break-all">{script.repoPath}</dd></div>
      <div><dt className="font-semibold">Arguments</dt><dd><pre className="whitespace-pre-wrap break-words">{script.commandArgs?.join("\n") || "None"}</pre></dd></div>
      <div><dt className="font-semibold">Execution roles</dt><dd>{script.roles.length ? script.roles.join(", ") : "No additional CDA role required. Office access is required."}</dd></div>
    </dl>
    <p className="text-sm text-gray-600">Runs the saved script settings. Open Details to edit them before submitting.</p>
    {!script.active && <p role="status">This script is inactive. Enable it in Details before running a job.</p>}
    <Button disabled={!script.active || run.isPending} onClick={() => run.mutate({ scriptId: script.id })}>
      {run.isPending ? "Submitting..." : "Submit job"}
    </Button>
    {run.isError && <p role="alert" className="text-red-700">Job could not be submitted: {run.error.message}</p>}
  </div>;
};

export const ScriptJobRuns = ({ script, selectedJobId, onSelectJob }: {
  script: Script;
  selectedJobId?: string;
  onSelectJob: (id: string | undefined) => void;
}) => {
  const jobs = useJobsList();
  const runs = jobs.data?.filter(job => job.scriptId === script.id && job.office === script.office);
  return <div className="space-y-4 p-4">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <H3>Office runs for {script.name}</H3>
      <Button size="sm" disabled={jobs.isFetching} onClick={() => void jobs.refetch()}>Refresh</Button>
    </div>
    <p className="text-sm text-gray-600">Runs are shared with CWMS users in {script.office}. <Link to="/jobs" className="text-blue-700 underline">Open Job History</Link> for all scripts in your offices.</p>
    {jobs.isLoading && <p role="status">Loading job runs...</p>}
    {jobs.isError && <p role="alert">Job runs could not be loaded. Use Refresh to try again.</p>}
    {!jobs.isError && runs?.length === 0 && <p>No runs yet. Open Run script to submit this script.</p>}
    {runs && runs.length > 0 && <ul className="max-h-64 space-y-2 overflow-y-auto">
      {runs.map(job => <li key={job.id}>
        <button type="button" aria-pressed={selectedJobId === job.id} onClick={() => onSelectJob(job.id)}
          className={`flex w-full flex-wrap justify-between gap-2 rounded border p-3 text-left hover:bg-blue-50 ${selectedJobId === job.id ? "border-blue-600 bg-blue-50" : "border-gray-300"}`}>
          <span>{new Date(job.createdTime).toLocaleString()}<span className="block text-sm text-gray-600">{submittedBy(job)}</span></span><span className="inline-flex items-center gap-2 font-semibold">
            <RunTriggerBadge job={job} />
            {(job.jobStatus === "Running" || job.jobStatus === "Pending") && <span aria-hidden="true"><LoadingSpinner /></span>}
            {jobStatusLabel(job)}
          </span>
        </button>
      </li>)}
    </ul>}
    {selectedJobId && <section aria-label="Selected job run" className="min-w-0 border-t border-gray-200 pt-4">
      <JobDetailFull key={selectedJobId} jobId={selectedJobId} />
    </section>}
  </div>;
};
