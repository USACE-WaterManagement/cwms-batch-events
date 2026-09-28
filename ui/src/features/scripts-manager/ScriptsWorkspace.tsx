import { LoadingRows } from "../../shared/components/LoadingRows";
import { ScriptDetailPanel } from "./ScriptDetailPanel";
import { ScriptForm } from "./ScriptForm";
import { ScriptsList } from "./ScriptsList";
import { ScriptCreate, ScriptFormData, ScriptUpdate } from "./types";
import useOfficeScripts from "./useOfficeScripts";
import { useState, type ReactNode } from "react";
import { Button, H2, Modal, Tabs } from "@usace/groundwork";
import { ScriptJobRuns, ScriptRunJob } from "./ScriptJobs";
import { useUpdateScript } from "./useUpdateScript";
import { useCreateScript } from "./useCreateScript";
import { useDeleteScript } from "./useDeleteScript";
import { useDefaultJobRunner } from "./useDefaultJobRunner";
import { MdCode } from "react-icons/md";
import useJobsList from "../jobs-list/useJobsList";
import { useNavigate } from "@tanstack/react-router";

interface ScriptsWorkspaceProps {
  officeSelector?: ReactNode;
  office: string;
  initialScriptId?: string;
  initialEdit?: boolean;
  initialJobId?: string;
  search: string;
  searchTerm: string;
  onSearch: (search: string) => void;
}

export const ScriptsWorkspace = ({ officeSelector, office, initialScriptId, initialEdit, initialJobId, search, searchTerm, onSearch }: ScriptsWorkspaceProps) => {
  const navigate = useNavigate();
  const scripts = useOfficeScripts(office);
  const jobs = useJobsList(true, true);
  const createScriptMutation = useCreateScript(office);
  const deleteScriptMutation = useDeleteScript(office);
  const updateScriptMutation = useUpdateScript(office);
  const defaultJobRunner = useDefaultJobRunner();

  const [selectedScriptId, setSelectedScriptId] = useState<
    string | undefined
  >(initialScriptId);

  const [panelMode, setPanelMode] = useState<"view" | "edit">(initialEdit ? "edit" : "view");
  const [creating, setCreating] = useState(false);
  const [invalidDetails, setInvalidDetails] = useState(false);
  const [panelTab, setPanelTab] = useState({ index: initialJobId ? 2 : 0, revision: 0 });
  const [selectedJobId, setSelectedJobId] = useState<string | undefined>(initialJobId);
  const showTab = (index: number) => setPanelTab(previous => ({ index, revision: previous.revision + 1 }));

  const routeState = JSON.stringify([initialScriptId, initialJobId, initialEdit]);
  const [lastRouteState, setLastRouteState] = useState(routeState);
  if (lastRouteState !== routeState) {
    setLastRouteState(routeState);
    if (initialScriptId && (initialScriptId !== selectedScriptId || initialJobId !== selectedJobId || initialEdit)) {
      setSelectedScriptId(initialScriptId);
      setSelectedJobId(initialJobId);
      if (initialJobId) setPanelTab(previous => ({ index: 2, revision: previous.revision + 1 }));
      if (initialEdit) {
        setPanelMode('edit');
        setPanelTab(previous => ({ index: 0, revision: previous.revision + 1 }));
      }
    }
  }

  if (scripts.isLoading) return <LoadingRows label="Loading job definitions" />;
  if (defaultJobRunner.isLoading) return <LoadingRows label="Loading job runner" />;
  if (scripts.isError)
    return <span>Error occurred while loading scripts.</span>;
  if (defaultJobRunner.isError || !defaultJobRunner.data)
    return <span>Error occurred while loading the default job runner.</span>;
  if (!scripts.data) return <span>No jobs found!</span>;

  const selectedScript = scripts.data.find(
    (script) => script.id === selectedScriptId,
  );
  const terms = searchTerm.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const filteredScripts = scripts.data.filter(script => {
    const text = [script.name, script.slug, script.description, script.repoPath, script.runtime].join(" ").toLowerCase();
    return terms.every(term => text.includes(term));
  });

  const onSelect = (scriptId: string, tab = 0, jobId?: string) => {
    setInvalidDetails(false);
    setPanelMode("view");
    if (tab === 2 || scriptId !== selectedScriptId) setSelectedJobId(jobId);
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
    const script = await createScriptMutation.mutateAsync({ payload });
    setSelectedScriptId(script.id);
    setSelectedJobId(undefined);
    showTab(0);
    setPanelMode("view");
    setCreating(false);
  };
  const onEdit = () => {
    setInvalidDetails(false);
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
  const onCancelEdit = () => { setInvalidDetails(false); setPanelMode("view"); };

  const isPending =
    createScriptMutation.isPending ||
    deleteScriptMutation.isPending ||
    updateScriptMutation.isPending;

  const mutationError =
    createScriptMutation.error ||
    deleteScriptMutation.error ||
    updateScriptMutation.error;

  return (
    <div className="scripts-workspace grid w-full grid-cols-[repeat(auto-fit,minmax(min(100%,36rem),1fr))] gap-6">
      <div className="min-w-0">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3"><H2>{office.toUpperCase()} Jobs</H2>{officeSelector}</div>
          {scripts.data.length > 0 && <Button onClick={onNew}>New +</Button>}
        </header>
        {scripts.data.length > 0 && <div className="mt-3 space-y-2">
          <label htmlFor="script-search" className="text-sm font-medium text-slate-700">Search jobs</label>
          <div className="flex gap-2"><input id="script-search" type="search" value={search} onChange={event => onSearch(event.target.value)}
            placeholder="Name, description, path, or runtime" className="min-h-11 min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 focus:outline-2 focus:outline-blue-600" />
            {search && <Button type="button" onClick={() => onSearch("")}>Clear</Button>}
          </div>
          <p role="status" className="text-xs text-slate-500">{filteredScripts.length} of {scripts.data.length} jobs</p>
        </div>}
        {scripts.data.length === 0 ? (
          <div className="mt-3 flex min-h-48 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-gray-300 bg-gray-50 px-6 py-10 text-center">
            <MdCode aria-hidden className="text-4xl text-gray-400" />
            <h3 className="text-lg font-semibold text-gray-900">No jobs yet for {office.toUpperCase()}</h3>
            <p className="max-w-md text-sm text-gray-600">Define a Python program, Java JAR, Bash script, or installed command for this office.</p>
            <Button onClick={onNew}>Create first job</Button>
          </div>
        ) : <div
          role="region"
          aria-label={`${office.toUpperCase()} jobs list`}
          tabIndex={0}
          className="mt-3 min-w-0 rounded border border-gray-200"
        >
          {jobs.isError && <p role="status" className="flex flex-wrap items-center gap-2 p-3 text-sm">
            Run status is unavailable.
            <Button size="sm" disabled={jobs.isFetching} onClick={() => void jobs.refetch()}>Retry run status</Button>
          </p>}
          <ScriptsList
            scripts={filteredScripts}
            selectScript={onSelect}
            editScript={scriptId => {
              onSelect(scriptId);
              onEdit();
            }}
            selectedScriptId={selectedScriptId}
            jobs={jobs.isError ? [] : jobs.data ?? []}
            jobsUpdatedAt={jobs.dataUpdatedAt}
            runHistoryState={jobs.isError ? "unavailable" : jobs.isPending ? "loading" : "ready"}
          />
          {filteredScripts.length === 0 && <p className="p-5 text-sm text-slate-600">No jobs match your search. Try a name, command, path, or runtime.</p>}
        </div>}
      </div>
      {scripts.data.length > 0 && <div className="script-workspace-panel @container/script-panel min-w-0 self-start rounded-xl border border-gray-200 bg-white p-3 [overflow-wrap:anywhere]">
      {selectedScript ? <>
        <header className="mb-3 border-b border-gray-200 px-1 pb-3">
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-500">{office.toUpperCase()} · {selectedScript.runtime}</p>
          <H2 className="break-words">{selectedScript.name}</H2>
        </header>
        <div data-invalid-details={invalidDetails} className={invalidDetails ? "[&_[role=tab]:first-child]:bg-red-50! [&_[role=tab]:first-child]:text-red-800! [&_[role=tab]:first-child]:border-red-600!" : ""}>
        <Tabs key={`${selectedScript.id}:${panelTab.revision}`} defaultIndex={panelTab.index} fill tabs={[
          { name: "Details", content: <ScriptDetailPanel
            office={office} script={selectedScript} mode={panelMode} isPending={isPending}
            mutationError={mutationError} onDelete={onDelete} onEdit={onEdit}
            onSave={onSave} onCancelEdit={onCancelEdit} onValidationChange={setInvalidDetails}
            existingNames={scripts.data.map(script => script.name)} /> },
          { name: "Run job", content: <ScriptRunJob script={selectedScript} onEdit={() => { showTab(0); onEdit(); }} onSubmitted={job => {
            setSelectedScriptId(job.scriptId ?? selectedScript.id);
            setPanelMode("view");
            setSelectedJobId(job.id);
            showTab(2);
          }} /> },
          { name: "Run history", content: <ScriptJobRuns script={selectedScript}
            latestRunId={jobs.data?.filter(job => job.scriptId === selectedScript.id).sort((a, b) => new Date(b.createdTime).getTime() - new Date(a.createdTime).getTime())[0]?.id}
            selectedJobId={selectedJobId} onSelectJob={jobId => {
              setSelectedJobId(jobId);
              void navigate({ to: "/scripts-manager", search: { office, scriptId: selectedScript.id, jobId } });
            }} /> },
        ]} />
        </div>
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
        existingNames={scripts.data.map(script => script.name)}
      />}
      </div>}
      <Modal opened={creating} onClose={onCancelCreate}
        dialogTitle={`New job · ${office.toUpperCase()}`} size="3xl"
        className="[&_[id^=headlessui-dialog-panel]]:w-[min(48rem,100%)]! [&_[id^=headlessui-dialog-panel]]:min-w-0 [&_[id^=headlessui-dialog-panel]]:p-4! [&_[id^=headlessui-dialog-panel]]:max-h-[calc(100dvh-2rem)] [&_[id^=headlessui-dialog-panel]]:overscroll-contain sm:[&_[id^=headlessui-dialog-panel]]:p-6! [&_[id^=headlessui-dialog-panel]]:flex [&_[id^=headlessui-dialog-panel]]:flex-col [&_[id^=headlessui-dialog-panel]]:overflow-hidden [&_.script-form]:flex [&_.script-form]:flex-col [&_.script-form]:min-h-0 [&_.script-form]:overflow-hidden [&_.script-form-layout]:flex [&_.script-form-layout]:flex-col [&_.script-form-layout]:min-h-0 [&_.script-form-layout]:overflow-hidden [&_.script-form-fields]:min-h-0 [&_.script-form-fields]:overflow-y-auto [&_.script-form-fields]:overscroll-contain [&_.script-form-fields]:p-1 [&_.script-form-fields]:[scrollbar-gutter:stable] [&_.script-form-actions]:shrink-0 [&_.script-form-actions]:border-t [&_.script-form-actions]:border-gray-200 [&_.script-form-actions]:pt-4">
        {creating && <ScriptForm
          office={office}
          isPending={createScriptMutation.isPending}
          mutationError={createScriptMutation.error}
          onDelete={onDelete}
          onSave={onCreate}
          onCancelEdit={onCancelCreate}
          existingNames={scripts.data.map(script => script.name)}
        />}
      </Modal>
    </div>
  );
};
