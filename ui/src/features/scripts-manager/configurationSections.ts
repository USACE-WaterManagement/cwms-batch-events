export const scriptSections = [
  { id: "source", label: "Command" },
  { id: "environment", label: "Environment" },
  { id: "general", label: "Name" },
  { id: "access", label: "Access" },
  { id: "schedule", label: "Schedule" },
  { id: "upgrade", label: "Upgrade" },
] as const;
export type ScriptSection = typeof scriptSections[number]["id"];
export const fieldSections: Record<string, ScriptSection> = {
  name: "general", description: "general", active: "general",
  repoPath: "source", executionType: "source", runtime: "source",
  commandArgs: "source", commandMode: "source", shellCommand: "source",
  environmentVariables: "environment",
  roles: "access", scheduleType: "schedule", scheduleMinute: "schedule",
  scheduleCron: "schedule", scheduleTimezone: "schedule", scheduleEnabled: "schedule",
};
