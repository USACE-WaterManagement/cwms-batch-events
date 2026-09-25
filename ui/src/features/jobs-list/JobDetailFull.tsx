import { RequestErrorPage } from "../../shared/components/StatePage";
import { LoadingRows } from "../../shared/components/LoadingRows";
import { MdArrowBack, MdOpenInNew } from "react-icons/md";
import JobDetail from "./JobDetail";
import JobLogs from "./JobLogs";
import useJobDetails from "./useJobDetails";
import { Link } from "@tanstack/react-router";
import { ShareJob } from "./ShareJob";
import useAdminOffices from "../scripts-manager/useAdminOffices";
import { useAuth } from "@usace-watermanagement/groundwork-water";
import LoginPrompt from "../auth/LoginPrompt";

interface JobDetailFullProps {
  jobId: string;
  standalone?: boolean;
}

const JobDetailFull = ({ jobId, standalone = false }: JobDetailFullProps) => {
  const { data, isPending, isError, error, refetch } = useJobDetails(jobId);
  const admins = useAdminOffices();
  const auth = useAuth();

  if (!auth.isAuth) return <LoginPrompt title="Sign in to view this job" description="This job log is shared with users who have access to its office." />;
  if (isPending) return <LoadingRows label="Loading job" />;
  if (isError) return <RequestErrorPage error={error} onRetry={() => void refetch()} />;
  if (!data) return null;

  return (
    <>
      <nav aria-label="Job navigation" className="mb-2 flex flex-wrap items-start justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 p-2">
        <div className="flex flex-wrap gap-2 text-sm font-medium text-blue-700">
          {standalone && <Link to="/jobs" className="action-link"><MdArrowBack aria-hidden />Job History</Link>}
          {standalone && data.scriptId && admins.data?.includes(data.office) && <Link to="/scripts-manager" search={{ office: data.office, scriptId: data.scriptId, jobId }} className="action-link"><MdArrowBack aria-hidden />Back to script view</Link>}
          {standalone && data.scriptId && !admins.isPending && !admins.data?.includes(data.office) && <Link to="/submit" search={{ office: data.office, scriptId: data.scriptId }} className="action-link"><MdArrowBack aria-hidden />Back to script view</Link>}
          {!standalone && <Link to="/jobs/$jobId" params={{ jobId }} className="action-link"><MdOpenInNew aria-hidden />Open job page</Link>}
        </div>
        <ShareJob key={jobId} jobId={jobId} />
      </nav>
      <JobDetail job={data} />
      <JobLogs key={jobId} jobId={jobId} status={data.jobStatus} batchStatus={data.batchStatus} endTime={data.endTime} />
    </>
  );
};

export default JobDetailFull;
