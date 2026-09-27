import { StatePage, RequestErrorPage } from "../shared/components/StatePage";
import LoginPrompt from "../features/auth/LoginPrompt";
import { createFileRoute } from "@tanstack/react-router";
import { useAuth } from "@usace-watermanagement/groundwork-water";
import { useSystemAdmin } from "../features/auth/useSystemAdmin";
import { OperationsDashboard } from "../features/admin/OperationsDashboard";

export const Route = createFileRoute("/admin")({ component: Admin });

function Admin() {
  const auth = useAuth();
  const access = useSystemAdmin();
  if (!auth.isAuth) return <LoginPrompt title="Sign in to view administration" description="The HQ Data Acquisition Mgr role is required." />;
  if (access.isPending) return <p>Checking admin access…</p>;
  if (access.isError) return <RequestErrorPage error={access.error} onRetry={() => void access.refetch()} />;
  if (access.data !== true) return <StatePage kind="access" title="Administration access required"><p>The HQ Data Acquisition Mgr role is required. Contact your HQ administrator to request access.</p></StatePage>;
  return <OperationsDashboard />;
}
