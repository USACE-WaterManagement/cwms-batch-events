const environmentLabels: Record<string, string> = {
  dev: "Dev",
  test: "Test",
  prod: "Production",
  development: "Local",
  "dev-cda-compose": "Local",
};

export const currentEnvironmentLabel = () => environmentLabels[import.meta.env.MODE] ?? "Unknown";
