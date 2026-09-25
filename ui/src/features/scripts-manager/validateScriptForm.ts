import type { ScriptFormData } from "./types";

export function validateScriptForm(form: ScriptFormData): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!form.name.trim()) errors.name = "Enter a script name.";
  if (form.commandMode === "shell") {
    if ((form.configVersion ?? 1) < 3) errors.commandMode = "Upgrade configuration before using Bash command mode.";
    if (!form.shellCommand?.trim() || form.shellCommand.includes("\0")) errors.shellCommand = "Enter a Bash command without NUL characters.";
  } else {
    const path = form.repoPath.trim();
    if (!path || path.includes("\0")) errors.repoPath = "Enter a script path or executable.";
    else if (form.executionType !== "command") {
      const relative = path.replace(/^\/jobs\//, "");
      if (!relative || relative.startsWith("/") || relative.split("/").includes("..")) errors.repoPath = "Enter a repository path within /jobs.";
    }
  }
  if (form.scheduleType !== "manual") {
    if ((form.configVersion ?? 1) < 4) errors.scheduleType = "Upgrade configuration to version 4 before configuring a schedule.";
    if (form.scheduleType === "hourly" && (form.scheduleMinute == null || !Number.isInteger(form.scheduleMinute) || form.scheduleMinute < 0 || form.scheduleMinute > 59)) errors.scheduleMinute = "Enter a whole minute from 0 through 59.";
    if (form.scheduleType === "cron" || form.scheduleType === "monthly") {
      const fields = (form.scheduleCron ?? "").trim().split(/\s+/);
      const ranges = [[0, 59], [0, 23], [1, 31], [1, 12], [0, 7]];
      const valid = fields.length === 5 && fields.every((field, index) => field.split(",").every(item => {
        if (!/^(?:\*|[0-9]+(?:-[0-9]+)?)(?:\/[0-9]+)?$/.test(item)) return false;
        const [base, step] = item.split("/");
        if (step && Number(step) < 1) return false;
        if (base === "*") return true;
        const bounds = base.split("-").map(Number);
        if (step && bounds.length === 1) return false;
        return bounds[0] >= ranges[index][0] && bounds[0] <= bounds[bounds.length - 1] && bounds[bounds.length - 1] <= ranges[index][1];
      }));
      if (!valid) errors.scheduleCron = "Enter a valid five-field numeric cron expression, such as 0 8 * * 1-5.";
    }
    try {
      if (!form.scheduleTimezone?.trim()) throw new Error("Missing timezone");
      new Intl.DateTimeFormat("en", { timeZone: form.scheduleTimezone }).format();
    } catch { errors.scheduleTimezone = "Enter an IANA timezone, such as America/Chicago."; }
  }
  return errors;
}
