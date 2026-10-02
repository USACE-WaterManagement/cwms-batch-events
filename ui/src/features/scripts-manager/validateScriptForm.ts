import { meetsMinimumInterval } from "./schedulePresets";
import type { ScriptFormData } from "./types";

const protectedEnvironmentNames = new Set([
  "OFFICE", "TZ", "SKIP_GIT_CLONE", "GITHUB_BRANCH", "ENVIRONMENT",
]);
const protectedEnvironmentTerms = [
  "KEY", "SECRET", "PASSWORD", "TOKEN", "CREDENTIAL", "AUTH", "PRIVATE", "CERT",
];

function environmentVariableError(name: string, index: number, names: string[]): { field: string; message: string } | undefined {
  const field = `environmentVariables[${index}].name`;
  if (!name) return { field, message: "Enter an environment variable name." };
  if (!/^[A-Z][A-Z0-9_]*$/.test(name) || name.length > 64) {
    return { field, message: "Use an uppercase name with letters, numbers, and underscores, starting with a letter, and no more than 64 characters." };
  }
  if (protectedEnvironmentNames.has(name) || name.startsWith("BATCH_EVENTS_")) {
    return { field, message: "This name is reserved by Batch Events and cannot be overridden." };
  }
  if (protectedEnvironmentTerms.some(term => name.includes(term))) {
    return { field, message: "Names containing secret-related terms are not allowed because job environment variables are not stored securely like secrets." };
  }
  if (names.indexOf(name) !== index) return { field, message: "Environment variable names must be unique." };
  return undefined;
}

export function validateScriptForm(form: ScriptFormData): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!form.name.trim()) errors.name = "Enter a script name.";
  const environmentVariables = form.environmentVariables ?? [];
  if (environmentVariables.length > 20) errors.environmentVariables = "A script may define at most 20 environment variables.";
  const environmentNames = environmentVariables.map(variable => variable.name);
  environmentVariables.forEach((variable, index) => {
    const error = environmentVariableError(variable.name, index, environmentNames);
    if (error) errors[error.field] = error.message;
    if (variable.value.length > 2048) errors[`environmentVariables[${index}].value`] = "Values must be no more than 2048 characters.";
  });
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
      if (valid && form.scheduleEnabled && !meetsMinimumInterval(fields)) errors.scheduleCron = "The minimum schedule interval is 5 minutes. Space all selected run times at least 5 minutes apart.";
      if (!valid) errors.scheduleCron = "Enter a valid five-field numeric cron expression, such as 0 8 * * 1-5.";
    }
    try {
      if (!form.scheduleTimezone?.trim()) throw new Error("Missing timezone");
      new Intl.DateTimeFormat("en", { timeZone: form.scheduleTimezone }).format();
    } catch { errors.scheduleTimezone = "Enter an IANA timezone, such as America/Chicago."; }
  }
  return errors;
}
