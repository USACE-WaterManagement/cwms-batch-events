import { Button, H3, Modal } from "@usace/groundwork";
import { Link } from "@tanstack/react-router";
import useExecuteScript from "../script-picker/useExecuteScript";
import useJobsList from "../jobs-list/useJobsList";
import JobDetailFull from "../jobs-list/JobDetailFull";
import type { JobDetails } from "../jobs-list/useJobDetails";
import type { Script, ScriptFormData } from "./types";
import LoadingSpinner from "../../shared/components/LoadingSpinner";
import { jobStatusLabel } from "../jobs-list/jobStatus";
import { useState } from "react";
import { CommandEditor } from "./CommandEditor";
import { commandPreview, CURRENT_SCRIPT_VERSION } from "./commandArguments";

export const ScriptRunJob = ({ script, onSubmitted }: {
  script: Script;
  onSubmitted?: (job: JobDetails) => void;
}) => {
  const run = useExecuteScript(onSubmitted);
  const [custom, setCustom] = useState(false);
  const initialCommand: ScriptFormData = { ...script, configVersion: CURRENT_SCRIPT_VERSION,
    executionType: script.executionType === "command" ? "command" : "github_file",
    runtime: script.runtime === "java" || script.runtime === "shell" ? script.runtime : "python",
    commandMode: script.commandMode === "shell" ? "shell" : "arguments" };
  const [command, setCommand] = useState(initialCommand);
  const [commandValid, setCommandValid] = useState(true);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const version = script.configVersion ?? 1;
  const submit = (upgrade: boolean) => {
    setUpgradeOpen(false);
    run.mutate({ scriptId: script.id,
      ...(upgrade ? { upgradeToVersion: CURRENT_SCRIPT_VERSION } : {}),
      ...(custom ? command.commandMode === "shell"
        ? { commandMode: "shell" as const, shellCommand: command.shellCommand }
        : { commandArgs: command.commandArgs, ...(script.commandMode === "shell" ? { commandMode: "arguments" as const } : {}) } : {}),
    });
  };
  return <div className="space-y-4 p-4">
    <H3>Run {script.name}</H3>
    <p>{script.description}</p>
    <dl className="space-y-2 text-sm">
      <div><dt className="font-semibold">{script.executionType === "command" ? "Executable" : "File"}</dt><dd className="break-all">{script.repoPath}</dd></div>
      <div><dt className="font-semibold">Saved command · version {version}</dt><dd><pre className="whitespace-pre-wrap break-all">{script.commandMode === "shell" ? script.shellCommand : commandPreview(script)}</pre></dd></div>
      <div><dt className="font-semibold">Execution roles</dt><dd>{script.roles.length ? script.roles.join(", ") : "No additional CDA role required. Office access is required."}</dd></div>
    </dl>
    <p className="text-sm text-gray-600">Submit job uses the saved settings. Custom run lets you change arguments for one run without saving changes to the script.</p>
    {custom && <div className="space-y-2 rounded border border-blue-300 bg-blue-50 p-3">
      <CommandEditor value={command} onChange={setCommand} onValidityChange={setCommandValid} disabled={run.isPending} argumentsAvailable={!!script.repoPath.trim()} label="Arguments for this run" />
      <p className="text-sm text-gray-600">These changes apply only to this run. The saved script stays unchanged.</p>
    </div>}
    {version === 1 && <p className="text-sm text-gray-600">To use custom arguments, a script administrator must edit and save this legacy script in Scripts Manager first.</p>}
    <Link to="/help/script-versions" target="_blank" rel="noopener noreferrer" className="text-sm text-blue-700 underline">About script versions and commands (new tab)</Link>
    {!script.active && <p role="status">This script is inactive. Enable it in Details before running a job.</p>}
    <div className="flex flex-wrap gap-3">
    <Button disabled={!script.active || run.isPending || (custom && !commandValid)} onClick={() => version === 2 ? setUpgradeOpen(true) : submit(false)}>
      {run.isPending ? "Submitting..." : custom ? "Submit custom run" : "Submit job"}
    </Button>
    <Button disabled={!script.active || run.isPending || version < 2} onClick={() => {
      setCustom(!custom); setCommand(initialCommand); setCommandValid(true); run.reset();
    }}>{custom ? "Cancel custom run" : "Custom run"}</Button>
    </div>
    {run.isError && <p role="alert" className="text-red-700">Job could not be submitted: {run.error.message}</p>}
    <Modal opened={upgradeOpen} onClose={() => setUpgradeOpen(false)} dialogTitle="Upgrade this run to version 3?">
      <div className="space-y-4">
        <p>This script uses version 2. Version 3 adds Bash command mode. Upgrading this run preserves your arguments and leaves the saved script unchanged.</p>
        <p>To upgrade the saved script, an administrator can review and save it in Scripts Manager.</p>
        <Link to="/help/script-versions" target="_blank" rel="noopener noreferrer" className="text-blue-700 underline">Read about script versions (new tab)</Link>
        {custom && command.commandMode === "shell" && <p>Bash command mode requires version 3.</p>}
        <div className="flex flex-wrap gap-3">
          <Button onClick={() => submit(true)}>Upgrade this run</Button>
          <Button disabled={custom && command.commandMode === "shell"} onClick={() => submit(false)}>Run version 2</Button>
          <Button onClick={() => setUpgradeOpen(false)}>Cancel</Button>
        </div>
      </div>
    </Modal>
  </div>;
};

export const ScriptJobRuns = ({ script, selectedJobId, onSelectJob }: {
  script: Script;
  selectedJobId?: string;
  onSelectJob: (id: string | undefined) => void;
}) => {
  const jobs = useJobsList();
  const runs = jobs.data?.filter(job => job.scriptId === script.id && job.office === script.office)
    .sort((a, b) => new Date(b.createdTime).getTime() - new Date(a.createdTime).getTime());
  const displayedJobId = selectedJobId ?? runs?.[0]?.id;
  return <div className="space-y-4 p-4">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <H3>Your runs for {script.name}</H3>
      <Button size="sm" disabled={jobs.isFetching} onClick={() => void jobs.refetch()}>Refresh</Button>
    </div>
    <p className="text-sm text-gray-600">Only jobs submitted by your account are shown. <Link to="/jobs" className="text-blue-700 underline">Open Job History</Link> for all your scripts.</p>
    {jobs.isLoading && <p role="status">Loading job runs...</p>}
    {jobs.isError && <p role="alert">Job runs could not be loaded. Use Refresh to try again.</p>}
    {!jobs.isError && runs?.length === 0 && <p>No runs yet. Open Run script to submit this script.</p>}
    {runs && runs.length > 0 && <ul className="max-h-64 space-y-2 overflow-y-auto">
      {runs.map(job => <li key={job.id}>
        <button type="button" aria-pressed={displayedJobId === job.id} onClick={() => onSelectJob(job.id)}
          className={`flex w-full flex-wrap justify-between gap-2 rounded border p-3 text-left hover:bg-blue-50 ${displayedJobId === job.id ? "border-blue-600 bg-blue-50" : "border-gray-300"}`}>
          <span>{new Date(job.createdTime).toLocaleString()}</span><span className="inline-flex items-center gap-2 font-semibold">
            {(job.jobStatus === "Running" || job.jobStatus === "Pending") && <span aria-hidden="true"><LoadingSpinner /></span>}
            {jobStatusLabel(job)}
            <span className="rounded border border-blue-300 bg-white px-3 py-1 font-medium text-blue-700">Open</span>
          </span>
        </button>
      </li>)}
    </ul>}
    {displayedJobId && <section aria-label="Selected job run" className="min-w-0 border-t border-gray-200 pt-4">
      <JobDetailFull key={displayedJobId} jobId={displayedJobId} />
    </section>}
  </div>;
};
