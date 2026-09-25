import type { CSSProperties, ReactNode } from "react";
import { useAuth } from "@usace-watermanagement/groundwork-water";
import {
  Card, H1, H2, H3, Table, TableBody, TableCell, TableHead, TableHeader,
  TableRow, Tabs, Text,
} from "@usace/groundwork";
import { type ApplicationInfo, useApplicationInfo, useSchemaInfo } from "./useAboutInfo";

const uiVersion = import.meta.env.VITE_UI_VERSION || "local";
const uiBuildTime = import.meta.env.VITE_UI_BUILD_TIME;
const github = {
  application: "https://github.com/USACE-WaterManagement/cwms-batch-events",
  cda: "https://github.com/USACE/cwms-data-api",
  lrhJobs: "https://github.com/USACE-WaterManagement/lrh-wm-cwbi-jobs",
  swtJobs: "https://github.com/USACE-WaterManagement/swt-wm-cwbi-jobs",
};

const formatDate = (value?: string) =>
  value
    ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value))
    : "Local development build";

const Detail = ({ label, value }: { label: string; value: string }) => (
  <div className="border-b border-slate-200 py-3 last:border-0 sm:grid sm:grid-cols-[11rem_1fr] sm:gap-4">
    <dt className="text-sm font-medium text-slate-500">{label}</dt>
    <dd className="mt-1 break-words text-sm text-slate-900 sm:mt-0">{value}</dd>
  </div>
);

const ExternalLink = ({ href, children }: { href: string; children: ReactNode }) => (
  <a className="font-medium text-blue-700 underline decoration-blue-300 underline-offset-4 hover:text-blue-900"
    href={href} target="_blank" rel="noreferrer">{children}</a>
);

const VersionCard = ({ label, version, detail, error = false }: {
  label: string;
  version: string;
  detail: string;
  error?: boolean;
}) => (
  <Card className="p-5">
    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">{label}</p>
    <p className="mt-2 font-mono text-2xl font-semibold text-slate-900">{version}</p>
    <p className={`mt-2 text-sm ${error ? "text-red-700" : "text-slate-500"}`}>{detail}</p>
  </Card>
);

const OfficeTable = ({ offices, emptyMessage }: { offices: string[]; emptyMessage: string }) => (
  <div className="max-h-72 overflow-y-auto rounded-lg border border-slate-200">
    <Table>
      <TableHead className="sticky top-0 z-10 bg-white"><TableRow><TableHeader>Office</TableHeader></TableRow></TableHead>
      <TableBody>
        {offices.length ? [...offices].sort().map((office) => (
          <TableRow key={office}><TableCell>{office}</TableCell></TableRow>
        )) : <TableRow><TableCell>{emptyMessage}</TableCell></TableRow>}
      </TableBody>
    </Table>
  </div>
);

const VersionPane = () => {
  const application = useApplicationInfo();
  const schema = useSchemaInfo();
  const app = application.data;
  const applicationStatus = application.isLoading ? "Reading API version…" : application.error?.message ?? "Unavailable";
  const schemaStatus = schema.isLoading ? "Reading applied migration…" : schema.error?.message ?? "Unavailable";
  const accessTabs = app ? [
    { name: "Available offices", content: <OfficeTable offices={app.user.offices} emptyMessage="No offices available" /> },
    { name: "Script administration", content: <OfficeTable offices={app.user.adminOffices} emptyMessage="No offices available" /> },
  ] : [];

  return <section aria-labelledby="version-heading" className="space-y-5 py-6">
    <div><H2 id="version-heading">Version and environment</H2>
      <Text>{app ? `Signed in as ${app.user.username}.` : "Live details for this deployment."}</Text>
    </div>
    <div aria-label="Application versions" className="grid gap-4 md:grid-cols-3">
      <VersionCard label="API version"
        version={app?.apiVersion ?? (application.isLoading ? "Loading…" : "Unavailable")}
        detail={app ? formatDate(app.buildTime) : applicationStatus}
        error={application.isError} />
      <VersionCard label="UI version" version={uiVersion} detail={formatDate(uiBuildTime)} />
      <VersionCard label="Schema version"
        version={schema.data?.version ?? (schema.isLoading ? "Loading…" : "Unavailable")}
        detail={schema.data ? `Latest migration: ${schema.data.description}` : schemaStatus}
        error={schema.isError} />
    </div>
    {application.isError && <Card role="alert" className="border-red-200 bg-red-50 p-5 text-red-800">
      Application details could not be loaded: {applicationStatus}
    </Card>}
    <div className="grid gap-6 lg:grid-cols-2">
      <Card className="p-6"><H3>Deployment</H3>
        {app ? <dl className="mt-3">
        <Detail label="Environment" value={app.environment} />
        <Detail label="API revision" value={app.buildRevision} />
        <Detail label="API base path" value={app.rootPath} />
        <Detail label="Authentication" value={app.authenticationEnvironment} />
        <Detail label="Job execution" value={app.jobRunner} />
        </dl> : <Text className="mt-3">{applicationStatus}</Text>}
      </Card>
      <Card className="p-6"><H3>Database schema</H3>
        {schema.data ? <dl className="mt-3">
          <Detail label="Schema" value={schema.data.name} />
          <Detail label="Applied version" value={schema.data.version} />
          <Detail label="Latest migration" value={schema.data.description} />
          <Detail label="Installed" value={formatDate(schema.data.installedOn)} />
        </dl> : <Text className="mt-3">{schemaStatus}</Text>}
      </Card>
      <Card className="p-6 lg:col-span-2"><H3>Your access</H3>
        {app ? <div className="mt-4"><Tabs tabs={accessTabs} fill /></div>
          : <Text className="mt-3">{applicationStatus}</Text>}
      </Card>
    </div>
  </section>;
};

const capabilities = [
  { title: "Discover approved jobs", description: "Browse the scripts available to your office and see the inputs each job needs." },
  { title: "Submit and monitor work", description: "Start batch jobs, follow their status, and review their output." },
  { title: "Manage office catalogs", description: "Authorized script administrators can maintain their office job definitions." },
];

const AboutOverview = () => <div className="space-y-8 py-6">
  <Card className="border-blue-200 bg-blue-50 p-6 sm:p-8">
    <H2>Use case</H2>
    <Text className="mt-3 max-w-4xl">
      Run approved batch jobs without direct access to the systems that execute them.
      Office assignments control which scripts and administrative actions are available.
    </Text>
    <Text className="mt-3 max-w-4xl">
      Batch Events replaces district cron jobs for approved operational work. Jobs are defined for
      an office, run when needed, and tracked with their status and output in the application.
    </Text>
  </Card>
  <section aria-labelledby="capabilities-heading"><H2 id="capabilities-heading">What you can do</H2>
    <div className="mt-4 grid gap-4 md:grid-cols-3">{capabilities.map((capability) => (
      <Card key={capability.title} className="p-5"><H3>{capability.title}</H3>
        <Text className="mt-2">{capability.description}</Text></Card>
    ))}</div>
  </section>
</div>;

const controls = [
  { action: "Review office runs and logs", access: "CWMS Users in the job's office",
    result: "Job History shares office runs and shows who submitted them. Manual and Scheduled badges identify the trigger when recorded." },
  { action: "Execute a job", access: "Office access, plus a matching execution role when the script specifies roles",
    result: "An empty script role list requires no additional CDA role. Run active scripts from Submit Job or Job Manager." },
  { action: "Define or change a job", access: "Data Acquisition Mgr or Data Exchange Mgr for the office",
    result: "Job Manager provides Details, Run job, and Job runs tabs. Editing still requires office administrator access." },
];

const ControlsPane = ({ user }: { user?: ApplicationInfo["user"] }) => {
  const offices = user ? [...new Set([...Object.keys(user.roles), ...user.offices, ...user.adminOffices])].sort() : [];
  return <section aria-labelledby="controls-heading" className="space-y-6 py-6">
    <div><H2 id="controls-heading">Controls</H2>
      <Text>Batch Events uses office roles from your CDA profile. It does not assign or change roles.</Text>
    </div>
    <div className="grid min-w-0 gap-4 lg:grid-cols-3">{controls.map(control => <Card key={control.action} className="min-w-0 border-t-4 border-t-red-700 p-5">
      <H3>{control.action}</H3><dl className="mt-4 space-y-4 text-sm">
        <div><dt className="font-semibold text-slate-700">Required access</dt><dd className="mt-1 whitespace-normal text-slate-600">{control.access}</dd></div>
        <div><dt className="font-semibold text-slate-700">What happens</dt><dd className="mt-1 whitespace-normal text-slate-600">{control.result}</dd></div>
      </dl></Card>)}</div>
    <Card className="p-6"><H3>How roles are set</H3>
      <div className="mt-3 space-y-3 text-sm text-slate-700">
        <p>Roles are managed in the CDA user profile and grouped by office.</p>
        <p><strong>CWMS Users</strong> makes an office available in Batch Events. A script can require
          that role or another role assigned to you for the same office. Leave the script roles empty
          when no additional execution role is needed. Office access is still required.</p>
        <p><strong>Data Acquisition Mgr</strong> or <strong>Data Exchange Mgr</strong> allows you to
          define and maintain scripts for that office in Job Manager.</p>
        <p>The <strong>Roles</strong> field on each script definition controls who may execute it.</p>
        <p>See the <ExternalLink href={github.cda}>CWMS Data API repository</ExternalLink> for the
          source of CDA profile behavior and the{" "}
          <ExternalLink href={github.application}>Batch Events repository</ExternalLink> for this
          application's access checks.</p>
      </div>
    </Card>
    {user ? <Card className="p-6"><H3>Your current controls</H3>
      <Text className="mt-2">These values come from your current CDA profile.</Text>
      <div className="mt-4 max-h-80 overflow-auto rounded-lg border border-slate-200"><Table>
        <TableHead className="sticky top-0 z-10 bg-white"><TableRow><TableHeader>Office</TableHeader>
          <TableHeader>Assigned roles</TableHeader><TableHeader>Execute</TableHeader>
          <TableHeader>Define</TableHeader></TableRow></TableHead>
        <TableBody>{offices.map((office) => <TableRow key={office}>
          <TableCell className="font-medium">{office}</TableCell>
          <TableCell>{user.roles[office]?.join(", ") || "None reported"}</TableCell>
          <TableCell>{user.offices.includes(office) ? "Eligible scripts" : "No"}</TableCell>
          <TableCell>{user.adminOffices.includes(office) ? "Yes" : "No"}</TableCell>
        </TableRow>)}</TableBody>
      </Table></div>
    </Card> : <Card className="p-5"><Text>Sign in to compare these controls with your office roles.</Text></Card>}
  </section>;
};

type Callout = { label: string; style: CSSProperties };
const OnboardingScreenshot = ({
  src,
  alt,
  callouts,
  frameClassName,
}: {
  src: string;
  alt: string;
  callouts: Callout[];
  frameClassName: string;
}) => (
  <figure className="mx-auto mt-5 w-full min-w-0 max-w-4xl">
    <div className="w-full max-w-full rounded-lg">
      <div
        className={"relative min-w-0 overflow-hidden rounded-lg border border-slate-300 bg-white shadow-sm " + frameClassName}
      >
        <img src={src} alt={alt} className="absolute inset-x-0 top-0 block h-auto w-full max-w-none" />
        {callouts.map((callout) => <div key={callout.label} aria-hidden="true"
          className="absolute hidden rounded-full border-4 border-red-600 shadow-[0_0_0_2px_white] sm:block"
          style={callout.style}>
          <span className="absolute -top-8 left-0 whitespace-nowrap rounded bg-red-700 px-2 py-1 text-xs font-semibold text-white shadow">
            {callout.label}
          </span>
        </div>)}
      </div>
    </div>
    <figcaption className="mt-2 text-sm text-slate-600">
      {alt}{" "}
      <a
        href={src}
        target="_blank"
        rel="noreferrer"
        className="font-medium text-blue-700 underline decoration-blue-300 underline-offset-4"
      >
        Open full-size screenshot
      </a>
    </figcaption>
  </figure>
);

const OnboardingStep = ({ number, title, children }: { number: number; title: string; children: ReactNode }) => (
  <li><Card className="p-5 sm:p-6"><div className="flex gap-4">
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-700 font-semibold text-white">{number}</span>
    <div className="min-w-0 flex-1"><H3>{title}</H3>
      <div className="mt-2 space-y-3 text-sm text-slate-700">{children}</div></div>
  </div></Card></li>
);

const OnboardingSubstep = ({
  number,
  title,
  children,
}: {
  number: string;
  title: string;
  children: ReactNode;
}) => (
  <li className="min-w-0 rounded-lg border border-slate-200 bg-slate-50 p-4 sm:p-5">
    <div className="flex flex-col gap-3 sm:flex-row">
      <span className="flex h-8 min-w-12 shrink-0 items-center justify-center rounded-full bg-slate-700 px-2 text-sm font-semibold text-white">
        {number}
      </span>
      <div className="min-w-0 flex-1">
        <h4 className="font-semibold text-slate-900">{title}</h4>
        <div className="mt-2 space-y-3">{children}</div>
      </div>
    </div>
  </li>
);

const OnboardingPane = ({ user }: { user?: ApplicationInfo["user"] }) => {
  const office = user?.adminOffices.includes("SWT")
    ? "SWT"
    : user?.adminOffices[0] ?? user?.offices[0];
  const canDefine = office ? user?.adminOffices.includes(office) : false;
  const officeLabel = office ?? "OFFICE";
  const officeRepoSearch = "https://github.com/orgs/USACE-WaterManagement/repositories?q=" +
    officeLabel.toLowerCase() + "-wm-cwbi-jobs";
  return <section aria-labelledby="onboarding-heading" className="space-y-6 py-6">
    <div><H2 id="onboarding-heading">Set up and run a job</H2>
      <Text>Follow these steps to add an office job, run it, and review the result.</Text></div>
    <Card className="border-blue-200 bg-blue-50 p-5">
      {office ? <Text>This walkthrough uses <strong>{office}</strong> from your current office access.{" "}
        {canDefine ? "You can define and execute eligible jobs for this office."
          : "You can execute eligible jobs, but an office script administrator must define them."}
      </Text> : <Text>Sign in to replace OFFICE with one of your offices.</Text>}
    </Card>
    <ol className="space-y-6">
      <OnboardingStep number={1} title="Confirm your office access">
        <p>Open <strong>About → Controls</strong>. To define a job for {officeLabel}, your CDA
          profile needs <strong>Data Acquisition Mgr</strong> or <strong>Data Exchange Mgr</strong> for
          that office. To run it, you need access to the office and a matching execution role only
          when the script specifies roles.</p>
        <p>If a role is missing, contact the person who manages CDA user roles for your office.</p>
      </OnboardingStep>
      <OnboardingStep number={2} title="Prepare the job in your office repository">
        <p>Commit the executable script to the {officeLabel} office job repository. The convention is
          an office repository such as <code>lrh-wm-cwbi-jobs</code> or <code>swt-wm-cwbi-jobs</code>.</p>
        <p>Find a repository with this <ExternalLink href={officeRepoSearch}>{officeLabel} repository search</ExternalLink>,
          or review the <ExternalLink href={github.lrhJobs}>LRH</ExternalLink> and{" "}
          <ExternalLink href={github.swtJobs}>SWT</ExternalLink> examples. Setup conventions are in the{" "}
          <ExternalLink href={github.application + "#readme"}>Batch Events README</ExternalLink>.</p>
      </OnboardingStep>
      <OnboardingStep number={3} title="Define the job">
        <p>Use Job Manager to add the office script in two parts.</p>
        <ol className="mt-4 space-y-5">
          <OnboardingSubstep number="3.1" title="Choose the office and start a definition">
            <p>Open <strong>Job Manager</strong>, choose {officeLabel}, then select <strong>New +</strong>.</p>
            <OnboardingScreenshot
              src="/events/about/onboarding-scripts-manager.png"
              alt="Job Manager with row actions and Details, Run job, and Job runs tabs."
              frameClassName="aspect-[16/10]"
              callouts={[]}
            />
          </OnboardingSubstep>
          <OnboardingSubstep number="3.2" title="Complete the job definition">
            <p>Enter a name and description. <strong>GitHub Repo Path</strong> is the path to the
              script inside the office repository, such as <code>python/my_job.py</code>—not a GitHub URL.</p>
            <p>For a command already in the runner, choose <strong>Installed command</strong> and
              enter its executable and arguments. The example below uses Bash to print the runner time zone.</p>
            <p>Roles are optional. Leave them empty when the job needs no additional CDA execution role,
              or select roles to restrict who can run it. Keep the script active and save.</p>
            <OnboardingScreenshot
              src="/events/about/onboarding-script-form.png"
              alt="New job form with source, runtime, arguments, and optional roles."
              frameClassName="aspect-[16/9]"
              callouts={[]}
            />
          </OnboardingSubstep>
        </ol>
      </OnboardingStep>
      <OnboardingStep number={4} title="Execute the job">
        <ol className="mt-4 space-y-5">
          <OnboardingSubstep number="4.1" title="Choose the office and script">
            <p>In <strong>Job Manager</strong>, select <strong>Run job</strong> at the end of the
              script row. The script opens with its <strong>Run job</strong> tab selected.
              You can also switch between <strong>Details</strong>, <strong>Run job</strong>, and
              <strong> Job runs</strong> in the selected script.</p>
            <OnboardingScreenshot
              src="/events/about/onboarding-submit-job.png"
              alt="Run job tab reviewing a Bash command with no additional CDA role."
              frameClassName="aspect-[16/10]"
              callouts={[]}
            />
          </OnboardingSubstep>
          <OnboardingSubstep number="4.2" title="Review inputs and execute">
            <p>Review the saved executable or file and arguments, then select <strong>Submit job</strong>.
              Successful submission opens the new run in <strong>Job runs</strong>. To change inputs,
              use <strong>Details → Edit</strong> and save before submitting.</p>
            <p>Users who do not administer scripts can continue to use <strong>Submit Job</strong>{" "}
              to choose an active script from their permitted catalog and select <strong>Submit job</strong>, or use <strong>Custom run</strong> to override arguments for one run.</p>
          </OnboardingSubstep>
        </ol>
      </OnboardingStep>
      <OnboardingStep number={5} title="Review the result">
        <p>Select <strong>View job runs</strong> at the end of a script row to open its <strong>Job runs</strong>{" "}
          tab. Select a run to view status and output; use <strong>Refresh</strong> to reload the list.
          The selected run updates until it finishes, then loads its output.</p>
        <p>Open <strong>Job History</strong> to review runs across scripts in your offices. Both lists
          share office runs and show who submitted them. <strong>Manual</strong> and <strong>Scheduled</strong>{" "}
          badges distinguish the trigger; older runs may show <strong>Unknown</strong>.</p>
        <p>Script rows show a spinner for queued or running office jobs and a <strong>Recent failure</strong>{" "}
          warning for a failure in the past 24 hours. Select either indicator to open that exact run.
          The manager refreshes status every five seconds while visible. If status cannot be loaded,
          use <strong>Retry run status</strong>.</p>
        <OnboardingScreenshot src="/events/about/onboarding-job-runs.png"
          alt="Job runs tab with a completed Bash job and its output." frameClassName="aspect-[16/10]" callouts={[]} />
      </OnboardingStep>
    </ol>
  </section>;
};

export type AboutTab = "about" | "controls" | "onboarding" | "version";

export const AboutPage = ({ initialTab = "about" }: { initialTab?: AboutTab }) => {
  const auth = useAuth();
  const application = useApplicationInfo();
  const user = auth.isAuth ? application.data?.user : undefined;
  const tabs = [
    { name: "About", content: <AboutOverview /> },
    { name: "Controls", content: <ControlsPane user={user} /> },
    ...(auth.isAuth ? [{ name: "Version", content: <VersionPane /> }] : []),
  ];
  const requestedTabIndex = {
    about: 0,
    controls: 1,
    onboarding: 2,
    version: 2,
  }[initialTab];
  const defaultTabIndex =
    requestedTabIndex === 2 && !auth.isAuth ? 0 : requestedTabIndex;

  if (initialTab === "onboarding") return <div className="mx-auto max-w-6xl">
    <H1>Onboarding</H1>
    <OnboardingPane user={user} />
  </div>;

  return <div className="mx-auto max-w-6xl">
    <section className="space-y-4 py-4">
      <H1>About CWMS Batch Events</H1>
      <Text className="max-w-3xl text-lg">CWMS Batch Events is the web interface for finding,
        starting, and monitoring approved water management batch jobs. It keeps job execution,
        status, and office-specific access together in one application.</Text>
    </section>
    <Tabs
      key={initialTab + String(auth.isAuth)}
      tabs={tabs}
      defaultIndex={defaultTabIndex}
    />
  </div>;
};
