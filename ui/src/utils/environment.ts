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

function configuredEnvironmentUrl(environment: DeploymentEnvironment): string | undefined {
  const key = `VITE_BATCH_EVENTS_${environment.toUpperCase()}_URL` as
    | "VITE_BATCH_EVENTS_DEV_URL"
    | "VITE_BATCH_EVENTS_TEST_URL"
    | "VITE_BATCH_EVENTS_PROD_URL";
  return import.meta.env[key];
}

function environmentHost(hostname: string, environment: DeploymentEnvironment): string {
  const environmentToken = /(^|[-.])(dev|test|prod)(?=[-.]|$)/i;
  if (environmentToken.test(hostname)) {
    return hostname.replace(environmentToken, `$1${environment}`);
  }
  return hostname;
}

export function environmentUrl(environment: DeploymentEnvironment): string {
  const configuredUrl = configuredEnvironmentUrl(environment);
  if (configuredUrl) return new URL(configuredUrl, window.location.origin).href;

  const currentUrl = new URL(window.location.href);
  currentUrl.hostname = environmentHost(currentUrl.hostname, environment);
  return currentUrl.href;
}
