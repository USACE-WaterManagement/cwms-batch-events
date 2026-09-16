import JobDetail from "./JobDetail";
import JobLogs from "./JobLogs";
import useJobDetails from "./useJobDetails";

interface JobDetailFullProps {
  jobId: string;
}

const JobDetailFull = ({ jobId }: JobDetailFullProps) => {
  const { data, isPending, isError } = useJobDetails(jobId);

  if (isPending) return <span>Loading...</span>;
  if (isError) return <span>Error!</span>;
  if (!data) return null;

  return (
    <>
      <JobDetail job={data} />
      <JobLogs key={jobId} jobId={jobId} status={data.jobStatus} batchStatus={data.batchStatus} />
    </>
  );
};

export default JobDetailFull;
