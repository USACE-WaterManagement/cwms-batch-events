import { ScriptDetailPanel } from "./ScriptDetailPanel";
import { ScriptsList } from "./ScriptsList";
import { ScriptCreate, ScriptFormData, ScriptUpdate } from "./types";
import useOfficeScripts from "./useOfficeScripts";
import { useState } from "react";
import { Button, H2 } from "@usace/groundwork";
import { useUpdateScript } from "./useUpdateScript";
import { useCreateScript } from "./useCreateScript";
import { useDeleteScript } from "./useDeleteScript";

const BATCH_RUNNER_UUID = "58600a09-f18e-42c5-9d3c-df52ebe409f9";

interface ScriptsWorkspaceProps {
  office: string;
}

export const ScriptsWorkspace = ({ office }: ScriptsWorkspaceProps) => {
  const scripts = useOfficeScripts(office);
  const createScriptMutation = useCreateScript(office);
  const deleteScriptMutation = useDeleteScript(office);
  const updateScriptMutation = useUpdateScript(office);

  const [selectedScriptId, setSelectedScriptId] = useState<
    string | undefined
  >();

  const [panelMode, setPanelMode] = useState<"view" | "edit">("view");

  if (scripts.isLoading) return <span>Loading scripts...</span>;
  if (scripts.isError)
    return <span>Error occurred while loading scripts.</span>;
  if (!scripts.data) return <span>No scripts found!</span>;

  const selectedScript = scripts.data.find(
    (script) => script.id === selectedScriptId,
  );

  const onSelect = (scriptId: string) => {
    setPanelMode("view");
    setSelectedScriptId(scriptId);
  };
  const onNew = () => {
    createScriptMutation.reset();
    deleteScriptMutation.reset();
    updateScriptMutation.reset();
    setPanelMode("edit");
    setSelectedScriptId(undefined);
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
    if (selectedScriptId) {
      const payload: ScriptUpdate = {
        ...data,
        executionType: "python",
        jobRunners: [BATCH_RUNNER_UUID],
      };
      await updateScriptMutation.mutateAsync({
        scriptId: selectedScriptId,
        payload: payload,
      });
    } else {
      const payload: ScriptCreate = {
        ...data,
        office: office,
        executionType: "python",
        jobRunners: [BATCH_RUNNER_UUID],
      };
      const script = await createScriptMutation.mutateAsync({
        payload: payload,
      });
      setSelectedScriptId(script.id);
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
    <div className="w-full grid grid-cols-2 gap-6 mt-4">
      <div>
        <header className="flex justify-between">
          <H2>{office.toUpperCase()} Scripts</H2>
          <Button onClick={onNew}>New +</Button>
        </header>
        <ScriptsList
          scripts={scripts.data}
          selectScript={onSelect}
          selectedScriptId={selectedScriptId}
        />
      </div>
      <ScriptDetailPanel
        office={office}
        script={selectedScript}
        mode={panelMode}
        isPending={isPending}
        mutationError={mutationError}
        onDelete={onDelete}
        onEdit={onEdit}
        onSave={onSave}
        onCancelEdit={onCancelEdit}
      />
    </div>
  );
};
