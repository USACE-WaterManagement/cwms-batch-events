import type { ScriptFormData } from "./types";

export function schedulePreset(form: Pick<ScriptFormData, "scheduleType" | "scheduleCron">): string {
  if (form.scheduleType !== "cron") return form.scheduleType ?? "manual";
  const fields = (form.scheduleCron ?? "").trim().split(/\s+/);
  if (fields.length !== 5) return "cron";
  const [minute, hour, day, month, weekday] = fields;
  if (!/^\d+$/.test(minute) || Number(minute) > 59 || !/^\d+$/.test(hour) || Number(hour) > 23) return "cron";
  if (month !== "*" || weekday !== "*") return "cron";
  if (day === "*") return "daily";
  // Advanced cron keeps skip semantics; do not silently convert it to monthly fallback.
  return "cron";
}

export function presetCron(preset: string, time: string, day: string): string {
  if (!/^\d{2}:\d{2}$/.test(time)) return "";
  const [hour, minute] = time.split(":").map(Number);
  if (preset === "monthly") return `${minute} ${hour} ${day} * *`;
  return `${minute} ${hour} * * *`;
}
