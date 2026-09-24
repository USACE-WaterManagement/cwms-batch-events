import dayjs from "dayjs";
import { ViewField } from "./ViewField";
import { Button, Text } from "@usace/groundwork";
import type { Script } from "../scripts-manager/types";
import { savedCommandPreview, supportsScriptVersion } from "./commandArguments";
import { ScriptVersionNotice } from "./ScriptVersionNotice";
import { ArgumentValues } from "./CommandSummary";

export const RoleList = ({ roles }: { roles: string[] }) => {
  if (roles.length) {
    return (
      <ul>
        {roles.map((role) => (
          <li key={role}>{role}</li>
        ))}
      </ul>
    );
  } else {
    return "No additional CDA role required. Office access is required.";
  }
};

function scriptSource(script: Script): string {
  if ((script.configVersion ?? 1) === 1) return "District GitHub repository (historical)";
  if (script.executionType === "command") return "Installed command";
  return "District GitHub repository";
}

function scriptRuntime(script: Script) {
  if ((script.configVersion ?? 1) === 1) return "Python (historical)";
  if (script.commandMode === "shell") return "Bash command";
  if (script.executionType === "command") return script.repoPath;
  return script.runtime;
}

interface ScriptViewProps {
  script?: Script;
  onEdit: () => void;
}

function scheduleDescription(script: Script): string {
  if (!script.scheduleEnabled) return "Disabled";
  if (script.scheduleType === "hourly") return `Every hour at minute ${script.scheduleMinute}`;
  return script.scheduleCron || "Not configured";
}

export const ScriptView = ({ script, onEdit }: ScriptViewProps) => {
  if (script) {
    return (
      <div className="flex flex-col gap-y-6">
        <ScriptVersionNotice version={script.configVersion ?? 1} />
        <div className="flex flex-col gap-2">
          <ViewField label="Id">{script.id}</ViewField>
          <ViewField label="Name">{script.name}</ViewField>
          <ViewField label="Slug">{script.slug}</ViewField>
          <ViewField label="Description">{script.description}</ViewField>
          <ViewField
            label={
              script.executionType === "command"
                ? "Executable"
                : "GitHub Repo Path"
            }
          >
            <span className="block [overflow-wrap:anywhere]">{script.repoPath}</span>
          </ViewField>
          <ViewField label="Source">
            {scriptSource(script)}
          </ViewField>
          <ViewField label="Runtime">
            {scriptRuntime(script)}
          </ViewField>
          <ViewField label={`Command (version ${script.configVersion ?? 1})`}>
            <pre className="whitespace-pre-wrap">
              {savedCommandPreview(script)}
            </pre>
          </ViewField>
          {[2, 3].includes(script.configVersion ?? 1) && script.commandMode !== "shell" && <ViewField label="Arguments">
            <ArgumentValues args={script.commandArgs ?? []} />
          </ViewField>}
          <ViewField label="Schedule">
            {scheduleDescription(script)}
          </ViewField>
          <ViewField label="Timezone">
            {script.scheduleTimezone ?? "UTC"}
          </ViewField>
          {script.scheduleUpdatedName && <ViewField label="Schedule configured by">{script.scheduleUpdatedName}</ViewField>}
          {script.scheduleError && <p role="alert" className="text-amber-900">{script.scheduleError}</p>}
          <ViewField label="Roles">
            <RoleList roles={script.roles} />
          </ViewField>
          <ViewField label="Active">
            {script.active ? "true" : "false"}
          </ViewField>
          <ViewField label="Created At">
            {dayjs(script.createdTime).toString()}
          </ViewField>
          <ViewField label="Last Update">
            {dayjs(script.updatedTime).toString()}
          </ViewField>
        </div>
        <div className="w-full flex justify-end">
          <Button disabled={!supportsScriptVersion(script.configVersion ?? 1)} onClick={onEdit}>Edit</Button>
        </div>
      </div>
    );
  } else {
    return <Text>No script has been selected.</Text>;
  }
};
