export const scriptSections = [
  { id: "general", label: "General" },
  { id: "source", label: "Source & path" },
  { id: "arguments", label: "Arguments & command" },
  { id: "access", label: "Access" },
  { id: "schedule", label: "Schedule" },
] as const;
export type ScriptSection = typeof scriptSections[number]["id"];
export const fieldSections: Record<string, ScriptSection> = {
  name: "general", description: "general", active: "general",
  repoPath: "source", executionType: "source", runtime: "source",
  commandArgs: "arguments", commandMode: "arguments", shellCommand: "arguments",
  roles: "access", scheduleType: "schedule", scheduleMinute: "schedule",
  scheduleCron: "schedule", scheduleTimezone: "schedule", scheduleEnabled: "schedule",
};

