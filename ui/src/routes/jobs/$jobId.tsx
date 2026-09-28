import { createFileRoute } from "@tanstack/react-router";
import JobDetailFull from "../../features/jobs-list/JobDetailFull";

export const Route = createFileRoute("/jobs/$jobId")({
  component: JobDetailPage,
});

function JobDetailPage() {
  const { jobId } = Route.useParams();

  return <JobDetailFull jobId={jobId} standalone />;
}
