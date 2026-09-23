import { Link } from "@tanstack/react-router";

export function ScriptVersionNotice({ version }: { version: number }) {
  const description = version === 1
    ? "Historical Python execution. Runtime, source, and separate arguments are not used. An administrator must review and save this script before using newer features."
    : version === 2
      ? "Executable and literal arguments. Bash command mode requires upgrading to version 3; you can keep running version 2 unchanged."
      : version === 3
        ? "Supports executable arguments or a complete Bash command."
        : "This app does not support this configuration version. Running and editing are unavailable; use an app release that supports it.";
  return <div className="rounded border border-blue-200 bg-blue-50 p-3 text-sm" role="note" aria-label="Script configuration version">
    <p className="font-semibold">Script configuration version {version}</p>
    <p>{description}</p>
    <Link to="/help/script-versions" target="_blank" rel="noopener noreferrer" className="text-blue-700 underline">Script version help (new tab)</Link>
  </div>;
}
