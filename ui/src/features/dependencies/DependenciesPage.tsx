import { useState } from "react";
import { Card, H1, H2, Text } from "@usace/groundwork";
import { FiExternalLink, FiPackage } from "react-icons/fi";
import { useAuth } from "@usace-watermanagement/groundwork-water";
import LoginPrompt from "../auth/LoginPrompt";
import { useApplicationInfo } from "../about/useAboutInfo";
import { OfficeSelector } from "../../shared/components/OfficeSelector";
import { useRepositoryDependencies } from "./useRepositoryDependencies";

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
  const auth = useAuth();
  const application = useApplicationInfo();
  const [office, setOffice] = useState<string>();
  const offices = application.data?.user?.offices ?? [];
  const selectedOffice = office && offices.includes(office) ? office : offices[0];
  const dependencies = useRepositoryDependencies(selectedOffice);

  if (!auth.isAuth) {
    return (
      <LoginPrompt
        title="Sign in to view dependencies"
        description="The WM base image package list is available to users who can submit batch jobs."
      />
    );
  }

  if (application.isLoading) return <Text>Checking your Batch Events access...</Text>;
  if (application.isError || !application.data) {
    return <Text>Unable to verify your Batch Events access.</Text>;
  }
  if (application.data.user.offices.length === 0) {
    return <Text>You do not have the office roles required to submit a batch job.</Text>;
  }

  const repository = dependencies.data?.repository ??
    "USACE-WaterManagement/" + selectedOffice.toLowerCase() + "-wm-cwbi-jobs";
  const ref = dependencies.data?.ref ?? "cwbi-dev";
  const path = dependencies.data?.path ?? "base_requirements.txt";
  const repositoryUrl = "https://github.com/" + repository;
  const requirementsUrl = repositoryUrl + "/blob/" + ref + "/" + path;
  const issuesUrl = repositoryUrl + "/issues";

  return (
    <main className="mx-auto max-w-6xl py-6 sm:py-10">
      <div className="max-w-3xl">
        <div className="mb-4 flex size-12 items-center justify-center rounded-xl bg-blue-100 text-blue-700">
          <FiPackage aria-hidden="true" className="size-6" />
        </div>
        <H1>Python dependencies</H1>
        <Text className="mt-3 text-lg">
          These are the pinned Python packages installed in the selected office's WM base image.
        </Text>
        <div className="mt-6 max-w-sm">
          <OfficeSelector offices={offices} value={selectedOffice} onChange={setOffice} />
        </div>
        <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm">
          <ExternalLink href={requirementsUrl}>View {selectedOffice} requirements</ExternalLink>
          <ExternalLink href={issuesUrl}>Open {selectedOffice} issues</ExternalLink>
        </div>
      </div>

      <Card className="mt-8 overflow-hidden border-blue-200 p-0 shadow-sm">
        <div className="border-b border-blue-100 bg-gradient-to-r from-blue-700 to-indigo-700 px-6 py-5 text-white sm:px-8">
          <H2 className="text-white">Installed base packages</H2>
          <p className="mt-1 text-sm text-blue-100">{selectedOffice} · {repository}</p>
        </div>
        <div className="grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-3 sm:p-8">
          {dependencies.isPending && <Text>Loading requirements from GitHub...</Text>}
          {dependencies.isError && <Text>Unable to load this office's requirements file.</Text>}
          {dependencies.data?.warnings.map((warning) => <Text key={warning.code}>{warning.message}</Text>)}
          {dependencies.data?.packages.map((item, index) => (
            <div key={item.name} className={"flex items-center justify-between gap-3 rounded-lg border px-4 py-3 " + packageColors[index % packageColors.length]}>
              <span className="break-all font-mono text-sm font-semibold">{item.name}</span>
              <span className="shrink-0 rounded-full bg-white/75 px-2 py-1 font-mono text-xs font-medium">{item.operator}{item.version}</span>
            </div>
          ))}
        </div>
      </Card>

      <Card className="mt-6 border-amber-200 bg-amber-50 p-5 sm:p-6">
        <H2 className="text-lg">Need a package or version bump?</H2>
        <Text className="mt-2 text-amber-950">
          Request additions or upgrades for the enterprise base image through the{" "}
          <ExternalLink href={issuesUrl}>{selectedOffice} repository issues</ExternalLink>.
        </Text>
      </Card>
    </main>
  );
}
