import type { Script } from "./types";
import { schedulePreset } from "./schedulePresets";

export function scheduleDescription(script: Pick<Script, "scheduleEnabled" | "scheduleType" | "scheduleMinute" | "scheduleCron">): string {
  if (!script.scheduleEnabled) return "";
  if (script.scheduleType === "hourly") return "Hourly at " + (script.scheduleMinute ?? 0) + " mins";
  const preset = schedulePreset(script);
  const [minute, hour, day] = (script.scheduleCron ?? "").trim().split(/\s+/);
  if (preset === "daily") return "Daily at " + hour.padStart(2, "0") + ":" + minute.padStart(2, "0");
  if (preset === "monthly") return "Monthly on day " + day + " at " + hour.padStart(2, "0") + ":" + minute.padStart(2, "0");
  return script.scheduleCron ? "Cron: " + script.scheduleCron : "Not configured";
}
