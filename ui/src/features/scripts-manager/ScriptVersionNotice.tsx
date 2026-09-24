import { ScriptVersionHelp } from "./CommandModal";

function versionDescription(version: number): string {
  if (version === 1) return "Historical Python execution. Runtime, source, and separate arguments are not used. An administrator must review and save this script before using newer features.";
  if (version === 2) return "Executable and literal arguments. Bash command mode requires upgrading to version 3; you can keep running version 2 unchanged.";
  if (version === 3) return "Supports executable arguments or a complete Bash command.";
  return "This app does not support this configuration version. Running and editing are unavailable; use an app release that supports it.";
}

export function ScriptVersionNotice({ version }: { version: number }) {
  return <div className="rounded border border-blue-200 bg-blue-50 p-3 text-sm" role="note" aria-label="Script configuration version">
    <p className="font-semibold">Script configuration version {version}</p>
    <p>{versionDescription(version)}</p>
    <div className="mt-3"><ScriptVersionHelp /></div>
  </div>;
}
