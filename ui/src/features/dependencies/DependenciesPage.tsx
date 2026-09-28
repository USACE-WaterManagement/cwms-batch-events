import { Card, H1, H2, Text } from "@usace/groundwork";
import { FiExternalLink, FiPackage } from "react-icons/fi";

const pythonCwmsUrl =
  "https://github.com/USACE-WaterManagement/pythonCWMS";
const baseRequirementsUrl =
  "https://github.com/USACE-WaterManagement/pythonCWMS/blob/main/requirements/base_requirements.txt";
const issuesUrl = "https://github.com/USACE-WaterManagement/pythonCWMS/issues";

const packages = [
  ["cwms-python", "1.0.1"], ["hec-python-library", "1.0"], ["hecdss", "0.1.29"],
  ["cwms-cli", "0.2.2"], ["shef-parser", "1.6.2"], ["beautifulsoup4", "4.13.5"],
  ["bokeh", "3.8.2"], ["boto3", "1.40.39"], ["botocore", "1.40.39"], ["certifi", "2025.8.3"],
  ["charset-normalizer", "3.4.3"], ["click", "8.3.0"], ["colorama", "0.4.6"], ["contourpy", "1.3.3"],
  ["cycler", "0.12.1"], ["dataretrieval", "1.0.12"], ["flexcache", "0.3"], ["flexparser", "0.4"],
  ["fonttools", "4.60.2"], ["idna", "3.10"], ["Jinja2", "3.1.6"], ["jmespath", "1.0.1"],
  ["kiwisolver", "1.4.9"], ["MarkupSafe", "3.0.2"], ["matplotlib", "3.10.6"], ["narwhals", "2.5.0"],
  ["numpy", "2.3.3"], ["packaging", "25.0"], ["pandas", "2.3.2"], ["pillow", "11.3.0"],
  ["Pint", "0.25"], ["Pint-Pandas", "0.7.1"], ["platformdirs", "4.4.0"], ["plotly", "6.3.0"],
  ["pyparsing", "3.2.5"], ["python-dateutil", "2.9.0.post0"], ["pytz", "2025.2"], ["PyYAML", "6.0.2"],
  ["requests", "2.32.5"], ["requests-toolbelt", "1.0.0"], ["s3transfer", "0.14.0"], ["scipy", "1.16.2"],
  ["seaborn", "0.13.2"], ["six", "1.17.0"], ["soupsieve", "2.8"], ["tornado", "6.5.2"],
  ["typing_extensions", "4.15.0"], ["tzdata", "2025.2"], ["tzlocal", "5.3.1"], ["urllib3", "2.6.0"],
] as const;

const packageColors = [
  "border-blue-200 bg-blue-50 text-blue-900",
  "border-emerald-200 bg-emerald-50 text-emerald-900",
  "border-violet-200 bg-violet-50 text-violet-900",
  "border-amber-200 bg-amber-50 text-amber-900",
];

const ExternalLink = ({ href, children }: { href: string; children: React.ReactNode }) => (
  <a className="inline-flex items-center gap-1 font-semibold text-blue-700 underline decoration-blue-300 underline-offset-4 hover:text-blue-900" href={href} target="_blank" rel="noreferrer">
    {children}
    <FiExternalLink aria-hidden="true" className="size-4" />
  </a>
);

export default function DependenciesPage() {
  return (
    <main className="mx-auto max-w-6xl py-6 sm:py-10">
      <div className="max-w-3xl">
        <div className="mb-4 flex size-12 items-center justify-center rounded-xl bg-blue-100 text-blue-700">
          <FiPackage aria-hidden="true" className="size-6" />
        </div>
        <H1>Python dependencies</H1>
        <Text className="mt-3 text-lg">
          These are the pinned Python packages installed in the WM base image for Python jobs.
          Office job repositories can use these packages without adding them to their own image.
        </Text>
        <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm">
          <ExternalLink href={baseRequirementsUrl}>View base requirements</ExternalLink>
          <ExternalLink href={pythonCwmsUrl}>Open pythonCWMS</ExternalLink>
        </div>
      </div>

      <Card className="mt-8 overflow-hidden border-blue-200 p-0 shadow-sm">
        <div className="border-b border-blue-100 bg-gradient-to-r from-blue-700 to-indigo-700 px-6 py-5 text-white sm:px-8">
          <H2 className="text-white">Installed base packages</H2>
          <p className="mt-1 text-sm text-blue-100">Package names and versions from the current base requirements file</p>
        </div>
        <div className="grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-3 sm:p-8">
          {packages.map(([name, version], index) => (
            <div
              key={name}
              className={"flex items-center justify-between gap-3 rounded-lg border px-4 py-3 " + packageColors[index % packageColors.length]}
            >
              <span className="break-all font-mono text-sm font-semibold">{name}</span>
              <span className="shrink-0 rounded-full bg-white/75 px-2 py-1 font-mono text-xs font-medium">{version}</span>
            </div>
          ))}
        </div>
      </Card>

      <Card className="mt-6 border-amber-200 bg-amber-50 p-5 sm:p-6">
        <H2 className="text-lg">Need a package or version bump?</H2>
        <Text className="mt-2 text-amber-950">
          Request additions or upgrades for the enterprise base image through the{" "}
          <ExternalLink href={issuesUrl}>pythonCWMS issues</ExternalLink>.
        </Text>
      </Card>
    </main>
  );
}
