import dayjs from "dayjs";
import { ViewField } from "./ViewField";
import { Button, Text } from "@usace/groundwork";
import type { Script } from "../scripts-manager/types";
import { savedCommandPreview, supportsScriptVersion } from "./commandArguments";
import { ScriptVersionNotice } from "./ScriptVersionNotice";
import { ArgumentValues } from "./CommandSummary";
import { useState } from "react";
import { ScriptSections, ConfigSection } from "./ScriptSections";
import type { ScriptSection } from "./configurationSections";
import { UpgradeConfiguration } from "./UpgradeConfiguration";

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
  const [section, setSection] = useState<ScriptSection>("general");
  if (script) {
    return (
      <div className="flex flex-col gap-y-6">
        <ScriptVersionNotice version={script.configVersion ?? 1} />
        <UpgradeConfiguration key={script.id} script={script} />
        <ScriptSections active={section} onSelect={setSection}>
        <div className="flex flex-col gap-2">
          <ConfigSection id="general" active={section}>
          <ViewField label="Id">{script.id}</ViewField>
          <ViewField label="Name">{script.name}</ViewField>
          <ViewField label="Slug">{script.slug}</ViewField>
          <ViewField label="Description">{script.description}</ViewField>
          <ViewField label="Active">{script.active ? "Yes" : "No"}</ViewField>
          <ViewField label="Created At">{dayjs(script.createdTime).toString()}</ViewField>
          <ViewField label="Last Update">{dayjs(script.updatedTime).toString()}</ViewField>
          </ConfigSection>
          <ConfigSection id="source" active={section}>
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
          </ConfigSection>
          <ConfigSection id="arguments" active={section}>
          <ViewField label={`Command (version ${script.configVersion ?? 1})`}>
            <pre className="whitespace-pre-wrap">
              {savedCommandPreview(script)}
            </pre>
          </ViewField>
          {[2, 3, 4].includes(script.configVersion ?? 1) && script.commandMode !== "shell" && <ViewField label="Arguments">
            <ArgumentValues args={script.commandArgs ?? []} />
          </ViewField>}
          </ConfigSection>
          <ConfigSection id="schedule" active={section}>
          {(script.configVersion ?? 1) < 4 && <p>Upgrade configuration to version 4 to configure a schedule.</p>}
          <ViewField label="Schedule">
            {scheduleDescription(script)}
          </ViewField>
          <ViewField label="Timezone">
            {script.scheduleTimezone ?? "UTC"}
          </ViewField>
          {script.scheduleUpdatedName && <ViewField label="Schedule configured by">{script.scheduleUpdatedName}</ViewField>}
          {script.scheduleError && <p role="alert" className="text-amber-900">{script.scheduleError}</p>}
          </ConfigSection>
          <ConfigSection id="access" active={section}>
          <ViewField label="Roles">
            <RoleList roles={script.roles} />
          </ViewField>
          </ConfigSection>
        </div>
        </ScriptSections>
        <div className="w-full flex justify-end">
          <Button disabled={(script.configVersion ?? 1) === 1 || !supportsScriptVersion(script.configVersion ?? 1)} onClick={onEdit}>Edit</Button>
        </div>
      </div>
    );
  } else {
    return <Text>No script has been selected.</Text>;
  }
};
