import dayjs from "dayjs";
import { ViewField } from "./ViewField";
import {
  Button,
  DeleteConfirm,
  Field,
  Fieldset,
  Input,
  Label,
  Text,
} from "@usace/groundwork";
import type { Script, ScriptFormData } from "../scripts-manager/types";
import { MdErrorOutline } from "react-icons/md";
import { useState } from "react";
import { RoleMultiSelect } from "./RoleMultiSelect";
import { allRoles } from "./utils";
import { RepositoryPathPicker } from "./RepositoryPathPicker";
import { FieldHelp } from "./FieldHelp";
import { Link } from "@tanstack/react-router";

const fieldHelp: Record<string, React.ReactNode> = {
  name: "A descriptive name for this job. Its slug is generated from the name when you create it.",
  description: "Describe what this job does and when someone should run it.",
  repoPath: <>Enter a path relative to /jobs. Repository files are checked out there. With the Java artifact loader deployed, enabled pins in java/artifacts.json download release JARs into java-artifacts/ before the job runs. Enter those generated paths manually; Browse lists only files committed to GitHub. Files and directories cannot be created here. <Link to="/help/script-files" target="_blank" rel="noopener noreferrer">Script setup (new tab)</Link>. For an installed command, enter its executable; that mode skips checkout and artifact downloads.</>,
  executionType: (
    <div className="space-y-4">
      <section className="space-y-2">
        <h3 className="font-semibold">District GitHub repository</h3>
        <p>Downloads the selected office’s repository before running a Python file, Bash script, or Java JAR. Paths are relative to <code>/jobs</code>. Enabled Java artifact pins also download their release JARs.</p>
        <div className="space-y-2 rounded-md border border-blue-200 bg-blue-50 p-3 text-blue-950">
          <p className="font-semibold">Example: SWT Java release</p>
          <p>Runtime: <strong>Java JAR</strong><br />JAR Path:</p>
          <code className="block break-all font-mono">java-artifacts/BuildWSmetadataViaCDA.jar</code>
          <p>Enter this generated path manually. Browse shows files committed to GitHub.</p>
        </div>
      </section>
      <section className="space-y-2">
        <h3 className="font-semibold">Installed command</h3>
        <p>Runs an executable already available in the container, such as <code>cwmscli</code>, <code>java</code>, or <code>bash</code>. Skips repository checkout, artifact downloads, and district dependency installation.</p>
        <div className="space-y-2 rounded-md border border-blue-200 bg-blue-50 p-3 text-blue-950">
          <p className="font-semibold">Example: JAR already in the container</p>
          <p>Executable: <code className="font-mono font-semibold">java</code><br />Arguments (one per line):</p>
          <pre className="whitespace-pre-wrap break-all rounded bg-white p-2 font-mono text-blue-950"><code>{"-jar\n/opt/reports/report.jar"}</code></pre>
          <p>Replace this example path with an existing JAR in the image or a mounted directory. Use the repository source for SWT’s downloaded release JAR.</p>
        </div>
      </section>
      <p>Arguments are passed literally. To run shell operations such as <code>&amp;&amp;</code>, use <code>bash</code> with <code>-c</code> on the first argument line and the complete shell command on the next.</p>
    </div>
  ),
  runtime: "Choose Python for .py files, Bash for .sh files, or Java JAR for a built .jar file. The runtime determines how the file is invoked and the default browser filter.",
  commandArgs: "Enter one argument per line. Spaces within each line are preserved. For the installed java command, put -jar on one line and the JAR path on the next.",
  roles: "Select the roles permitted to run this script. Choose a role and click Add; use its remove button to remove access for that role.",
};

const slugify = (str: string) => {
  return str
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
};

const FormRow = ({ children }: React.PropsWithChildren) => {
  return <Field className="grid grid-cols-1 gap-2 sm:grid-cols-[120px_minmax(0,1fr)] sm:gap-6">{children}</Field>;
};

const InputLabel = ({
  htmlFor,
  children,
}: React.PropsWithChildren<{ htmlFor: string }>) => {
  return (
    <div className="flex items-center gap-2">
      <Label htmlFor={htmlFor}>{children}</Label>
      <FieldHelp label={typeof children === "string" ? children : "Script path"}>{fieldHelp[htmlFor]}</FieldHelp>
    </div>
  );
};

interface ScriptFormProps {
  office: string;
  script?: Script;
  isPending: boolean;
  mutationError: Error | null;
  onDelete: (scriptId: string) => void;
  onSave: (data: ScriptFormData) => void;
  onCancelEdit: () => void;
}

export const ScriptForm = ({
  office,
  script,
  isPending,
  mutationError,
  onDelete,
  onSave,
  onCancelEdit,
}: ScriptFormProps) => {
  const [form, setForm] = useState<ScriptFormData>({
    name: script?.name ?? "",
    description: script?.description ?? "",
    active: script?.active ?? true,
    repoPath: script?.repoPath ?? "",
    executionType: script?.executionType ?? "github_file",
    runtime: script?.runtime ?? "python",
    commandArgs: script?.commandArgs ?? [],
    roles: script?.roles ?? ["CWMS Users"],
  });

  const handleSubmit = () => onSave(form);

  const update = <K extends keyof typeof form>(
    key: K,
    value: (typeof form)[K],
  ) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <form
      className="script-form"
      onSubmit={(e) => {
        e.preventDefault();
        e.stopPropagation();
        handleSubmit();
      }}
    >
      <div className="script-form-layout flex flex-col gap-y-2">
        <div className="script-form-fields">
        <Fieldset disabled={isPending} className="flex min-w-0 flex-col gap-1">
          {script && <ViewField label="Id">{script.id}</ViewField>}
          <FormRow>
            <InputLabel htmlFor="name">Name</InputLabel>
            <Input
              id="name"
              name="name"
              value={form.name}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                update("name", e.target.value);
              }}
              required
            />
          </FormRow>
          {script && <ViewField label="Slug">{script.slug ?? slugify(form.name)}</ViewField>}
          <FormRow>
            <InputLabel htmlFor="description">Description</InputLabel>
            <Input
              id="description"
              name="description"
              value={form.description}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                update("description", e.target.value)
              }
            />
          </FormRow>
          <FormRow>
            <InputLabel htmlFor="repoPath">
              {form.executionType === "command"
                ? "Executable"
                : form.runtime === "java" ? "JAR Path" : "GitHub Repo Path"}
            </InputLabel>
            {form.executionType === "command" ? <Input
              id="repoPath"
              name="repoPath"
              value={form.repoPath}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                update("repoPath", e.target.value)
              }
              required
            /> : <RepositoryPathPicker
              key={`${office}:${form.runtime}`}
              office={office}
              runtime={form.runtime ?? "python"}
              value={form.repoPath}
              onChange={(path) => update("repoPath", path)}
            />}
          </FormRow>
          <FormRow>
            <InputLabel htmlFor="executionType">Source</InputLabel>
            <select
              id="executionType"
              value={form.executionType}
              onChange={(e) =>
                update(
                  "executionType",
                  e.target.value as "github_file" | "command",
                )
              }
              className="rounded border p-2"
            >
              <option value="github_file">District GitHub repository</option>
              <option value="command">Installed command</option>
            </select>
          </FormRow>
          {form.executionType !== "command" && (
            <FormRow>
              <InputLabel htmlFor="runtime">Runtime</InputLabel>
              <select
                id="runtime"
                value={form.runtime}
                onChange={(e) =>
                  update(
                    "runtime",
                    e.target.value as "python" | "java" | "shell",
                  )
                }
                className="rounded border p-2"
              >
                <option value="python">Python</option>
                <option value="java">Java JAR</option>
                <option value="shell">Bash</option>
              </select>
            </FormRow>
          )}
          <FormRow>
            <InputLabel htmlFor="commandArgs">Arguments</InputLabel>
            <div>
              <textarea
                id="commandArgs"
                className="w-full rounded border p-2"
                rows={2}
                value={(form.commandArgs ?? []).join("\n")}
                onChange={(e) =>
                  update(
                    "commandArgs",
                    e.target.value === "" ? [] : e.target.value.split("\n"),
                  )
                }
              />
            </div>
          </FormRow>
          <FormRow>
            <InputLabel htmlFor="roles">Roles</InputLabel>
            <RoleMultiSelect
              allRoles={allRoles}
              initialSelectedRoles={form.roles}
              onChange={(selectedRoles) => update("roles", selectedRoles)}
            />
          </FormRow>
          {script && (
            <>
              <ViewField label="Created At">
                {dayjs(script?.createdTime).toString()}
              </ViewField>
              <ViewField label="Last Update">
                {dayjs(script?.updatedTime).toString()}
              </ViewField>
            </>
          )}
        </Fieldset>
        {mutationError && (
          <div role="alert" className="mt-3 flex gap-2">
            <MdErrorOutline className="text-red-500 flex-none size-6" />
            <Text className="text-red-500">{mutationError.message}</Text>
          </div>
        )}
        </div>
        <div className="script-form-actions flex w-full flex-wrap items-center justify-between gap-3 bg-white">
          <div className="flex items-center gap-2">
            <label className={`flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 font-semibold ${form.active ? "border-green-600 bg-green-50 text-green-800" : "border-gray-300 bg-gray-100 text-gray-700"}`}>
              <input id="active" type="checkbox" checked={form.active} disabled={isPending}
                onChange={event => update("active", event.target.checked)} className="size-5 accent-green-700" />
              Active
            </label>
            <FieldHelp label="Active">Active scripts are available to run. Clear this option to keep the script definition while disabling it.</FieldHelp>
          </div>
          {script && <DeleteConfirm onDelete={() => onDelete(script?.id)} />}
          <div className="ml-auto flex justify-between gap-3">
            <Button type="submit" disabled={isPending}>
              Save
            </Button>
            <Button type="button" disabled={isPending} onClick={onCancelEdit}>
              Cancel
            </Button>
          </div>
        </div>
      </div>
    </form>
  );
};
