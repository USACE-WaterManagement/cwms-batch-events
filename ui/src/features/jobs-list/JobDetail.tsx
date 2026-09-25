import { PropsWithChildren } from "react";
import LoadingSpinner from "../../shared/components/LoadingSpinner";
import { JobDetails } from "./useJobDetails";
import { jobStatusLabel } from "./jobStatus";
import { RunTriggerBadge } from "./RunAttribution";
import { submittedBy } from "./submittedBy";

const jobFields: (keyof JobDetails)[] = [
  "scriptName",
  "username",
  "runTrigger",
  "jobStatus",
  "office",
  "createdTime",
  "runTime",
  "endTime",
  "id",
];

const wideFields: (keyof JobDetails)[] = ["id"];

const fieldLabels: Partial<Record<keyof JobDetails, string>> = {
  scriptName: "Script", username: "Submitted by", jobStatus: "Status", office: "Office",
  runTrigger: "Trigger",
  createdTime: "Submitted", runTime: "Started", endTime: "Finished", id: "Run ID",
};

interface JobDetailProps {
  job: JobDetails;
}

function JobDetail({ job }: JobDetailProps) {
  return (
    <div className="@container/job-details min-w-0 grow">
      <div className="job-detail-fields grid min-w-0 grow grid-cols-2 gap-x-3 gap-y-1 py-2 text-sm @min-[40rem]/job-details:grid-cols-3">
        {jobFields.map((field) => {
          const className = wideFields.includes(field)
            ? "col-span-full font-mono text-xs"
            : "";
          return (
            <JobDetailField key={field} field={fieldLabels[field] ?? field} className={className}>
              {field === "username" ? submittedBy(job) : field === "runTrigger" ? <RunTriggerBadge job={job} /> : field === "jobStatus" ? (
                job.jobStatus !== "Completed" && job.jobStatus !== "Failed" ? (
                  <span className="inline-flex items-center gap-2">
                    <span>{jobStatusLabel(job)}</span>
                    <LoadingSpinner />
                  </span>
                ) : (
                  job.jobStatus
                )
              ) : (
                field === "createdTime" || field === "runTime" || field === "endTime"
                  ? (job[field] ? new Date(job[field]).toLocaleString() : "—")
                  : job[field]
              )}
            </JobDetailField>
          );
        })}
      </div>
      {job.batchStatusReason && <p className="px-3 pb-3 text-sm text-gray-600">{job.batchStatusReason}</p>}
      {job.scheduledFor && <div className="px-3 pb-3 text-sm">
        <p><strong>Scheduled for:</strong> {new Date(job.scheduledFor).toLocaleString(undefined, { timeZone: job.scheduleTimezone || "UTC" })} ({job.scheduleTimezone || "UTC"})</p>
        <p><strong>Schedule configured by:</strong> {job.scheduleAuthor || "Name unavailable"}</p>
        {job.dispatchClaimedAt && !job.externalJobId && job.jobStatus === "Pending" && <p className="mt-2 text-amber-900">Dispatch was claimed, but an AWS job ID has not been recorded. If this persists, inspect dispatcher logs before rerunning.</p>}
      </div>}
    </div>
  );
}

interface JobDetailFieldProps {
  field: string;
  className?: string;
}

const JobDetailField = ({
  field,
  className,
  children,
}: PropsWithChildren<JobDetailFieldProps>) => (
  <span className={`min-w-0 [overflow-wrap:anywhere] px-1 py-1 ${className}`}>
    <strong className="mr-1 font-medium text-slate-500">{field}:</strong> {children}
  </span>
);

export default JobDetail;
