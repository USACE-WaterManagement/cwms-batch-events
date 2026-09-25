import { RunDatePicker, RunPagination, type RunDateRange } from "../jobs-list/RunHistoryControls";
import { LoadingRows } from "../../shared/components/LoadingRows";
import { RequestErrorPage } from "../../shared/components/StatePage";
import { RequiredRoles } from "./RequiredRoles";
import { Button, H3 } from "@usace/groundwork";
import { Link } from "@tanstack/react-router";
import useExecuteScript from "../script-picker/useExecuteScript";
import type { ExecuteScriptPayload } from "../script-picker/useExecuteScript";
import { useJobsPage } from "../jobs-list/useJobsList";
import JobDetailFull from "../jobs-list/JobDetailFull";
import type { JobDetails } from "../jobs-list/useJobDetails";
import type { Script, ScriptFormData } from "./types";
import LoadingSpinner from "../../shared/components/LoadingSpinner";
import { jobStatusLabel } from "../jobs-list/jobStatus";
import { useState, useEffect, useRef } from "react";
import { CommandEditor } from "./CommandEditor";
import { savedCommandPreview, CURRENT_SCRIPT_VERSION, supportsScriptVersion } from "./commandArguments";

function customRunOptions(custom: boolean, command: ScriptFormData, script: Script): Partial<ExecuteScriptPayload> {
  if (!custom) return {};
  if (command.commandMode === "shell") {
    return { commandMode: "shell", shellCommand: command.shellCommand };
  }
  if (script.commandMode === "shell") {
    return { commandMode: "arguments", commandArgs: command.commandArgs };
  }
  return { commandArgs: command.commandArgs };
}

function submitButtonLabel(pending: boolean, custom: boolean): string {
  if (pending) return "Submitting...";
  if (custom) return "Submit custom run";
  return "Submit job";
}
import { RunTriggerBadge } from "../jobs-list/RunAttribution";
import { submittedBy } from "../jobs-list/submittedBy";

export const ScriptRunJob = ({ script, onSubmitted, onEdit }: {
  script: Script;
  onSubmitted?: (job: JobDetails) => void;
  onEdit?: () => void;
}) => {
  const run = useExecuteScript(onSubmitted);
  const [custom, setCustom] = useState(false);
  const initialCommand: ScriptFormData = { ...script, configVersion: CURRENT_SCRIPT_VERSION,
    executionType: script.executionType === "command" ? "command" : "github_file",
    runtime: script.runtime === "java" || script.runtime === "shell" ? script.runtime : "python",
    commandMode: script.commandMode === "shell" ? "shell" : "arguments" };
  const [command, setCommand] = useState(initialCommand);
  const [commandValid, setCommandValid] = useState(true);
  const version = script.configVersion ?? 1;
  const submit = () => {
    run.mutate({ scriptId: script.id,
      ...customRunOptions(custom, command, script),
    });
  };
  return <div className="min-w-0 max-w-full space-y-4 p-4">
    <H3>Run {script.name}</H3>
    <p>{script.description}</p>
    {!supportsScriptVersion(version) && <p role="alert">This app does not support configuration version {version}. Running is unavailable.</p>}
    <dl className="space-y-2 text-sm">
      <div><dt className="font-semibold">{script.executionType === "command" ? "Executable" : "File"}</dt><dd tabIndex={0} className="overflow-x-auto whitespace-nowrap font-mono">{script.repoPath}</dd></div>
      <div><dt className="font-semibold">Saved command</dt><dd><pre tabIndex={0} className="overflow-x-auto whitespace-pre">{savedCommandPreview(script)}</pre></dd></div>
      <div><dt className="font-semibold">Execution roles</dt><dd><RequiredRoles office={script.office} roles={script.roles} /></dd></div>
    </dl>
    {custom && <div className="space-y-2 rounded border border-blue-300 bg-blue-50 p-3">
      <CommandEditor value={command} onChange={setCommand} onValidityChange={setCommandValid} disabled={run.isPending} argumentsAvailable={!!script.repoPath.trim()} shellRequiresUpgrade={version === 2} label="Arguments for this run" />
      <p className="text-sm text-gray-600">These changes apply only to this run. The saved script stays unchanged.</p>
    </div>}
    {version === 1 && <p className="text-sm text-gray-600">To use custom arguments, a script administrator must use Upgrade configuration in Details first.</p>}
    {!script.active && <p role="status">This script is inactive. Enable it in Details before running a job.</p>}
    <div className="flex flex-wrap gap-3">
    <Button title="Submit a job using the saved settings, or the custom settings shown for this run." disabled={!supportsScriptVersion(version) || !script.active || run.isPending || (custom && (!commandValid || (version < 3 && command.commandMode === "shell")))} onClick={submit}>
      {submitButtonLabel(run.isPending, custom)}
    </Button>
    <Button title="Change arguments for one run without saving changes to the script." disabled={!supportsScriptVersion(version) || !script.active || run.isPending || version < 2} onClick={() => {
      setCustom(!custom); setCommand(initialCommand); setCommandValid(true); run.reset();
    }}>{custom ? "Cancel custom run" : "Custom run"}</Button>
    {onEdit && <Button disabled={run.isPending} onClick={onEdit}>Edit job</Button>}
    </div>
    {custom && version < 3 && command.commandMode === "shell" && <p role="status">Upgrade configuration in Details before using Bash command mode.</p>}
  </div>;
};

export const ScriptJobRuns = ({ script, selectedJobId, onSelectJob, latestRunId }: {
  script: Script;
  selectedJobId?: string;
  onSelectJob: (id: string | undefined) => void;
  latestRunId?: string;
}) => {
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(10);
  const [range, setRange] = useState<RunDateRange>({ start: "", end: "" });
  const jobs = useJobsPage(page, size, [], range, script.id);
  const loading = jobs.isPending || jobs.isPlaceholderData;
  const observedLatest = useRef(latestRunId);
  const refresh = jobs.refetch;
  useEffect(() => {
    if (latestRunId && latestRunId !== observedLatest.current) void refresh();
    observedLatest.current = latestRunId;
  }, [latestRunId, refresh]);
  const uniqueRuns = new Map(jobs.data?.jobs.map(job => [job.id, job]));
  const runs = [...uniqueRuns.values()].filter(job => job.scriptId === script.id && job.office === script.office)
    .sort((a, b) => new Date(b.createdTime).getTime() - new Date(a.createdTime).getTime());
  const displayedJobId = selectedJobId ?? runs?.[0]?.id;
  return <div className="min-w-0 max-w-full space-y-4 p-4">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <H3>Office runs for {script.name}</H3>
      <Button size="sm" disabled={jobs.isFetching} onClick={() => void jobs.refetch()}>Refresh</Button>
    </div>
    <p className="text-sm text-gray-600">Runs are shared with CWMS users in {script.office}. <Link to="/jobs" className="text-blue-700 underline">Open Job History</Link> for all scripts in your offices.</p>
    <RunDatePicker value={range} onChange={value => { setRange(value); setPage(1); onSelectJob(undefined); }} />
    <RunPagination page={page} size={size} total={jobs.data?.total ?? 0} loading={loading}
      onPage={value => { setPage(value); onSelectJob(undefined); }} onSize={value => { setSize(value); setPage(1); onSelectJob(undefined); }} />
    {loading && <LoadingRows label="Loading job runs" />}
    {jobs.isError && <RequestErrorPage error={jobs.error} onRetry={() => void refresh()} />}
    {!loading && !jobs.isError && runs?.length === 0 && <p>No runs yet. Open Run job to submit this script.</p>}
    {!loading && !jobs.isError && runs.length > 0 && <ul aria-label="Script run history" className="min-h-64 space-y-2">
      {runs.map(job => <li key={job.id}>
        <button type="button" aria-pressed={displayedJobId === job.id} onClick={() => onSelectJob(job.id)}
          className={`flex w-full flex-wrap justify-between gap-2 rounded border p-3 text-left hover:bg-blue-50 ${displayedJobId === job.id ? "border-blue-600 bg-blue-50" : "border-gray-300"}`}>
          <span>{new Date(job.createdTime).toLocaleString()}<span className="block text-sm text-gray-600">{submittedBy(job)}</span></span><span className="inline-flex items-center gap-2 font-semibold">
            <RunTriggerBadge job={job} />
            {(job.jobStatus === "Running" || job.jobStatus === "Pending") && <span aria-hidden="true"><LoadingSpinner /></span>}
            {jobStatusLabel(job)}
            <span aria-hidden>›</span>
          </span>
        </button>
      </li>)}
    </ul>}

    {!loading && displayedJobId && <section aria-label="Selected job run" className="min-w-0 border-t border-gray-200 pt-4">
      <JobDetailFull key={displayedJobId} jobId={displayedJobId} />
    </section>}
  </div>;
};
