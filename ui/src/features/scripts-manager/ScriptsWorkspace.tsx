import { ScriptDetailPanel } from "./ScriptDetailPanel";
import { ScriptsList } from "./ScriptsList";
import { ScriptCreate, ScriptFormData, ScriptUpdate } from "./types";
import useOfficeScripts from "./useOfficeScripts";
import { useState } from "react";
import { Badge, Button, H2, Tabs } from "@usace/groundwork";
import { useUpdateScript } from "./useUpdateScript";
import { useCreateScript } from "./useCreateScript";
import { useDeleteScript } from "./useDeleteScript";
import { ScriptNotificationEditor } from "../notifications-manager/ScriptNotificationEditor";
import { useScriptNotificationRules } from "../notifications-manager/api";
import { FaEnvelope, FaFileLines } from "react-icons/fa6";

import { useDefaultJobRunner } from "./useDefaultJobRunner";

interface ScriptsWorkspaceProps {
  office: string;
}

export const ScriptsWorkspace = ({ office }: ScriptsWorkspaceProps) => {
  const scripts = useOfficeScripts(office);
  const createScriptMutation = useCreateScript(office);
  const deleteScriptMutation = useDeleteScript(office);
  const updateScriptMutation = useUpdateScript(office);
  const defaultJobRunner = useDefaultJobRunner();

  const [selectedScriptId, setSelectedScriptId] = useState<
    string | undefined
  >();

  const [panelMode, setPanelMode] = useState<"view" | "edit">("view");
  const notificationRules = useScriptNotificationRules(selectedScriptId);

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
    const jobRunners =
      selectedScript?.jobRunners && selectedScript.jobRunners.length > 0
        ? selectedScript.jobRunners
        : [defaultJobRunner.data.id];

    if (selectedScriptId) {
      const payload: ScriptUpdate = {
        ...data,
        executionType: "python",
        jobRunners,
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
        jobRunners,
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

  const failureEmailEnabled = notificationRules.data?.some(
    (rule) => rule.eventType === "job_failed" && rule.active,
  );

  return (
    <>
      <div className="mt-4 grid w-full grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="min-w-0">
          <header className="flex flex-wrap items-center justify-between gap-3">
            <H2>{office.toUpperCase()} Scripts</H2>
            <Button onClick={onNew}>New script</Button>
          </header>
          <ScriptsList
            scripts={scripts.data}
            selectScript={onSelect}
            selectedScriptId={selectedScriptId}
          />
        </div>
        <section className="min-w-0 rounded-lg bg-gray-100 p-4">
          {selectedScript && panelMode === "view" && (
            <Tabs
              key={selectedScript.id}
              fill
              tabs={[
                {
                  name: "Script details",
                  leftSection: <FaFileLines aria-hidden="true" />,
                  content: (
                    <ScriptDetailPanel
                      script={selectedScript}
                      mode={panelMode}
                      isPending={isPending}
                      mutationError={mutationError}
                      onDelete={onDelete}
                      onEdit={onEdit}
                      onSave={onSave}
                      onCancelEdit={onCancelEdit}
                    />
                  ),
                },
                {
                  name: "Failure email",
                  leftSection: <FaEnvelope aria-hidden="true" />,
                  rightSection: (
                    <Badge color={failureEmailEnabled ? "green" : "zinc"}>
                      {failureEmailEnabled ? "On" : "Off"}
                    </Badge>
                  ),
                  content: <ScriptNotificationEditor script={selectedScript} />,
                },
              ]}
            />
          )}
          {(!selectedScript || panelMode === "edit") && (
            <ScriptDetailPanel
              script={selectedScript}
              mode={panelMode}
              isPending={isPending}
              mutationError={mutationError}
              onDelete={onDelete}
              onEdit={onEdit}
              onSave={onSave}
              onCancelEdit={onCancelEdit}
            />
          )}
        </section>
      </div>
    </>
  );
};
