import { Button, Modal, Text } from "@usace/groundwork";
import { useMemo, useState } from "react";
import type { Script } from "./types";
import fetchWithAuth from "../../utils/fetchWithAuth";
import { useAuth } from "@usace-watermanagement/groundwork-water";
import type { TransferPackage } from "./configurationTransferApi";

type ScriptWithConfigurationKey = Script & { configurationKey?: string };

const fieldLabels: Record<string, string> = {
  configVersion: "Configuration version",
  name: "Name",
  description: "Description",
  repoPath: "Path or executable",
  executionType: "Source type",
  runtime: "Runtime",
  commandArgs: "Arguments",
  commandPlaceholder: "Command placeholder",
  commandMode: "Command mode",
  shellCommand: "Shell command",
  releaseJar: "Release JAR",
  environmentVariables: "Environment variables",
  resourceSize: "Task size",
  active: "Active",
  roles: "Required roles",
  scheduleEnabled: "Automatic run",
  scheduleType: "Schedule type",
  scheduleMinute: "Schedule minute",
  scheduleCron: "Schedule expression",
  scheduleTimezone: "Schedule timezone",
};

const displayValue = (value: unknown) => JSON.stringify(value) ?? "null";


interface ConfigurationImportProps {
  office: string;
  scripts: Script[];
  opened: boolean;
  onClose: () => void;
  onImported: (scriptId: string) => void;
}

export function ConfigurationImport({ office, scripts, opened, onClose, onImported }: ConfigurationImportProps) {
  const auth = useAuth();
  const [packageData, setPackageData] = useState<TransferPackage | null>(null);
  const [selections, setSelections] = useState<Record<string, "existing" | "imported">>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const existing = useMemo(() => packageData && scripts.find(script => (script as ScriptWithConfigurationKey).configurationKey === packageData.configurationKey), [packageData, scripts]);

  const readFile = async (file: File) => {
    setError(null);
    try {
      const parsed = JSON.parse(await file.text()) as TransferPackage;
      if (parsed.schemaVersion !== 1 || !parsed.configurationKey || !parsed.configuration) throw new Error("This is not a supported script configuration file.");
      setPackageData(parsed);
      setSelections({});
    } catch (caught) {
      setPackageData(null);
      setError(caught instanceof Error ? caught.message : "The configuration file could not be read.");
    }
  };

  const apply = async () => {
    if (!packageData) return;
    setPending(true);
    setError(null);
    try {
      const response = await fetchWithAuth("/api/scripts/configuration-import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetOffice: office, package: packageData, selections }),
      }, auth.token);
      const imported = await response.json() as Script;
      onImported(imported.id);
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The configuration could not be restored.");
    } finally {
      setPending(false);
    }
  };

  return <Modal opened={opened} onClose={onClose} dialogTitle={`Restore configuration · ${office.toUpperCase()}`} size="3xl">
    <div className="space-y-4 p-2">
      <input aria-label="Configuration JSON file" type="file" accept="application/json,.json" onChange={event => {
        const file = event.target.files?.[0];
        if (file) void readFile(file);
      }} />
      {error && <p role="alert" className="rounded border border-red-500 bg-red-50 p-3 text-red-800">{error}</p>}
      {packageData && <>
        <Text>Source office: {packageData.sourceOffice}. This will restore into {office.toUpperCase()}.</Text>
        <Text>{existing ? `A matching configuration was found: ${existing.name}. Choose which value to keep for each field.` : "No matching configuration was found. Review the imported values before creating it."}</Text>
        {existing && <div className="max-h-96 space-y-2 overflow-auto rounded border p-3">
          {Object.entries(packageData.configuration).map(([field, importedValue]) => <div key={field} className="grid gap-2 border-b pb-2 last:border-b-0 sm:grid-cols-[12rem_1fr]">
            <span className="font-semibold">{fieldLabels[field] ?? field}</span>
            <div className="space-y-1 text-sm">
              <label className="block"><input type="radio" name={`choice-${field}`} checked={selections[field] !== "existing"} onChange={() => setSelections(previous => ({ ...previous, [field]: "imported" }))} /> Imported: <code>{displayValue(importedValue)}</code></label>
              <label className="block"><input type="radio" name={`choice-${field}`} checked={selections[field] === "existing"} onChange={() => setSelections(previous => ({ ...previous, [field]: "existing" }))} /> Existing: <code>{displayValue((existing as unknown as Record<string, unknown>)[field])}</code></label>
            </div>
          </div>)}
        </div>}
        <div className="flex justify-end gap-3">
          <Button type="button" onClick={onClose}>Cancel</Button>
          <Button type="button" disabled={pending} onClick={() => void apply()}>{pending ? "Restoring…" : existing ? "Apply selected values" : "Create configuration"}</Button>
        </div>
      </>}
    </div>
  </Modal>;
}
