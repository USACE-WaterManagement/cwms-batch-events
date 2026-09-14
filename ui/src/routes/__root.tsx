import { useState, type ReactNode } from "react";
import { FaGithub } from "react-icons/fa";
import {
  createRootRoute,
  Outlet,
  type ErrorComponentProps,
} from "@tanstack/react-router";
import { Button, Card, Container, H1, Modal, SiteWrapper, Text } from "@usace/groundwork";
import { useAuth } from "@usace-watermanagement/groundwork-water";
import AuthButton from "../features/auth/AuthButton";
import { useRememberedOffice } from "../shared/hooks/useRememberedOffice";
import { useRepositoryFiles, useRepositoryStatus } from "../features/scripts-manager/useRepositoryFiles";
import { WarningIndicator } from "../components/WarningIndicator";
import useAdminOffices from "../features/scripts-manager/useAdminOffices";

const primaryLinks = [
  { id: "jobs", text: "Jobs List", href: "/jobs" },
  { id: "submit", text: "Submit Job", href: "/submit" },
  { id: "manager", text: "Scripts Manager", href: "/scripts-manager" },
];

const publicAboutLinks = [
  { id: "about", text: "About", href: "/about" },
  { id: "controls", text: "Controls", href: "/about/controls" },
];

const helpLinks = [
  { id: "onboarding", text: "Onboarding", href: "/help/onboarding" },
  { id: "script-files", text: "Script setup", href: "/help/script-files" },
];

const authenticatedAboutLinks = [
  { id: "version", text: "Version", href: "/about/version" },
];

export const Route = createRootRoute({
  shellComponent: RootShell,
  component: RootComponent,
  errorComponent: RootErrorComponent,
  onCatch: (error) => {
    console.error("Unhandled application error", error);
  },
});

function RootShell({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const [githubOpen, setGithubOpen] = useState(false);
  const [office] = useRememberedOffice([]);
  const adminOffices = useAdminOffices();
  const canBrowse = Boolean(office && adminOffices.data?.includes(office));
  const catalog = useRepositoryFiles(office ?? "", canBrowse);
  const repositoryStatus = useRepositoryStatus();
  const warnings = [...(repositoryStatus.data?.warnings ?? []), ...(catalog.data?.warnings ?? [])];
  if (repositoryStatus.isError || catalog.isError) warnings.push({ code: "repository_request_failed", message: "Repository information could not be loaded. Manual path entry is available." });
  const repository = catalog.data?.repository;
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
  const navLinks = [...primaryLinks, aboutLink, helpLink];

  return (
    <SiteWrapper links={navLinks} navRight={<div className="flex flex-wrap items-center gap-3 [&_button]:inline-flex [&_button]:items-center [&_button]:gap-2">
      {auth.isAuth && <WarningIndicator warnings={warnings} refreshing={repositoryStatus.isFetching || catalog.isFetching}
        onRefresh={() => { void repositoryStatus.refetch(); if (canBrowse) void catalog.refetch(); }} />}
      <Button type="button" disabled={!auth.isAuth || !repositoryUrl} title={!office ? "Select an office to open its repository" : !repositoryUrl ? `Repository unavailable for ${office}` : `Open ${repository}`}
        onClick={() => setGithubOpen(true)}><FaGithub aria-hidden /> {office ? `${office} GitHub` : "GitHub"}</Button>
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
      <Container>
        <div className="my-6">{children}</div>
      </Container>
    </SiteWrapper>
  );
}

function RootComponent() {
  return <Outlet />;
}

function RootErrorComponent({ error }: ErrorComponentProps) {
  return (
    <Card role="alert" className="mx-auto max-w-3xl border-red-200 p-6 sm:p-8">
      <H1>We couldn't load this page</H1>
      <Text className="mt-3">
        An unexpected error occurred. Reload the page and try again. If the problem continues,
        contact your Batch Events administrator.
      </Text>
      <Button className="mt-5" onClick={() => window.location.reload()}>
        Reload page
      </Button>

      {import.meta.env.DEV ? (
        <details className="mt-6 rounded border border-slate-200 bg-slate-50 p-4">
          <summary className="cursor-pointer font-medium">Development details</summary>
          <pre className="mt-3 overflow-auto whitespace-pre-wrap text-sm text-red-800">
            {error instanceof Error ? error.message : String(error)}
          </pre>
        </details>
      ) : null}
    </Card>
  );
}
