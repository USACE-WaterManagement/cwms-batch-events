import type { ChangeEvent } from "react";
import {
  currentEnvironmentLabel,
  deploymentEnvironments,
  environmentUrl,
  type DeploymentEnvironment,
} from "../utils/environment";

const environmentModes: Record<string, DeploymentEnvironment | undefined> = {
  dev: "dev",
  test: "test",
  prod: "prod",
};

export function EnvironmentSelector() {
  const currentEnvironment = environmentModes[import.meta.env.MODE];

  function handleChange(event: ChangeEvent<HTMLSelectElement>) {
    const selectedEnvironment = event.target.value as DeploymentEnvironment;
    if (selectedEnvironment === currentEnvironment) return;
    window.location.assign(environmentUrl(selectedEnvironment));
  }

  return (
    <label className="inline-flex items-center gap-1.5" title="Switch Batch Events environment">
      <span className="sr-only">Batch Events environment</span>
      <select
        aria-label="Batch Events environment"
        className="rounded-full border border-slate-300 bg-white px-2 py-0.5 text-xs font-semibold leading-4 text-slate-900"
        value={currentEnvironment ?? ""}
        onChange={handleChange}
      >
        {!currentEnvironment ? <option value="">{currentEnvironmentLabel()}</option> : null}
        {deploymentEnvironments.map((environment) => (
          <option key={environment.value} value={environment.value}>
            {environment.label}
          </option>
        ))}
      </select>
    </label>
  );
}
