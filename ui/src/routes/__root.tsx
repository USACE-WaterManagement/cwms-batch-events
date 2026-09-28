import type { ReactNode } from "react";
import {
  createRootRoute,
  Outlet,
  type ErrorComponentProps,
} from "@tanstack/react-router";
import { Button, Card, Container, H1, SiteWrapper, Text } from "@usace/groundwork";
import { useAuth } from "@usace-watermanagement/groundwork-water";
import "@usace/groundwork/dist/groundwork.css";
import AuthButton from "../features/auth/AuthButton";
import { useApplicationInfo } from "../features/about/useAboutInfo";

const primaryLinks = [
  { id: "jobs", text: "Jobs List", href: "/jobs" },
  { id: "submit", text: "Submit Job", href: "/submit" },
  { id: "manager", text: "Scripts Manager", href: "/scripts-manager" },
  { id: "dependencies", text: "Dependencies", href: "/dependencies" },
];

const publicAboutLinks = [
  { id: "about", text: "About", href: "/about" },
  { id: "controls", text: "Controls", href: "/about/controls" },
  { id: "onboarding", text: "Onboarding", href: "/about/onboarding" },
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
  const application = useApplicationInfo();
  const aboutLink = {
    id: "about-menu",
    text: "About",
    href: "/about",
    children: auth.isAuth
      ? [...publicAboutLinks, ...authenticatedAboutLinks]
      : publicAboutLinks,
  };
  const navLinks = [
    ...primaryLinks.filter(
      (link) =>
        link.id !== "dependencies" ||
        (application.data?.user.offices.length ?? 0) > 0,
    ),
    aboutLink,
  ];

  return (
    <SiteWrapper links={navLinks} navRight={<AuthButton />}>
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
