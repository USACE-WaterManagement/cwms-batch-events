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
import { ScriptSections, ConfigSection } from "./ScriptSections";
import { fieldSections, type ScriptSection } from "./configurationSections";
import { validateScriptForm } from "./validateScriptForm";
import { ApiError } from "../../utils/fetchWithAuth";
import { RoleMultiSelect } from "./RoleMultiSelect";
import { allRoles } from "./utils";
import { RepositoryPathPicker } from "./RepositoryPathPicker";
import { FieldHelp } from "./FieldHelp";
import { Link } from "@tanstack/react-router";
import { CommandSettings } from "./CommandSettings";
import { CURRENT_SCRIPT_VERSION, supportsScriptVersion } from "./commandArguments";
import { ScriptVersionNotice } from "./ScriptVersionNotice";

const fieldHelp: Record<string, React.ReactNode> = {
  scheduleType: "Batch Events queues enabled schedules automatically while the API is running. Disable any equivalent Airflow or legacy trigger before enabling this schedule.",
  scheduleMinute: "Minute of each hour, from 0 through 59, in the selected timezone.",
  scheduleCron: "Five numeric fields: minute, hour, day of month, month, and day of week. Supports lists, ranges, and steps.",
  scheduleTimezone: "An IANA timezone such as America/Chicago. Missing daylight-saving times are skipped and repeated times run once.",
  name: "A descriptive name for this job. Its slug is generated from the name when you create it.",
  description: "Describe what this job does and when someone should run it.",
  repoPath: <>Enter a path relative to /jobs. Repository files are checked out there. With the Java artifact loader deployed, enabled pins in java/artifacts.json download release JARs into java-artifacts/ before the job runs. Enter those generated paths manually; Browse lists only files committed to GitHub. Files and directories cannot be created here. <Link to="/help/script-files" target="_blank" rel="noopener noreferrer">Script setup (new tab)</Link>. For an installed command, enter its executable; that mode skips checkout and artifact downloads.</>,
  executionType: (
    <div className="space-y-4">
      <section className="space-y-2">
        <h3 className="font-semibold">District GitHub repository</h3>
        <p>Downloads the selected officeâ€™s repository before running a Python file, Bash script, or Java JAR. Paths are relative to <code>/jobs</code>. Enabled Java artifact pins also download their release JARs.</p>
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
          <p>Executable: <code className="font-mono font-semibold">java</code><br />Arguments:</p>
          <pre className="whitespace-pre-wrap break-all rounded bg-white p-2 font-mono text-blue-950"><code>-jar /opt/reports/report.jar</code></pre>
          <p>Replace this example path with an existing JAR in the image or a mounted directory. Use the repository source for SWTâ€™s downloaded release JAR.</p>
        </div>
      </section>
      <p>Quote arguments that contain spaces. For shell operations such as <code>&amp;&amp;</code> or <code>||</code>, select Bash command mode and enter the complete command.</p>
    </div>
  ),
  runtime: "Choose Python for .py files, Bash for .sh files, or Java JAR for a built .jar file. The runtime determines how the file is invoked and the default browser filter.",
  roles: "Optional. Leave empty to let users with office access run this script without an additional CDA role. Select roles to restrict execution to users with at least one of those roles in this office. These roles do not grant the script CDA credentials.",
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

function scriptPathLabel(form: ScriptFormData): string {
  if (form.executionType === "command") return "Executable";
  if (form.runtime === "java") return "JAR Path";
  return "GitHub Repo Path";
}

function editableVersion(script?: Script): 2 | 3 | 4 {
  if (script?.configVersion === 2) return 2;
  if (script?.configVersion === 3) return 3;
  return CURRENT_SCRIPT_VERSION;
}

interface ScriptFormProps {
  office: string;
  script?: Script;
  isPending: boolean;
  mutationError: Error | null;
  onDelete: (scriptId: string) => void;
  onSave: (data: ScriptFormData) => void | Promise<void>;
  onValidationChange?: (invalid: boolean) => void;
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
  onValidationChange,
}: ScriptFormProps) => {
  const [form, setForm] = useState<ScriptFormData>({
    configVersion: editableVersion(script),
    name: script?.name ?? "",
    description: script?.description ?? "",
    active: script?.active ?? true,
    repoPath: script?.repoPath ?? "",
    executionType: script?.executionType === "command" ? "command" : "github_file",
    runtime: script?.runtime === "java" || script?.runtime === "shell" ? script.runtime : "python",
    commandArgs: script?.commandArgs ?? [],
    commandMode: script?.commandMode === "shell" ? "shell" : "arguments",
    shellCommand: script?.shellCommand ?? null,
    roles: script?.roles ?? [],
    scheduleEnabled: script?.scheduleEnabled ?? false,
    scheduleType: script?.scheduleType ?? "manual",
    scheduleMinute: script?.scheduleMinute ?? 0,
    scheduleCron: script?.scheduleCron ?? "",
    scheduleTimezone: script?.scheduleTimezone ?? "UTC",
  });

  const [section, setSection] = useState<ScriptSection>("general");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);
  const showErrors = (next: Record<string, string>) => {
    setErrors(next);
    onValidationChange?.(Object.keys(next).length > 0);
    const first = Object.keys(next)[0];
    if (first) {
      setSection(fieldSections[first] ?? "general");
      requestAnimationFrame(() => document.getElementById(first)?.focus());
    }
  };
  const handleSubmit = async () => {
    setSubmitted(true);
    const next = validateScriptForm(form);
    showErrors(next);
    if (Object.keys(next).length) return;
    try { await onSave({ ...form, repoPath: form.repoPath.trim() }); }
    catch (error) {
      if (error instanceof ApiError && error.fields) showErrors(error.fields);
    }
  };
  const validation = (field: string) => ({
    invalid: Boolean(errors[field]),
    "aria-invalid": Boolean(errors[field]),
    "aria-describedby": errors[field] ? `${field}-error` : undefined,
    className: errors[field] ? "rounded border-2 border-red-600 bg-red-50 p-2" : "rounded border p-2",
  });
  const errorFor = (field: string) => errors[field] && <p id={`${field}-error`} className="text-sm text-red-800">{errors[field]}</p>;
  const changeForm = (next: ScriptFormData) => {
    setForm(next);
    if (submitted) {
      const nextErrors = validateScriptForm(next);
      setErrors(nextErrors);
      onValidationChange?.(Object.keys(nextErrors).length > 0);
    }
  };

  const update = <K extends keyof typeof form>(
    key: K,
    value: (typeof form)[K],
  ) => {
    changeForm({ ...form, [key]: value });
  };

  if (script && ((script.configVersion ?? 1) === 1 || !supportsScriptVersion(script.configVersion ?? 1))) return <div className="space-y-4 p-4">
    <ScriptVersionNotice version={script.configVersion ?? 1} />
    <Button type="button" onClick={onCancelEdit}>Cancel</Button>
  </div>;

  return (
    <form
      className="script-form @container/script-panel" noValidate
      onSubmit={(e) => {
        e.preventDefault();
        e.stopPropagation();
        void handleSubmit();
      }}
    >
      <div className="script-form-layout flex flex-col gap-y-2">
        {Object.keys(errors).length > 0 && <div role="alert" className="rounded border border-red-500 bg-red-50 p-3 text-sm text-red-800">Review the highlighted sections and fields before saving.</div>}
        <div className="script-form-fields">
        <ScriptSections active={section} onSelect={setSection} errors={errors}>
        <Fieldset disabled={isPending} className="flex min-w-0 flex-col gap-1">
          <ConfigSection id="general" active={section}>
          {script && <ViewField label="Id">{script.id}</ViewField>}
          <FormRow>
            <InputLabel htmlFor="name">Name</InputLabel>
            <Input
              id="name" {...validation("name")}
              name="name"
              value={form.name}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                update("name", e.target.value);
              }}
              required
            />
          </FormRow>
          {errorFor("name")}
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
          </ConfigSection>
          <ConfigSection id="source" active={section}>
          {form.commandMode !== "shell" && <FormRow>
            <InputLabel htmlFor="repoPath">
              {scriptPathLabel(form)}
            </InputLabel>
            {form.executionType === "command" ? <Input
              id="repoPath" {...validation("repoPath")}
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
              error={errors.repoPath}
              value={form.repoPath}
              onChange={(path) => update("repoPath", path)}
            />}
          </FormRow>}
          {errorFor("repoPath")}
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
          {form.commandMode !== "shell" && form.executionType !== "command" && (
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
          </ConfigSection>
          <ConfigSection id="arguments" active={section}>
          <div className="my-3 rounded-lg border border-gray-300 bg-white p-3">
            <CommandSettings value={form} onChange={changeForm} disabled={isPending} />
          </div>
          {errorFor("commandMode")}{errorFor("shellCommand")}{errorFor("commandArgs")}
          </ConfigSection>
          <ConfigSection id="schedule" active={section}>
          {(form.configVersion ?? 1) < 4 && <p className="rounded border border-blue-300 bg-blue-50 p-3 text-sm">Scheduling requires version 4. Cancel editing and choose Upgrade configuration in Details.</p>}
          {errorFor("scheduleType")}
          <fieldset disabled={(form.configVersion ?? 1) < 4} className="space-y-4">
          <FormRow>
            <InputLabel htmlFor="scheduleType">Schedule</InputLabel>
            <select
              id="scheduleType"
              className="rounded border p-2"
              value={form.scheduleType}
              onChange={(e) => {
                changeForm({ ...form, scheduleType: e.target.value, scheduleEnabled: e.target.value === "manual" ? false : form.scheduleEnabled });
              }}
            >
              <option value="manual">Manual only</option>
              <option value="hourly">Every hour</option>
              <option value="cron">Cron expression</option>
            </select>
          </FormRow>
          {form.scheduleType !== "manual" && (
            <>
              {form.scheduleType === "hourly" ? (
                <FormRow>
                  <InputLabel htmlFor="scheduleMinute">Minute</InputLabel>
                  <Input
                    id="scheduleMinute" {...validation("scheduleMinute")}
                    type="number"
                    min={0}
                    max={59}
                    required
                    value={form.scheduleMinute ?? ""}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      update(
                        "scheduleMinute",
                        e.target.value === "" ? null : Number(e.target.value),
                      )
                    }
                  />
                </FormRow>
              ) : (
                <FormRow>
                  <InputLabel htmlFor="scheduleCron">
                    Cron expression
                  </InputLabel>
                  <div>
                    <Input
                      id="scheduleCron" {...validation("scheduleCron")}
                      required
                      value={form.scheduleCron ?? ""}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                        update("scheduleCron", e.target.value)
                      }
                    />
                    {errorFor("scheduleCron")}
                    <Text>
                      Minute, hour, day of month, month, day of week. For
                      example: 0 8 * * 1-5.
                    </Text>
                  </div>
                </FormRow>
              )}
              {errorFor("scheduleMinute")}
              <FormRow>
                <InputLabel htmlFor="scheduleTimezone">Timezone</InputLabel>
                <div>
                  <Input
                    id="scheduleTimezone" {...validation("scheduleTimezone")}
                    required
                    list="schedule-timezones"
                    value={form.scheduleTimezone}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      update("scheduleTimezone", e.target.value)
                    }
                  />
                  <datalist id="schedule-timezones">
                    {[
                      "UTC",
                      "America/New_York",
                      "America/Chicago",
                      "America/Denver",
                      "America/Los_Angeles",
                      "America/Anchorage",
                      "Pacific/Honolulu",
                    ].map((zone) => (
                      <option key={zone} value={zone} />
                    ))}
                  </datalist>
                  <Text>
                    Use an IANA timezone. Missing daylight-saving times are
                    skipped; repeated times run once.
                  </Text>
                </div>
              </FormRow>
          {errorFor("scheduleTimezone")}
              <label htmlFor="scheduleEnabled" className={`flex cursor-pointer items-start gap-3 rounded-lg border p-4 ${form.scheduleEnabled ? "border-blue-200 bg-blue-50" : "border-slate-200 bg-slate-50"}`}>
                <input
                  id="scheduleEnabled"
                  aria-label="Enable schedule"
                  type="checkbox"
                  className="mt-0.5 size-5 shrink-0 cursor-pointer accent-blue-700"
                  checked={form.scheduleEnabled}
                  onChange={(e) => update("scheduleEnabled", e.target.checked)}
                />
                <span><span className="block text-sm font-semibold text-slate-900">Enable schedule</span>
                  <span className="mt-1 block text-sm leading-relaxed text-slate-600">Queue this script automatically at the times above.</span></span>
              </label>
            </>
          )}
          </fieldset>
          </ConfigSection>
          <ConfigSection id="access" active={section}>
          <FormRow>
            <InputLabel htmlFor="roles">Roles (optional)</InputLabel>
            <RoleMultiSelect
              allRoles={allRoles}
              initialSelectedRoles={form.roles}
              onChange={(selectedRoles) => update("roles", selectedRoles)}
            />
          </FormRow>
          </ConfigSection>
        </Fieldset>
        </ScriptSections>
        {mutationError && (
          <div role="alert" className="mt-3 flex gap-2">
            <MdErrorOutline className="text-red-500 flex-none size-6" />
            <Text className="text-red-500">{mutationError.message}</Text>
          </div>
        )}
        </div>
        <div className="script-form-actions mt-4 flex w-full flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
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
