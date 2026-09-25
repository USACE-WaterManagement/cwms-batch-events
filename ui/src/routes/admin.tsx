import { createFileRoute } from "@tanstack/react-router";
import { useAuth } from "@usace-watermanagement/groundwork-water";
import { useSystemAdmin } from "../features/auth/useSystemAdmin";
import { OperationsDashboard } from "../features/admin/OperationsDashboard";

export const Route = createFileRoute("/admin")({ component: Admin });

function Admin() {
  const auth = useAuth();
  const access = useSystemAdmin();
  if (!auth.isAuth) return <p>Sign in with the HQ CWMS Admin role to view administration.</p>;
  if (access.isPending) return <p>Checking admin access…</p>;
  if (access.isError || access.data !== true) return <p role="alert">The HQ CWMS Admin role is required.</p>;
  return <OperationsDashboard />;
}
