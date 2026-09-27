import { createFileRoute } from "@tanstack/react-router";
import { AboutPage } from "../features/about/AboutPage";

export const Route = createFileRoute("/about_/version")({
  component: () => <AboutPage initialTab="version" />,
});
