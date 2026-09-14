import { ScriptDetailPanel } from "./ScriptDetailPanel";
import { ScriptForm } from "./ScriptForm";
import { ScriptsList } from "./ScriptsList";
import { ScriptCreate, ScriptFormData, ScriptUpdate } from "./types";
import useOfficeScripts from "./useOfficeScripts";
import { useState } from "react";
import { Button, H2, Modal, Tabs } from "@usace/groundwork";
import { ScriptJobRuns, ScriptRunJob } from "./ScriptJobs";
import { useUpdateScript } from "./useUpdateScript";
import { useCreateScript } from "./useCreateScript";
import { useDeleteScript } from "./useDeleteScript";
import { useDefaultJobRunner } from "./useDefaultJobRunner";
import { MdCode } from "react-icons/md";
import useJobsList from "../jobs-list/useJobsList";

interface ScriptsWorkspaceProps {
  office: string;
}

export const ScriptsWorkspace = ({ office }: ScriptsWorkspaceProps) => {
  const scripts = useOfficeScripts(office);
  const jobs = useJobsList(true);
  const createScriptMutation = useCreateScript(office);
  const deleteScriptMutation = useDeleteScript(office);
  const updateScriptMutation = useUpdateScript(office);
  const defaultJobRunner = useDefaultJobRunner();

  const [selectedScriptId, setSelectedScriptId] = useState<
    string | undefined
  >();

  const [panelMode, setPanelMode] = useState<"view" | "edit">("view");
  const [creating, setCreating] = useState(false);
  const [panelTab, setPanelTab] = useState({ index: 0, revision: 0 });
  const [selectedJobId, setSelectedJobId] = useState<string>();
  const showTab = (index: number) => setPanelTab(previous => ({ index, revision: previous.revision + 1 }));

  if (scripts.isLoading) return <span>Loading scripts...</span>;
  if (defaultJobRunner.isLoading) return <span>Loading job runner...</span>;
  if (scripts.isError)
    return <span>Error occurred while loading scripts.</span>;
  if (defaultJobRunner.isError || !defaultJobRunner.data)
    return <span>Error occurred while loading the default job runner.</span>;
  if (!scripts.data) return <span>No scripts found!</span>;

  const selectedScript = scripts.data.find(
    (script) => script.id === selectedScriptId,
  );

  const onSelect = (scriptId: string, tab = 0, jobId?: string) => {
    setPanelMode("view");
    if (jobId || scriptId !== selectedScriptId) setSelectedJobId(jobId);
    setSelectedScriptId(scriptId);
    showTab(tab);
  };
  const onNew = () => {
    createScriptMutation.reset();
    setCreating(true);
  };
  const onCancelCreate = () => {
    if (!createScriptMutation.isPending) setCreating(false);
  };
  const onCreate = async (data: ScriptFormData) => {
    const payload: ScriptCreate = {
      ...data,
      office,
      jobRunners: [defaultJobRunner.data.id],
    };
    try {
      const script = await createScriptMutation.mutateAsync({ payload });
      setSelectedScriptId(script.id);
      setSelectedJobId(undefined);
      showTab(0);
      setPanelMode("view");
      setCreating(false);
    } catch {
      // The form displays the mutation error and retains the entered values.
    }
  };
  const onEdit = () => {
    createScriptMutation.reset();
    deleteScriptMutation.reset();
    updateScriptMutation.reset();
    setPanelMode("edit");
  };
  const onDelete = async (scriptId: string) => {
    await deleteScriptMutation.mutateAsync({ scriptId });
    setSelectedScriptId(undefined);
    setPanelMode("view");
  };
  const onSave = async (data: ScriptFormData) => {
    const jobRunners =
      selectedScript?.jobRunners && selectedScript.jobRunners.length > 0
        ? selectedScript.jobRunners
        : [defaultJobRunner.data.id];

    if (selectedScriptId) {
      const payload: ScriptUpdate = {
        ...data,
        jobRunners,
      };
      await updateScriptMutation.mutateAsync({
        scriptId: selectedScriptId,
        payload: payload,
      });
    }

    setPanelMode("view");
  };
  const onCancelEdit = () => setPanelMode("view");

  const isPending =
    createScriptMutation.isPending ||
    deleteScriptMutation.isPending ||
    updateScriptMutation.isPending;

  const mutationError =
    createScriptMutation.error ||
    deleteScriptMutation.error ||
    updateScriptMutation.error;

  return (
    <div className="scripts-workspace w-full mt-4">
      <div className="min-w-0">
        <header className="flex justify-between">
          <H2>{office.toUpperCase()} Scripts</H2>
          {scripts.data.length > 0 && <Button onClick={onNew}>New +</Button>}
        </header>
        {scripts.data.length === 0 ? (
          <div className="mt-3 flex min-h-48 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-gray-300 bg-gray-50 px-6 py-10 text-center">
            <MdCode aria-hidden className="text-4xl text-gray-400" />
            <h3 className="text-lg font-semibold text-gray-900">No scripts yet for {office.toUpperCase()}</h3>
            <p className="max-w-md text-sm text-gray-600">Create a script to define what this office can run, including its runtime, file path, and arguments.</p>
            <Button onClick={onNew}>Create first script</Button>
          </div>
        ) : <div
          role="region"
          aria-label={`${office.toUpperCase()} scripts list`}
          tabIndex={0}
          className="mt-3 min-w-0 rounded border border-gray-200"
        >
          {jobs.isError && <p role="status" className="flex flex-wrap items-center gap-2 p-3 text-sm">
            Run status is unavailable.
            <Button size="sm" disabled={jobs.isFetching} onClick={() => void jobs.refetch()}>Retry run status</Button>
          </p>}
          <ScriptsList
            scripts={scripts.data}
            selectScript={onSelect}
            selectedScriptId={selectedScriptId}
            jobs={jobs.isError ? [] : jobs.data ?? []}
            jobsUpdatedAt={jobs.dataUpdatedAt}
          />
        </div>}
      </div>
      {scripts.data.length > 0 && <div className="script-workspace-panel min-w-0 self-start rounded-xl border border-gray-200 bg-white p-3 [overflow-wrap:anywhere]">
      {selectedScript ? <>
        <H2 className="mb-3 break-words">{selectedScript.name}</H2>
        <Tabs key={`${selectedScript.id}:${panelTab.revision}`} defaultIndex={panelTab.index} fill tabs={[
          { name: "Details", content: <ScriptDetailPanel
            office={office} script={selectedScript} mode={panelMode} isPending={isPending}
            mutationError={mutationError} onDelete={onDelete} onEdit={onEdit}
            onSave={onSave} onCancelEdit={onCancelEdit} /> },
          { name: "Run job", content: <ScriptRunJob script={selectedScript} onSubmitted={job => {
            setSelectedScriptId(job.scriptId ?? selectedScript.id);
            setPanelMode("view");
            setSelectedJobId(job.id);
            showTab(2);
          }} /> },
          { name: "Job runs", content: <ScriptJobRuns script={selectedScript}
            selectedJobId={selectedJobId} onSelectJob={setSelectedJobId} /> },
        ]} />
      </> : <ScriptDetailPanel
        office={office}
        script={selectedScript}
        mode={panelMode}
        isPending={isPending}
        mutationError={mutationError}
        onDelete={onDelete}
        onEdit={onEdit}
        onSave={onSave}
        onCancelEdit={onCancelEdit}
      />}
      </div>}
      <Modal opened={creating} onClose={onCancelCreate}
        dialogTitle={`New script · ${office.toUpperCase()}`} size="3xl"
        className="[&_[id^=headlessui-dialog-panel]]:w-[min(48rem,100%)]! [&_[id^=headlessui-dialog-panel]]:min-w-0 [&_[id^=headlessui-dialog-panel]]:p-4! [&_[id^=headlessui-dialog-panel]]:max-h-[calc(100dvh-2rem)] [&_[id^=headlessui-dialog-panel]]:overscroll-contain sm:[&_[id^=headlessui-dialog-panel]]:p-6! [&_[id^=headlessui-dialog-panel]]:flex [&_[id^=headlessui-dialog-panel]]:flex-col [&_[id^=headlessui-dialog-panel]]:overflow-hidden [&_.script-form]:flex [&_.script-form]:flex-col [&_.script-form]:min-h-0 [&_.script-form]:overflow-hidden [&_.script-form-layout]:flex [&_.script-form-layout]:flex-col [&_.script-form-layout]:min-h-0 [&_.script-form-layout]:overflow-hidden [&_.script-form-fields]:min-h-0 [&_.script-form-fields]:overflow-y-auto [&_.script-form-fields]:overscroll-contain [&_.script-form-fields]:p-1 [&_.script-form-fields]:[scrollbar-gutter:stable] [&_.script-form-actions]:shrink-0 [&_.script-form-actions]:border-t [&_.script-form-actions]:border-gray-200 [&_.script-form-actions]:pt-4">
        {creating && <ScriptForm
          office={office}
          isPending={createScriptMutation.isPending}
          mutationError={createScriptMutation.error}
          onDelete={onDelete}
          onSave={onCreate}
          onCancelEdit={onCancelCreate}
        />}
      </Modal>
    </div>
  );
};
