import { RequiredRoles } from "./RequiredRoles";
import dayjs from "dayjs";
import { ScheduleTiming } from "./ScheduleTiming";
import { ViewField } from "./ViewField";
import { Text } from "@usace/groundwork";
import type { Script } from "../scripts-manager/types";
import { savedCommandPreview } from "./commandArguments";
import { ArgumentValues } from "./CommandSummary";
import { ScriptSections, ConfigSection } from "./ScriptSections";
import type { ScriptSection } from "./configurationSections";
import { UpgradeConfiguration } from "./UpgradeConfiguration";
import { schedulePreset } from "./schedulePresets";
import { ScheduleToggle } from "./ScheduleToggle";

function scriptSource(script: Script): string {
  if (script.releaseJar) return `GitHub Release ${script.releaseJar.tag} · ${script.releaseJar.repository}`;
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
  section: ScriptSection;
  onSectionChange: (section: ScriptSection) => void;
  isPending: boolean;
  onScheduleToggle: (enabled: boolean) => void | Promise<void>;
}

function scheduleDescription(script: Script): string {
  if (!script.scheduleEnabled) return "Disabled";
  if (script.scheduleType === "hourly") return `Every hour at minute ${script.scheduleMinute}`;
  const preset = schedulePreset(script);
  const [minute, hour, day] = (script.scheduleCron ?? "").trim().split(/\s+/);
  if (preset === "daily") return `Every day at ${hour.padStart(2, "0")}:${minute.padStart(2, "0")}`;
  if (preset === "monthly") return `Every month on day ${day} at ${hour.padStart(2, "0")}:${minute.padStart(2, "0")}`;
  return script.scheduleCron || "Not configured";
}

const resourceProfiles = {
  small: { label: "Small", cpu: "0.5 vCPU", memory: "1 GiB" },
  medium: { label: "Medium", cpu: "1 vCPU", memory: "2 GiB" },
  large: { label: "Large", cpu: "2 vCPU", memory: "4 GiB" },
} as const;

export const ScriptView = ({ script, section, onSectionChange, isPending, onScheduleToggle }: ScriptViewProps) => {
  if (script) {
    return (
      <div className="flex flex-col gap-y-6">
        <ScriptSections active={section} onSelect={onSectionChange} footer={<ScheduleToggle enabled={script.scheduleEnabled} disabled={isPending} onToggle={onScheduleToggle} />}>
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
            <span tabIndex={0} aria-label="Job path" className="block overflow-x-auto whitespace-nowrap rounded bg-slate-50 p-2 font-mono">{script.repoPath}</span>
          </ViewField>
          <ViewField label="Source">
            {scriptSource(script)}
          </ViewField>
          <ViewField label="Runtime">
            {scriptRuntime(script)}
          </ViewField>

          <ViewField label="Command">
            <pre tabIndex={0} className="overflow-x-auto whitespace-pre rounded bg-slate-50 p-2">
              {savedCommandPreview(script)}
            </pre>
          </ViewField>
          {[2, 3, 4].includes(script.configVersion ?? 1) && script.commandMode !== "shell" && <ViewField label="Arguments">
            <ArgumentValues args={script.commandArgs ?? []} />
          </ViewField>}
          </ConfigSection>
          <ConfigSection id="environment" active={section}>
            <div className="space-y-3">
              <p className="text-sm text-slate-600">
                These values are passed to every run of this job. Do not use this
                section for passwords, API keys, or other secret values.
              </p>
              {(script.environmentVariables ?? []).length > 0 ? (
                <div className="overflow-hidden rounded-lg border border-slate-200">
                  <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-4 bg-slate-50 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-600">
                    <span>Name</span>
                    <span>Value</span>
                  </div>
                  <div className="divide-y divide-slate-200">
                    {(script.environmentVariables ?? []).map((variable, index) => (
                      <div key={`${variable.name}-${index}`} className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-4 px-4 py-3">
                        <code className="min-w-0 break-all font-semibold text-slate-900">{variable.name}</code>
                        <code className="min-w-0 break-all text-slate-700">{variable.value}</code>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-600">
                  No environment variables are configured for this job.
                </div>
              )}
            </div>
          </ConfigSection>
          <ConfigSection id="resources" active={section}>
            {script.resourceSize && resourceProfiles[script.resourceSize] ? (
              <div className="rounded-xl border-2 border-blue-200 bg-blue-50 p-5 text-blue-950">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold uppercase tracking-wide text-blue-700">Selected task size</p>
                    <h4 className="mt-1 text-2xl font-bold">{resourceProfiles[script.resourceSize].label}</h4>
                  </div>
                  <span className="rounded-full bg-white px-3 py-1 text-sm font-semibold text-blue-800 shadow-sm">Fixed platform profile</span>
                </div>
                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-lg bg-white p-4 shadow-sm">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">CPU</p>
                    <p className="mt-1 text-lg font-semibold text-slate-900">{resourceProfiles[script.resourceSize].cpu}</p>
                  </div>
                  <div className="rounded-lg bg-white p-4 shadow-sm">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Memory</p>
                    <p className="mt-1 text-lg font-semibold text-slate-900">{resourceProfiles[script.resourceSize].memory}</p>
                  </div>
                </div>
                <p className="mt-4 text-sm text-blue-900">Applied to manual and automatic runs.</p>
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-600">
                No task size is configured for this job.
              </div>
            )}
          </ConfigSection>
          <ConfigSection id="schedule" active={section}>
          {script && <ScheduleTiming script={script} enabled={section === "schedule"} />}
          {(script.configVersion ?? 1) < 4 && <p>Upgrade configuration to version 4 to configure a schedule.</p>}
          <ViewField label="Schedule">
            <span className={schedulePreset(script) === "cron" ? "font-mono" : ""}>{scheduleDescription(script)}</span>
          </ViewField>
          <ViewField label="Timezone">
            {script.scheduleTimezone ?? "UTC"}
          </ViewField>
          {script.scheduleUpdatedName && <ViewField label="Schedule configured by">{script.scheduleUpdatedName}</ViewField>}
          {script.scheduleError && <p role="alert" className="text-amber-900">{script.scheduleError}</p>}
          </ConfigSection>
          <ConfigSection id="access" active={section}>
            <RequiredRoles office={script.office} roles={script.roles} />
          </ConfigSection>
          <ConfigSection id="upgrade" active={section}><UpgradeConfiguration key={script.id} script={script} /></ConfigSection>
        </div>
        </ScriptSections>
      </div>
    );
  } else {
    return <Text>No job has been selected.</Text>;
  }
};
