const environments: Record<string, { label: string; color: string }> = {
  dev: { label: "Dev", color: "border-blue-300 bg-blue-50 text-blue-900" },
  test: { label: "Test", color: "border-amber-300 bg-amber-50 text-amber-900" },
  prod: { label: "Production", color: "border-green-300 bg-green-50 text-green-900" },
  development: { label: "Local", color: "border-gray-400 bg-gray-100 text-gray-900" },
  "dev-cda-compose": { label: "Local", color: "border-gray-400 bg-gray-100 text-gray-900" },
};

export function EnvironmentBadge() {
  // Deployment builds explicitly select dev, test, or prod. Vite's generic
  // "production" mode alone does not identify a deployed environment.
  const environment = environments[import.meta.env.MODE] ?? {
    label: "Unknown", color: "border-gray-400 bg-gray-100 text-gray-900",
  };
  return <span aria-label={`Environment: ${environment.label}`}
    title={`Environment: ${environment.label}`}
    className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-xs font-semibold leading-4 ${environment.color}`}>
    {environment.label}
  </span>;
}
