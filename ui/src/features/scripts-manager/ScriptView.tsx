import dayjs from "dayjs";
import { ViewField } from "./ViewField";
import { Button, Text } from "@usace/groundwork";
import type { Script } from "../scripts-manager/types";
import { commandPreview } from "./commandArguments";

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

interface ScriptViewProps {
  script?: Script;
  onEdit: () => void;
}

export const ScriptView = ({ script, onEdit }: ScriptViewProps) => {
  if (script) {
    return (
      <div className="flex flex-col gap-y-6">
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
            {script.executionType === "command"
              ? "Installed command"
              : "District GitHub repository"}
          </ViewField>
          <ViewField label="Runtime">
            {script.executionType === "command"
              ? script.repoPath
              : script.runtime}
          </ViewField>
          <ViewField label={`Command (version ${script.configVersion ?? 1})`}>
            <pre className="whitespace-pre-wrap">
              {script.commandMode === "shell" ? script.shellCommand : commandPreview(script)}
            </pre>
          </ViewField>
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
          <Button onClick={onEdit}>Edit</Button>
        </div>
      </div>
    );
  } else {
    return <Text>No script has been selected.</Text>;
  }
};
