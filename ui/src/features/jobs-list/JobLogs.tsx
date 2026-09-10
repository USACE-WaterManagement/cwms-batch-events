import useJobLogs from "./useJobLogs";
import { Textarea } from "@usace/groundwork";

interface JobLogsProps {
  jobId: string;
  disabled?: boolean;
}

const JobLogs = ({ jobId, disabled = false }: JobLogsProps) => {
  const { data, error, isLoading, isError } = useJobLogs(jobId, !disabled);

  let message: string;
  if (disabled) message = "Logs unavailable until job is finished";
  else if (isLoading) message = "Loading logs...";
  else if (isError) message = error?.message ?? "Error loading logs!";
  else if (!data) message = "No logs found!";
  else message = data.logs;

  return (
    <Textarea
      readOnly
      value={message}
      disabled={disabled}
      className="w-full h-96"
    />
  );
};

export default JobLogs;
