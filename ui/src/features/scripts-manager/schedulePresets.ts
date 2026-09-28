import type { ScriptFormData } from "./types";

export function meetsMinimumInterval(fields: string[]): boolean {
  const matches = (field: string, value: number, maximum: number) => field.split(",").some(item => {
    const [base, step = "1"] = item.split("/");
    let start = 0;
    let end = maximum;
    if (base !== "*") {
      const bounds = base.split("-").map(Number);
      start = bounds[0];
      end = bounds[bounds.length - 1];
    }
    return value >= start && value <= end && (value - start) % Number(step) === 0;
  });
  const slots: number[] = [];
  for (let hour = 0; hour < 24; hour++) {
    if (!matches(fields[1], hour, 23)) continue;
    for (let minute = 0; minute < 60; minute++) {
      if (matches(fields[0], minute, 59)) slots.push(hour * 60 + minute);
    }
  }
  return slots.every((slot, index) => (slots[index + 1] ?? slots[0] + 1440) - slot >= 5);
}

export function schedulePreset(form: Pick<ScriptFormData, "scheduleType" | "scheduleCron">): string {
  if (form.scheduleType !== "cron") return form.scheduleType ?? "manual";
  const fields = (form.scheduleCron ?? "").trim().split(/\s+/);
  if (fields.length !== 5) return "cron";
  const [minute, hour, day, month, weekday] = fields;
  if (!/^\d+$/.test(minute) || Number(minute) > 59 || !/^\d+$/.test(hour) || Number(hour) > 23) return "cron";
  if (month !== "*" || weekday !== "*") return "cron";
  if (day === "*") return "daily";
  // Advanced cron keeps skip semantics. Do not silently convert it to monthly fallback.
  return "cron";
}

export function presetCron(preset: string, time: string, day: string): string {
  if (!/^\d{2}:\d{2}$/.test(time)) return "";
  const [hour, minute] = time.split(":").map(Number);
  if (preset === "monthly") return `${minute} ${hour} ${day} * *`;
  return `${minute} ${hour} * * *`;
}
