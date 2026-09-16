import { createFileRoute } from "@tanstack/react-router";
import { AboutPage } from "../features/about/AboutPage";

export const Route = createFileRoute("/help_/onboarding")({
  component: () => <AboutPage initialTab="onboarding" />,
});
