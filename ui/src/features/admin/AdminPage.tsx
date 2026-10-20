import { useLocation } from "@tanstack/react-router";
import { useAuth } from "@usace-watermanagement/groundwork-water/auth/useAuth";
import { StatePage, RequestErrorPage } from "../../shared/components/StatePage";
import LoginPrompt from "../auth/LoginPrompt";
import { useSystemAdmin } from "../auth/useSystemAdmin";
import { OperationsDashboard, type AdminTab } from "./OperationsDashboard";

export function AdminPage({ tab }: { tab: AdminTab }) {
  const auth = useAuth();
  const access = useSystemAdmin();
  const location = useLocation();
  const routeTab = location.pathname.match(/^\/admin\/(operations|usage|scheduler|queues|rate-limits)$/)?.[1] as AdminTab | undefined;

  if (!auth.isAuth) {
    return <LoginPrompt title="Sign in to view administration" description="The HQ Data Acquisition Mgr role is required." />;
  }
  if (access.isPending) return <p>Checking admin access…</p>;
  if (access.isError) return <RequestErrorPage error={access.error} onRetry={() => void access.refetch()} />;
  if (access.data !== true) {
    return <StatePage kind="access" title="Administration access required"><p>The HQ Data Acquisition Mgr role is required. Contact your HQ administrator to request access.</p></StatePage>;
  }
  return <OperationsDashboard initialTab={routeTab ?? tab} />;
}

export function AdminLoading() {
  return <p>Loading administration…</p>;
}
