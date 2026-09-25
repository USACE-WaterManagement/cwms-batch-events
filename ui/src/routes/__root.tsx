import { PageErrorBoundary, RequestErrorPage, StatePage } from "../shared/components/StatePage";
import { useState, type ReactNode } from "react";
import { FaGithub } from "react-icons/fa";
import {
  createRootRoute,
  Outlet,
  useLocation,
  type ErrorComponentProps,
} from "@tanstack/react-router";
import { Button, Container, Modal, SiteWrapper } from "@usace/groundwork";
import { useAuth } from "@usace-watermanagement/groundwork-water";
import AuthButton from "../features/auth/AuthButton";
import { useRememberedOffice } from "../shared/hooks/useRememberedOffice";
import { useRepositoryFiles, useRepositoryStatus } from "../features/scripts-manager/useRepositoryFiles";
import { WarningIndicator } from "../components/WarningIndicator";
import useAdminOffices from "../features/scripts-manager/useAdminOffices";
import { EnvironmentBadge } from "../components/EnvironmentBadge";
import { useSystemAdmin } from "../features/auth/useSystemAdmin";

const primaryLinks = [
  { id: "jobs", text: "Job History", href: "/jobs" },
  { id: "submit", text: "Submit Job", href: "/submit" },
  { id: "manager", text: "Job Manager", href: "/scripts-manager" },
];

const publicAboutLinks = [
  { id: "about", text: "About", href: "/about" },
  { id: "controls", text: "Controls", href: "/about/controls" },
];

const helpLinks = [
  { id: "onboarding", text: "Onboarding", href: "/help/onboarding" },
  { id: "script-files", text: "Script setup", href: "/help/script-files" },
  { id: "script-versions", text: "Script versions", href: "/help/script-versions" },
];

const authenticatedAboutLinks = [
  { id: "version", text: "Version", href: "/about/version" },
];

const batchRepository = "https://github.com/USACE-WaterManagement/cwms-batch-events";
const externalLink = (id: string, text: string, href: string) => ({
  id, text, href, target: "_blank", rel: "noopener noreferrer",
});
const footerLinks = [
  { text: "About Batch Events", href: "/events/about" },
  { text: "Controls and access", href: "/events/about/controls" },
  { text: "Onboarding", href: "/events/help/onboarding" },
  { text: "Script setup", href: "/events/help/script-files" },
  { text: "Report an issue", href: `${batchRepository}/issues` },
  { text: "Project documentation", href: `${batchRepository}#readme` },
];

export const Route = createRootRoute({
  shellComponent: RootShell,
  component: RootComponent,
  errorComponent: RootErrorComponent,
  notFoundComponent: () => <StatePage kind="missing" title="Page not found"><p>Check the address or choose a page from the navigation.</p></StatePage>,
  onCatch: (error) => {
    console.error("Unhandled application error", error);
  },
});

function repositoryButtonTitle(office: string | undefined, repositoryUrl: string | undefined, repository: string | undefined): string {
  if (!office) return "Select an office to open its repository";
  if (!repositoryUrl) return `Repository unavailable for ${office}`;
  return `Open ${repository}`;
}

function RootShell({ children }: { children: ReactNode }) {
  const location = useLocation();
  const auth = useAuth();
  const systemAdmin = useSystemAdmin();
  const [githubOpen, setGithubOpen] = useState(false);
  const [selectedOffice] = useRememberedOffice([]);
  const status = useRepositoryStatus();
  const repositories = auth.isAuth ? status.data?.repositories : undefined;
  const offices = Object.keys(repositories ?? {});
  const office = selectedOffice ?? (offices.length === 1 ? offices[0] : undefined);
  const adminOffices = useAdminOffices();
  const canBrowse = Boolean(office && adminOffices.data?.includes(office));
  const catalog = useRepositoryFiles(office ?? "", canBrowse);
  const repository = auth.isAuth && office
    ? repositories?.[office] ?? (canBrowse ? catalog.data?.repository : undefined)
    : undefined;
  const repositoryUrl = repository && /^[\w.-]+\/[\w.-]+$/.test(repository)
    ? `https://github.com/${repository}` : undefined;
  const aboutLink = {
    id: "about-menu",
    text: "About",
    href: "/about",
    children: auth.isAuth
      ? [...publicAboutLinks, ...authenticatedAboutLinks]
      : publicAboutLinks,
  };
  const helpLink = {
    id: "help-menu",
    text: "Help",
    href: "/help/onboarding",
    children: helpLinks,
  };
  const devLink = {
    id: "dev-menu",
    text: "Dev",
    children: [
      externalLink("swagger", "Swagger UI", `${window.location.origin}/api/docs`),
      externalLink("batch-repository", "CWMS Batch Events", batchRepository),
      ...(repositoryUrl ? [externalLink("district-repository", `${office} CWBI jobs`, repositoryUrl)] : []),
      externalLink("images-repository", "CWBI WM images", "https://github.com/USACE/cwbi-wm-images"),
    ],
  };
  const navLinks = [...primaryLinks, aboutLink, helpLink, devLink];
  if (auth.isAuth && systemAdmin.data === true) navLinks.push({ id: "admin", text: "Admin", href: "/admin" });

  return (
    <SiteWrapper links={navLinks}
      title={<span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1 py-1">
        <span>CWMS Batch Events</span><EnvironmentBadge />
      </span>}
      missionText="Support USACE water management teams with shared tools to run district jobs and track their results."
      aboutText="CWMS Batch Events lets authorized district users submit jobs, review job history and logs, and manage registered jobs. For access or job support, contact your district Batch Events administrator."
      usaceLinks={[
        ...footerLinks,
        ...(auth.isAuth ? [{ text: "Version and environment", href: "/events/about/version" }] : []),
      ]}
      externalLinks={[
        { text: "USACE Water Management", href: "https://github.com/USACE-WaterManagement" },
        { text: "CWMS Data API", href: "https://github.com/USACE/cwms-data-api" },
        { text: "CWBI WM images", href: "https://github.com/USACE/cwbi-wm-images" },
      ]}
      navRight={<div className="batch-header-actions flex shrink-0 items-center gap-1 whitespace-nowrap py-1" aria-label="Account and notifications">
      {auth.isAuth && <WarningIndicator />}
      <Button type="button" className="gw-px-2 gw-shrink-0" aria-label={office ? `${office} GitHub` : "GitHub"} disabled={!auth.isAuth || !repositoryUrl} title={repositoryButtonTitle(office, repositoryUrl, repository)}
        onClick={() => setGithubOpen(true)}><FaGithub aria-hidden /> <span className="hidden min-[1100px]:inline">{office ? `${office} GitHub` : "GitHub"}</span></Button>
      <AuthButton />
    </div>}>
      <Modal opened={githubOpen} onClose={() => setGithubOpen(false)} dialogTitle="Open GitHub repository?"
        buttons={<div className="flex flex-wrap items-center gap-3 [&_button]:inline-flex [&_button]:items-center [&_button]:gap-2">
          <Button type="button" onClick={() => setGithubOpen(false)}>Cancel</Button>
          <Button type="button" disabled={!repositoryUrl} onClick={() => { setGithubOpen(false); if (repositoryUrl) window.open(repositoryUrl, "_blank", "noopener,noreferrer"); }}>Continue to GitHub</Button>
        </div>}>
        <p>Are you sure you wish to navigate to the GitHub jobs repository for {office}?</p>
        <p className="my-3 break-all font-medium">{repositoryUrl}</p>
        <p>You must be logged in to GitHub with access to the repository to view it. It will open in a new tab.</p>
      </Modal>
      <Container className="min-w-0 w-full">
        <div className="min-w-0 my-6"><PageErrorBoundary key={location.pathname}>{children}</PageErrorBoundary></div>
      </Container>
    </SiteWrapper>
  );
}

function RootComponent() {
  return <Outlet />;
}

function RootErrorComponent({ error, reset }: ErrorComponentProps) {
  return <RequestErrorPage error={error} onRetry={reset} />;
}
