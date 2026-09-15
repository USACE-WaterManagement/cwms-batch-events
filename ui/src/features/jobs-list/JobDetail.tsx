import { PropsWithChildren } from "react";
import LoadingSpinner from "../../shared/components/LoadingSpinner";
import { JobDetails } from "./useJobDetails";
import { jobStatusLabel } from "./jobStatus";

const jobFields: (keyof JobDetails)[] = [
  "scriptName",
  "username",
  "jobStatus",
  "office",
  "createdTime",
  "runTime",
  "endTime",
  "id",
];

const wideFields: (keyof JobDetails)[] = [
  "createdTime",
  "runTime",
  "endTime",
  "id",
];

const fieldLabels: Partial<Record<keyof JobDetails, string>> = {
  scriptName: "Script", username: "Submitted by", jobStatus: "Status", office: "Office",
  createdTime: "Submitted", runTime: "Started", endTime: "Finished", id: "Run ID",
};

interface JobDetailProps {
  job: JobDetails;
}

function JobDetail({ job }: JobDetailProps) {
  return (
    <div className="@container/job-details min-w-0 grow">
      <div className="job-detail-fields grid min-w-0 grow grid-cols-1 gap-x-4 gap-y-1 py-3 @min-[32rem]/job-details:grid-cols-2">
        {jobFields.map((field) => {
          const className = wideFields.includes(field)
            ? "col-span-full"
            : "";
          return (
            <JobDetailField key={field} field={fieldLabels[field] ?? field} className={className}>
              {field === "jobStatus" ? (
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
  <span className={`min-w-0 [overflow-wrap:anywhere] px-3 py-1.5 ${className}`}>
    <strong className="block">{field}:</strong> {children}
  </span>
);

export default JobDetail;
