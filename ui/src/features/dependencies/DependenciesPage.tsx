import { useState } from "react";
import { Card, H1, H2, Text, Button } from "@usace/groundwork";
import { FiAlertTriangle, FiExternalLink, FiLink, FiPackage } from "react-icons/fi";
import { useAuth } from "@usace-watermanagement/groundwork-water";
import { useNavigate, useRouter, useSearch } from "@tanstack/react-router";
import LoginPrompt from "../auth/LoginPrompt";
import { useApplicationInfo } from "../about/useAboutInfo";
import { OfficeSelector } from "../../shared/components/OfficeSelector";
import { useRepositoryDependencies, type DependencyPackage } from "./useRepositoryDependencies";
import { notifySuccess } from "../../utils/actionNotifications";

const ExternalLink = ({ href, children }: { href: string; children: React.ReactNode }) => (
  <a className="inline-flex items-center gap-1 font-semibold text-blue-700 underline decoration-blue-300 underline-offset-4 hover:text-blue-900" href={href} target="_blank" rel="noreferrer">
    {children}<FiExternalLink aria-hidden="true" className="size-4" />
  </a>
);

const packageKey = (item: DependencyPackage) => item.name.toLowerCase().replace(/[-_.]+/g, "-");
const versionParts = (version: string) => version.split(/[.-]/).map((part) => {
  const parsed = Number.parseInt(part, 10);
  return Number.isNaN(parsed) ? 0 : parsed;
});
const isOlderVersion = (office: DependencyPackage, base: DependencyPackage) => {
  const officeVersion = versionParts(office.version);
  const baseVersion = versionParts(base.version);
  const length = Math.max(officeVersion.length, baseVersion.length);
  for (let index = 0; index < length; index += 1) {
    if ((officeVersion[index] ?? 0) !== (baseVersion[index] ?? 0)) return (officeVersion[index] ?? 0) < (baseVersion[index] ?? 0);
  }
  return false;
};

const dependencyRowClass = (older: boolean, overridden: boolean) => {
  if (older) return "bg-amber-50";
  if (overridden) return "bg-blue-50";
  return undefined;
};

const dependencyCellClass = (older: boolean, overridden: boolean) => {
  if (older) return "font-semibold text-amber-900";
  if (overridden) return "font-semibold text-blue-900";
  return "text-slate-700";
};

const chooseOffice = (searchOffice: string | undefined, office: string | undefined, offices: string[]) => {
  if (searchOffice && offices.includes(searchOffice)) return searchOffice;
  if (office && offices.includes(office)) return office;
  return offices[0];
};

function ShareDependencies({ office }: { office: string }) {
  const router = useRouter();
  const [result, setResult] = useState<"idle" | "manual">("idle");
  const href = router.buildLocation({ to: "/dependencies", search: { office } }).href;
  const url = new URL(href, window.location.origin).href;
  const share = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setResult("idle");
      notifySuccess("Dependency page link copied.");
    } catch {
      setResult("manual");
    }
  };
  return <div className="space-y-2">
    <Button type="button" onClick={() => void share()} className="inline-flex items-center gap-2"><FiLink aria-hidden="true" />Share office dependencies</Button>
    {result === "manual" && <label className="block text-sm">Copy this dependency page link<input aria-label="Dependency page link" readOnly value={url} onFocus={(event) => event.target.select()} className="mt-1 w-full rounded border p-2" /></label>}
  </div>;
}

export default function DependenciesPage() {
  const auth = useAuth();
  const application = useApplicationInfo();
  const search = useSearch({ from: "/dependencies" });
  const navigate = useNavigate();
  const [office, setOffice] = useState<string>();
  const offices = application.data?.user?.offices ?? [];
  const selectedOffice = chooseOffice(search.office, office, offices);
  const dependencies = useRepositoryDependencies(selectedOffice);

  if (!auth.isAuth) return <LoginPrompt title="Sign in to view dependencies" description="The Python dependency list is available to users who can submit batch jobs." />;
  if (application.isLoading) return <Text>Checking your Batch Events access...</Text>;
  if (application.isError || !application.data) return <Text>Unable to verify your Batch Events access.</Text>;
  if (application.data.user.offices.length === 0) return <Text>You do not have the office roles required to submit a batch job.</Text>;

  const basePackages = dependencies.data?.base_packages ?? [];
  const officePackages = dependencies.data?.office_packages ?? [];
  const officeByName = new Map(officePackages.map((item) => [packageKey(item), item]));
  const rows = [...new Map([...basePackages, ...officePackages].map((item) => [packageKey(item), item])).values()].sort((left, right) => left.name.localeCompare(right.name));
  const repository = dependencies.data?.repository ?? `USACE-WaterManagement/${selectedOffice.toLowerCase()}-wm-cwbi-jobs`;
  const ref = dependencies.data?.ref ?? "cwbi-dev";
  const path = dependencies.data?.path ?? "python/requirements.txt";
  const repositoryUrl = `https://github.com/${repository}`;
  const requirementsUrl = `${repositoryUrl}/blob/${ref}/${path}`;
  const issuesUrl = `${repositoryUrl}/issues`;
  const baseRequirementsUrl = dependencies.data ? `https://github.com/${dependencies.data.base_repository}/blob/${dependencies.data.base_ref}/${dependencies.data.base_path}` : "https://github.com/USACE/cwbi-wm-images";

  return <main className="mx-auto max-w-6xl py-6 sm:py-10">
    <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between"><div className="max-w-3xl">
      <div className="mb-4 flex size-12 items-center justify-center rounded-xl bg-blue-100 text-blue-700"><FiPackage aria-hidden="true" className="size-6" /></div>
      <H1>Python dependencies</H1>
      <Text className="mt-3 text-lg">This page shows the packages installed for the Python command. The base image column is the current shared image install. The office column shows packages added or changed by the selected district.</Text>
      <div className="mt-6 flex flex-wrap items-end gap-4"><OfficeSelector offices={offices} value={selectedOffice} onChange={(value) => { setOffice(value); void navigate({ to: "/dependencies", search: { office: value } }); }} />{selectedOffice && <ShareDependencies office={selectedOffice} />}</div>
    </div></div>

    <Card className="mt-8 overflow-hidden border-blue-200 p-0 shadow-sm"><div className="border-b border-blue-100 bg-gradient-to-r from-blue-700 to-indigo-700 px-6 py-5 text-white sm:px-8"><H2 className="text-white">Installed Python packages</H2><p className="mt-1 text-sm text-blue-100">{selectedOffice} · {repository}</p></div>
      <div className="overflow-x-auto"><table className="w-full min-w-[42rem] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-600"><tr><th scope="col" className="px-6 py-3">Package</th><th scope="col" className="px-6 py-3">Base image</th><th scope="col" className="px-6 py-3">{selectedOffice}</th></tr></thead><tbody className="divide-y divide-slate-100">
        {dependencies.isPending && <tr><td colSpan={3} className="px-6 py-6">Loading the base image and office requirements from GitHub...</td></tr>}
        {dependencies.isError && <tr><td colSpan={3} className="px-6 py-6">Unable to load the dependency files.</td></tr>}
        {dependencies.data?.warnings.map((warning) => <tr key={warning.code}><td colSpan={3} className="px-6 py-4 text-amber-900"><FiAlertTriangle className="mr-2 inline" aria-hidden="true" />{warning.message}</td></tr>)}
        {rows.map((baseOrOffice) => { const base = basePackages.find((item) => packageKey(item) === packageKey(baseOrOffice)); const officePackage = officeByName.get(packageKey(baseOrOffice)); const overridden = Boolean(base && officePackage && (base.operator !== officePackage.operator || base.version !== officePackage.version)); const older = Boolean(base && officePackage && isOlderVersion(officePackage, base)); return <tr key={packageKey(baseOrOffice)} className={dependencyRowClass(older, overridden)}><th scope="row" className="px-6 py-3 font-mono font-semibold text-slate-900">{baseOrOffice.name}</th><td className="px-6 py-3 font-mono text-slate-700">{base ? `${base.operator}${base.version}` : "Not in base image"}</td><td className={`px-6 py-3 font-mono ${dependencyCellClass(older, overridden)}`}>{officePackage ? `${officePackage.operator}${officePackage.version}` : <span className="text-slate-500">None <span className="font-sans">(uses base image)</span></span>}{overridden && <span className="ml-2 inline-flex items-center gap-1 font-sans text-xs font-semibold">{older && <FiAlertTriangle aria-hidden="true" />}District override{older && " · older than base"}</span>}</td></tr>; })}
      </tbody></table></div>
    </Card>
    <p className="mt-3 text-sm text-slate-600"><span className="mr-2 inline-block rounded bg-blue-50 px-2 py-1 font-semibold text-blue-900">District override</span> The district requirement differs from the shared base image. Amber rows identify overrides that are older than the base image.</p>
    <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm"><ExternalLink href={baseRequirementsUrl}>View base image requirements</ExternalLink><ExternalLink href={requirementsUrl}>View {selectedOffice} requirements</ExternalLink><ExternalLink href={issuesUrl}>Open {selectedOffice} issues</ExternalLink></div>
    <Card className="mt-6 border-amber-200 bg-amber-50 p-5 sm:p-6"><H2 className="text-lg">Need a package or version bump?</H2><Text className="mt-2 text-amber-950">Request additions or upgrades for the enterprise base image through the <ExternalLink href={issuesUrl}>{selectedOffice} repository issues</ExternalLink>.</Text></Card>
  </main>;
}
