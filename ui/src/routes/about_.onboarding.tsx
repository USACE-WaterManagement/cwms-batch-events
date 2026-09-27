import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/about_/onboarding")({
  beforeLoad: () => { throw redirect({ to: "/help/onboarding", replace: true }); },
});
