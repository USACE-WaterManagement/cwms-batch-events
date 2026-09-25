import { createFileRoute } from "@tanstack/react-router";
import { useAuth } from "@usace-watermanagement/groundwork-water";
import { useSystemAdmin } from "../features/auth/useSystemAdmin";
import { SchedulerStatus } from "../features/scripts-manager/SchedulerStatus";

export const Route = createFileRoute("/admin")({ component: Admin });

function Admin() {
  const auth = useAuth();
  const access = useSystemAdmin();
  if (!auth.isAuth) return <p>Sign in with the HQ CWMS Admin role to view administration.</p>;
  if (access.isPending) return <p>Checking admin access…</p>;
  if (access.isError || access.data !== true) return <p role="alert">The HQ CWMS Admin role is required.</p>;
  return <section><h1 className="text-2xl font-bold">Administration</h1><h2 className="mt-5 text-lg font-semibold">Scheduler — all offices</h2><SchedulerStatus /></section>;
}
