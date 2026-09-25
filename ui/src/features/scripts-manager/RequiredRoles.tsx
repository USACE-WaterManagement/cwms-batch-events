import { Link } from "@tanstack/react-router";
import { MdHelpOutline } from "react-icons/md";

export function RequiredRoles({ office, roles }: { office: string; roles: string[] }) {
  const extra = roles.filter(role => role !== "CWMS Users");
  const additional = !roles.includes("CWMS Users") && extra.length > 0;
  return <div className="space-y-3 text-sm">
    <p><strong>Required in {office}:</strong> <span className="rounded bg-blue-50 px-2 py-1 text-blue-900">CWMS Users</span></p>
    {roles.length > 0 && <div><p className="mb-2 font-semibold">{additional ? "Also requires any one of:" : "Configured execution roles (any one):"}</p><ul className="flex flex-wrap gap-2">{roles.map(role => <li key={role} className="rounded bg-slate-100 px-2 py-1">{role}</li>)}</ul></div>}
    {!additional && <p className="text-slate-600">CWMS Users satisfies this job's execution role requirements.</p>}
    <Link to="/about/controls" className="action-link"><MdHelpOutline aria-hidden />Role requirements</Link>
  </div>;
}
