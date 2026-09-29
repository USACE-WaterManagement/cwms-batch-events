const environmentLabels: Record<string, string> = {
  dev: "Dev",
  test: "Test",
  prod: "Production",
  development: "Local",
  "dev-cda-compose": "Local",
};

export const currentEnvironmentLabel = () => environmentLabels[import.meta.env.MODE] ?? "Unknown";

export type DeploymentEnvironment = "dev" | "test" | "prod";

export const deploymentEnvironments: Array<{ value: DeploymentEnvironment; label: string }> = [
  { value: "dev", label: "Dev" },
  { value: "test", label: "Test" },
  { value: "prod", label: "Production" },
];

const defaultEnvironmentUrls: Record<DeploymentEnvironment, string> = {
  dev: "https://cwms-batch.dev.cwbi.us/events",
  test: "https://cwms-batch-test.cwbi.us/events",
  prod: "https://cwms-batch.cwbi.mil/events",
};

function configuredEnvironmentUrl(environment: DeploymentEnvironment): string {
  const key = `VITE_BATCH_EVENTS_${environment.toUpperCase()}_URL` as
    | "VITE_BATCH_EVENTS_DEV_URL"
    | "VITE_BATCH_EVENTS_TEST_URL"
    | "VITE_BATCH_EVENTS_PROD_URL";
  return import.meta.env[key] ?? defaultEnvironmentUrls[environment];
}

export function environmentUrl(environment: DeploymentEnvironment): string {
  const configuredUrl = configuredEnvironmentUrl(environment);
  const targetUrl = new URL(configuredUrl, window.location.origin);
  const currentUrl = new URL(window.location.href);
  if (currentUrl.pathname.startsWith("/events")) {
    targetUrl.pathname = currentUrl.pathname;
    targetUrl.search = currentUrl.search;
    targetUrl.hash = currentUrl.hash;
  }
  return targetUrl.href;
}
