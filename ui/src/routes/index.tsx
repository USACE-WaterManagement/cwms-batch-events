import { createFileRoute, Link } from "@tanstack/react-router";
import { useAuth } from "@usace-watermanagement/groundwork-water";
import { Button, Card, H1, H2, Text } from "@usace/groundwork";
import { FiArrowRight, FiBookOpen, FiInfo, FiLogIn } from "react-icons/fi";
import JobsList from "../features/jobs-list/JobsList";

export const Route = createFileRoute("/")({
  component: HomePage,
});

function HomePage() {
  const auth = useAuth();

  if (auth.isAuth) {
    return <JobsList />;
  }

  return (
    <main className="mx-auto max-w-5xl py-8 sm:py-12">
      <div className="text-center">
        <H1>Welcome to CWMS Batch Events</H1>
        <div className="mx-auto mt-4 flex max-w-2xl justify-center px-4 text-center">
          <Text className="w-full text-center text-lg">
            Learn how office batch jobs are defined and run, or sign in to access the jobs
            available to your office.
          </Text>
        </div>
      </div>

      <Card className="mx-auto mt-10 max-w-xl overflow-hidden border-blue-200 bg-white p-0 text-center shadow-md">
        <div className="h-1.5 bg-blue-700" />
        <div className="p-6 sm:p-8">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 text-blue-700">
            <FiLogIn aria-hidden="true" className="h-6 w-6" />
          </div>
          <H2>Sign in to Batch Events</H2>
          <Text className="mx-auto mt-3 max-w-md">
            Your CDA office roles determine which jobs you can run and maintain.
          </Text>
          <div className="mt-6 flex justify-center">
            <Button className="flex items-center gap-2" onClick={auth.login}>
              <FiLogIn aria-hidden="true" />
              Login
            </Button>
          </div>
        </div>
      </Card>

      <div aria-label="Public Batch Events information" className="mt-8 grid gap-5 md:grid-cols-2">
        <Card className="h-full overflow-hidden border-slate-200 bg-white p-0 shadow-sm transition-shadow hover:shadow-md">
          <div className="h-1 bg-blue-700" />
          <div className="p-6">
            <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
              <FiInfo aria-hidden="true" className="h-5 w-5" />
            </div>
            <H2>About Batch Events</H2>
            <Text className="mt-2">See what the application does and how office access works.</Text>
            <Link
              to="/about"
              className="mt-5 inline-flex items-center gap-2 font-semibold text-blue-700 underline decoration-blue-300 underline-offset-4"
            >
              Open About
              <FiArrowRight aria-hidden="true" />
            </Link>
          </div>
        </Card>
        <Card className="h-full overflow-hidden border-slate-200 bg-white p-0 shadow-sm transition-shadow hover:shadow-md">
          <div className="h-1 bg-emerald-600" />
          <div className="p-6">
            <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
              <FiBookOpen aria-hidden="true" className="h-5 w-5" />
            </div>
            <H2>New user onboarding</H2>
            <Text className="mt-2">Follow the steps for preparing, defining, and running a job.</Text>
            <Link
              to="/help/onboarding"
              className="mt-5 inline-flex items-center gap-2 font-semibold text-blue-700 underline decoration-blue-300 underline-offset-4"
            >
              Open Onboarding
              <FiArrowRight aria-hidden="true" />
            </Link>
          </div>
        </Card>
      </div>
    </main>
  );
}
