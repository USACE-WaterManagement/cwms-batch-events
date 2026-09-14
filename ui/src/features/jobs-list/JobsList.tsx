import { useAuth } from "@usace-watermanagement/groundwork-water";
import { Accordion, Button, H1 } from "@usace/groundwork";
import useJobsList from "./useJobsList";
import { Link } from "@tanstack/react-router";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import JobDetail from "./JobDetail";
import LoginPrompt from "../auth/LoginPrompt";

dayjs.extend(relativeTime);

const JobsList = () => {
  const auth = useAuth();
  const { data: jobs, isLoading, isError } = useJobsList();

  if (!auth.isAuth) {
    return (
      <LoginPrompt
        title="Sign in to view job history"
        description="Review the jobs you submitted, including their current status and output."
      />
    );
  }

  if (isError) return <section><H1>Job History</H1><p role="alert">Error occurred while fetching job history.</p></section>;

  if (isLoading) return <section><H1>Job History</H1><p role="status">Loading job history...</p></section>;

  if (!jobs || jobs.length <= 0)
    return (
      <section><H1>Job History</H1><p className="mt-4">
        No jobs found! You can submit a job{" "}
        <span className="underline">
          <Link to="/submit">here</Link>
        </span>
        .
      </p></section>
    );

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <H1>Job History</H1>
      <p>Jobs submitted by your account, with their status and output.</p>
      {jobs.map((job) => {
        const dateAgo = dayjs(job.createdTime).fromNow();
        return (
          <Accordion
            key={job.id}
            heading={
              <span className="flex justify-between w-full gap-1">
                <span>
                  {job.scriptName} ({dateAgo})
                </span>
                <span>{job.jobStatus}</span>
              </span>
            }
          >
            <div className="flex">
              <JobDetail job={job} />
              <Link
                to={`/jobs/$jobId`}
                params={{ jobId: job.id }}
                className="px-4 pb-4 content-end"
              >
                <Button>Details</Button>
              </Link>
            </div>
          </Accordion>
        );
      })}
    </div>
  );
};

export default JobsList;
