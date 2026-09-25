import { Component, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { MdLockOutline, MdErrorOutline, MdSearchOff, MdRefresh, MdArrowBack, MdHelpOutline } from "react-icons/md";
import { ApiError } from "../../utils/fetchWithAuth";

type Kind = "access" | "missing" | "warning" | "error";

export function StatePage({ kind = "error", title, children, onRetry }: {
  kind?: Kind; title: string; children: ReactNode; onRetry?: () => void;
}) {
  let Icon = MdErrorOutline;
  let accent = "border-red-700 bg-red-50 text-red-950";
  if (kind === "access") { Icon = MdLockOutline; accent = "border-amber-700 bg-amber-50 text-amber-950"; }
  if (kind === "missing") { Icon = MdSearchOff; accent = "border-slate-600 bg-slate-50 text-slate-900"; }
  if (kind === "warning") accent = "border-amber-700 bg-amber-50 text-amber-950";
  return <section role="alert" className={`mx-auto my-6 max-w-3xl rounded-xl border border-l-8 p-6 sm:p-8 ${accent}`}>
    <Icon aria-hidden className="mb-4 size-10" />
    <h1 className="text-2xl font-bold">{title}</h1>
    <div className="mt-3 space-y-3 text-base leading-relaxed">{children}</div>
    <nav aria-label="Recovery options" className="mt-6 flex flex-wrap gap-3">
      {onRetry && <button className="action-link" onClick={onRetry}><MdRefresh aria-hidden />Try again</button>}
      <Link to="/jobs" className="action-link"><MdArrowBack aria-hidden />Job History</Link>
      <Link to="/help/onboarding" className="action-link"><MdHelpOutline aria-hidden />Access and onboarding</Link>
    </nav>
  </section>;
}

export function RequestErrorPage({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  if (error instanceof ApiError && error.status === 403) return <StatePage kind="access" title="You do not have access" onRetry={onRetry}>
    <p>{error.office ? `Request access from the ${error.office} script admin. You need CWMS Users in ${error.office} to view this job and its output.` : "Ask your office script admin to review your access."}</p>
    <p>After access is granted, sign in again and reopen this link.</p>
  </StatePage>;
  if (error instanceof ApiError && error.status === 404) return <StatePage kind="missing" title="Job not found">
    <p>This job may have been removed, or the shared link may be incorrect. Check the link with the person who shared it.</p>
  </StatePage>;
  if (error instanceof ApiError && error.status === 401) return <StatePage kind="access" title="Your session has expired">
    <p>Sign in again using the account menu, then reopen this page.</p>
  </StatePage>;
  if (error instanceof ApiError && error.status === 422) return <StatePage kind="warning" title="This link or selection is invalid">
    <p>Check the job ID and date range, or return to Job History to select a run.</p>
  </StatePage>;
  return <StatePage title="We couldn't load this page" onRetry={onRetry}>
    <p>The service may be temporarily unavailable. Check your connection and try again. If the problem continues, contact your Batch Events administrator.</p>
  </StatePage>;
}

// Rendering failures and expected HTTP states share the same recovery layout.
export class PageErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (this.state.failed) return <RequestErrorPage error={null} onRetry={() => this.setState({ failed: false })} />;
    return this.props.children;
  }
}
