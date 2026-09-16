import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/about_/script-files")({
  beforeLoad: () => { throw redirect({ to: "/help/script-files", replace: true }); },
});
