import { useId, useRef } from "react";
import { ArgumentsEditor } from "./ArgumentsEditor";
import { commandPreview } from "./commandArguments";
import type { ScriptFormData } from "./types";

export function CommandEditor({ value, onChange, onValidityChange, disabled, argumentsAvailable = true, shellRequiresUpgrade = false, label = "Arguments" }: {
  value: ScriptFormData; onChange: (value: ScriptFormData) => void;
  onValidityChange: (valid: boolean) => void; disabled?: boolean; argumentsAvailable?: boolean; shellRequiresUpgrade?: boolean; label?: string;
}) {
  const id = useId();
  const savedArguments = useRef(value.commandArgs ?? []);
  const savedShell = useRef(value.shellCommand ?? "");
  const shell = value.commandMode === "shell";
  return <div className="min-w-0 space-y-3">
    <label className="block text-sm font-semibold" htmlFor={`${id}-mode`}>Command mode</label>
    <select id={`${id}-mode`} className="w-full rounded border border-gray-400 bg-white p-2" disabled={disabled}
      value={shell ? "shell" : "arguments"} onChange={event => {
        const nextShell = event.target.value === "shell";
        if (shell) savedShell.current = value.shellCommand ?? "";
        else savedArguments.current = value.commandArgs ?? [];
        const shellText = savedShell.current || (value.repoPath.trim() ? commandPreview(value) : "");
        onChange({ ...value, commandMode: nextShell ? "shell" : "arguments",
          shellCommand: nextShell ? shellText : null, commandArgs: nextShell ? [] : savedArguments.current });
        onValidityChange(!nextShell || !!shellText.trim());
      }}>
      <option value="arguments" disabled={!argumentsAvailable}>Executable with arguments{!argumentsAvailable ? " (no saved executable)" : ""}</option>
      <option value="shell">Bash command ({shellRequiresUpgrade ? "requires version 3 upgrade" : "supports && and ||"})</option>
    </select>
    {shell ? <>
      <label htmlFor={`${id}-shell`} className="block font-semibold">Bash command</label>
      <textarea id={`${id}-shell`} rows={5} disabled={disabled} value={value.shellCommand ?? ""}
        className="block w-full resize-y rounded border border-gray-400 bg-white p-3 font-mono text-sm"
        onChange={event => { onChange({ ...value, shellCommand: event.target.value }); onValidityChange(!!event.target.value.trim() && !event.target.value.includes("\0")); }} />
      <p className="text-sm text-gray-600">Enter the complete command, including executables. Bash interprets <code>&amp;&amp;</code>, <code>||</code>, variables, pipes, and redirection. {value.executionType === "command" ? "Repository checkout is skipped." : "The district repository and enabled artifacts are available under /jobs."}</p>
    </> : <>
      <label htmlFor={`${id}-args`} className="block font-semibold">{label}</label>
      <ArgumentsEditor key="arguments" id={`${id}-args`} label={label} initialArgs={value.commandArgs ?? []} disabled={disabled}
        onChange={commandArgs => onChange({ ...value, commandArgs })} onValidityChange={onValidityChange} />
      <div className="rounded border border-gray-200 bg-gray-50 p-3">
        <p className="text-xs font-semibold text-gray-600">Command preview</p>
        <pre className="mt-1 whitespace-pre-wrap break-all font-mono text-sm">{commandPreview(value)}</pre>
      </div>
    </>}
  </div>;
}
