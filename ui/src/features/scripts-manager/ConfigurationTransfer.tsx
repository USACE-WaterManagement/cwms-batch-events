import { Button, Modal } from "@usace/groundwork";
import { useCallback, useMemo, useRef, useState } from "react";
import type { Script } from "./types";
import fetchWithAuth from "../../utils/fetchWithAuth";
import { useAuth } from "@usace-watermanagement/groundwork-water";
import type { TransferPackage } from "./configurationTransferApi";

type ScriptWithConfigurationKey = Script & { configurationKey?: string };
type ImportMode = "new" | "update";

const fieldLabels: Record<string, string> = {
  configVersion: "Configuration version", name: "Name", description: "Description",
  repoPath: "Path or executable", executionType: "Source type", runtime: "Runtime",
  commandArgs: "Arguments", commandPlaceholder: "Command placeholder", commandMode: "Command mode",
  shellCommand: "Shell command", releaseJar: "Release JAR", environmentVariables: "Environment variables",
  resourceSize: "Task size", active: "Active", roles: "Required roles", scheduleEnabled: "Automatic run",
  scheduleType: "Schedule type", scheduleMinute: "Schedule minute", scheduleCron: "Schedule expression",
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
  const [fileName, setFileName] = useState("");
  const [newName, setNewName] = useState("");
  const [selections, setSelections] = useState<Record<string, "existing" | "imported">>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [reviewValues, setReviewValues] = useState(false);
  const [mode, setMode] = useState<ImportMode>("new");
  const [choiceMade, setChoiceMade] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const existing = useMemo(() => packageData && scripts.find(script => (script as ScriptWithConfigurationKey).configurationKey === packageData.configurationKey), [packageData, scripts]);
  const valueCount = packageData ? Object.keys(packageData.configuration).length : 0;

  const reset = useCallback(() => {
    setPackageData(null);
    setFileName("");
    setNewName("");
    setSelections({});
    setError(null);
    setPending(false);
    setDragActive(false);
    setReviewValues(false);
    setMode("new");
    setChoiceMade(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  const close = useCallback(() => {
    reset();
    onClose();
  }, [onClose, reset]);

  const readFile = async (file: File) => {
    setError(null);
    try {
      const parsed = JSON.parse(await file.text()) as TransferPackage;
      if (parsed.schemaVersion !== 1 || !parsed.configurationKey || !parsed.configuration) throw new Error("This is not a supported script configuration file.");
      setPackageData(parsed);
      setFileName(file.name);
      setNewName(typeof parsed.configuration.name === "string" ? parsed.configuration.name : "");
      setSelections({});
      setReviewValues(false);
      setMode("new");
      setChoiceMade(false);
      setDragActive(false);
    } catch (caught) {
      setPackageData(null);
      setFileName("");
      setError(caught instanceof Error ? caught.message : "The configuration file could not be read.");
      setDragActive(false);
    }
  };

  const apply = async () => {
    if (!packageData) return;
    setPending(true);
    setError(null);
    try {
      const importPackage = existing && mode === "new" ? {
        ...packageData,
        configuration: { ...packageData.configuration, name: newName.trim() },
      } : packageData;
      const response = await fetchWithAuth("/api/scripts/configuration-import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetOffice: office, package: importPackage, selections, createNew: mode === "new" && Boolean(existing) }),
      }, auth.token);
      const imported = await response.json() as Script;
      onImported(imported.id);
      close();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The configuration could not be imported.");
    } finally {
      setPending(false);
    }
  };

  const renderValues = () => <div className="max-h-80 space-y-2 overflow-auto rounded-lg border border-slate-200 bg-slate-50 p-3">
    {Object.entries(packageData?.configuration ?? {}).map(([field, importedValue]) => <div key={field} className="grid gap-2 border-b border-slate-200 pb-2 last:border-b-0 sm:grid-cols-[12rem_1fr]">
      <span className="font-semibold text-slate-700">{fieldLabels[field] ?? field}</span>
      {mode === "update" && existing ? <div className="space-y-1 text-sm">
        <label className="block"><input type="radio" name={`choice-${field}`} checked={selections[field] !== "existing"} onChange={() => setSelections(previous => ({ ...previous, [field]: "imported" }))} /> Imported: <code>{displayValue(importedValue)}</code></label>
        <label className="block"><input type="radio" name={`choice-${field}`} checked={selections[field] === "existing"} onChange={() => setSelections(previous => ({ ...previous, [field]: "existing" }))} /> Existing: <code>{displayValue((existing as unknown as Record<string, unknown>)[field])}</code></label>
      </div> : <code className="break-all text-sm text-slate-600">{displayValue(importedValue)}</code>}
    </div>)}
  </div>;

  return <Modal opened={opened} onClose={close} dialogTitle={`Import job configuration · ${office.toUpperCase()}`} size="3xl" className="[&_[id^=headlessui-dialog-panel]]:overflow-hidden [&_[id^=headlessui-dialog-panel]]:rounded-2xl [&_[id^=headlessui-dialog-panel]]:border [&_[id^=headlessui-dialog-panel]]:border-slate-200 [&_[id^=headlessui-dialog-panel]]:shadow-2xl">
    <div className="space-y-5 p-4 sm:p-6">
      {!packageData ? <div
        className={`mx-auto w-full max-w-xl rounded-xl border-2 border-dashed text-center transition ${dragActive ? "border-blue-700 bg-blue-50" : "border-slate-300 bg-gradient-to-br from-slate-50 to-blue-50/40"}`}
        style={{ padding: "2rem" }}
        onDragEnter={event => { event.preventDefault(); setDragActive(true); }}
        onDragOver={event => { event.preventDefault(); setDragActive(true); }}
        onDragLeave={event => { event.preventDefault(); setDragActive(false); }}
        onDrop={event => { event.preventDefault(); const file = event.dataTransfer.files[0]; if (file) void readFile(file); }}
      >
        <input ref={fileInputRef} id="configuration-file" aria-label="Configuration JSON file" className="sr-only" type="file" accept="application/json,.json" onChange={event => { const file = event.target.files?.[0]; if (file) void readFile(file); }} />
        <p className="text-lg font-semibold text-slate-900">Choose a configuration backup</p>
        <p className="mt-1 text-sm text-slate-600">Select a JSON file or drag it into this area.</p>
        <Button type="button" onClick={() => fileInputRef.current?.click()} className="mt-4">Choose configuration file</Button>
      </div> : <>
        <div className="flex items-center justify-between rounded-xl bg-gradient-to-r from-blue-50 to-slate-50 px-4 py-3">
          <div className="min-w-0"><p className="text-xs font-semibold uppercase tracking-wide text-blue-800">Selected backup</p><p className="truncate text-sm font-medium text-slate-800">{fileName}</p></div>
          <button type="button" aria-label="Choose a different configuration file" title="Choose a different file" onClick={reset} className="ml-3 rounded-full px-3 py-1 text-2xl leading-none text-slate-500 hover:bg-white hover:text-slate-900">×</button>
        </div>
        <p className="text-sm text-slate-600">Source office: <span className="font-medium text-slate-900">{packageData.sourceOffice}</span>. This will import into <span className="font-medium text-slate-900">{office.toUpperCase()}</span>.</p>
        {existing && !choiceMade ? <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="font-semibold text-amber-950">Matching configuration found</p>
          <p className="mt-1 text-sm text-amber-900">This backup has the same configuration ID as <span className="font-semibold">{existing.name}</span>. Would you like to update that configuration or make a new one?</p>
          <div className="mt-4 flex flex-wrap gap-2"><Button type="button" onClick={() => { setMode("update"); setChoiceMade(true); setReviewValues(true); }}>Review values</Button><Button type="button" onClick={() => { setMode("new"); setChoiceMade(true); setReviewValues(false); }}>Make new configuration</Button></div>
        </div> : <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
          <p className="font-semibold text-emerald-950">{existing && mode === "new" ? "New configuration" : existing ? "Update existing configuration" : "New configuration"}</p>
          <p className="mt-1 text-sm text-emerald-900">{existing && mode === "new" ? <>A new configuration named <span className="font-semibold">{newName || "(unnamed)"}</span> will be created. The existing configuration will not change.</> : existing ? <>Review the values to import into <span className="font-semibold">{existing.name}</span>.</> : <>A new configuration named <span className="font-semibold">{String(packageData.configuration.name ?? "(unnamed)")}</span> will be imported with <span className="font-semibold">{valueCount} values</span>.</>}</p>
          {existing && mode === "new" && <label className="mt-4 block text-sm font-medium text-slate-800">New configuration name
            <input value={newName} onChange={event => setNewName(event.target.value)} aria-describedby="new-configuration-name-help" className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 focus:outline-2 focus:outline-blue-600" />
            <span id="new-configuration-name-help" className="mt-1 block text-xs text-slate-600">Choose a name different from {existing.name}.</span>
          </label>}
          {reviewValues && renderValues()}
          <div className="mt-4 flex flex-wrap justify-end gap-2"><Button type="button" onClick={() => { setReviewValues(false); setMode("new"); setChoiceMade(false); }}>Cancel</Button>{!reviewValues && <Button type="button" onClick={() => setReviewValues(true)}>Review values</Button>}{reviewValues && existing && mode === "update" && <Button type="button" onClick={() => { setMode("new"); setChoiceMade(true); setReviewValues(false); }}>Make new configuration</Button>}<Button type="button" disabled={pending || Boolean(existing && mode === "new" && (!newName.trim() || newName.trim() === existing.name))} onClick={() => void apply()}>{pending ? "Importing…" : existing && mode === "update" ? "Update configuration" : "Import configuration"}</Button></div>
        </div>}
      </>}
      {error && <p role="alert" className="rounded border border-red-500 bg-red-50 p-3 text-red-800">{error}</p>}
    </div>
  </Modal>;
}
