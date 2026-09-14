import { PropsWithChildren } from "react";
import LoadingSpinner from "../../shared/components/LoadingSpinner";
import { JobDetails } from "./useJobDetails";

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
    <>
      <div className="min-w-0 grow grid grid-cols-1 gap-x-4 py-3 sm:grid-cols-2">
        {jobFields.map((field) => {
          const className = wideFields.includes(field)
            ? "sm:col-span-2"
            : "col-span-1";
          return (
            <JobDetailField key={field} field={fieldLabels[field] ?? field} className={className}>
              {field === "jobStatus" ? (
                job.jobStatus !== "Completed" && job.jobStatus !== "Failed" ? (
                  <span className="inline-flex items-center gap-2">
                    <span>{job.jobStatus}</span>
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
    </>
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
  <span className={`min-w-0 break-words px-3 py-1.5 ${className}`}>
    <strong>{field}</strong>: {children}
  </span>
);

export default JobDetail;
