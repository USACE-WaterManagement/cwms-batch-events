import { useState, useSyncExternalStore } from "react";
import { Button, Modal } from "@usace/groundwork";
import { MdCheckCircleOutline, MdWarningAmber } from "react-icons/md";
import { ServerLogs } from "./ServerLogs";
import { dismissError, getNotifications, subscribe } from "../utils/errorNotifications";

export function WarningIndicator() {
  const [open, setOpen] = useState(false);
  const [checking, setChecking] = useState(false);
  const notifications = useSyncExternalStore(subscribe, getNotifications);
  const checkAgain = async () => {
    setChecking(true);
    try {
      await Promise.allSettled(notifications.flatMap(item => item.retry ? [item.retry()] : []));
    } finally {
      setChecking(false);
    }
  };
  return <>
    <button type="button" aria-label={notifications.length ? `View warnings and errors (${notifications.length})` : "View server logs — no current warnings"}
      title="Warnings and server logs" onClick={() => setOpen(true)}
      className={`inline-flex h-10 shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded border px-2 text-sm font-semibold focus-visible:outline-2 ${notifications.length ? "border-amber-400 bg-amber-50 text-amber-900 hover:bg-amber-100" : "border-green-400 bg-green-50 text-green-900 hover:bg-green-100"}`}>
      {notifications.length ? <><MdWarningAmber aria-hidden className="size-5 shrink-0" />{notifications.length}</> : <MdCheckCircleOutline aria-hidden className="size-5 shrink-0" />}
    </button>
    <Modal opened={open} onClose={() => setOpen(false)} dialogTitle="Warnings and errors"
      buttons={<div className="flex flex-wrap justify-end gap-3">
        <Button type="button" disabled={checking || !notifications.some(item => item.retry)} onClick={() => void checkAgain()}>Check again</Button>
        <Button type="button" onClick={() => setOpen(false)}>Close</Button>
      </div>}>
      <div data-error-summary className="max-h-[60dvh] space-y-3 overflow-y-auto overscroll-contain whitespace-normal">
        {notifications.length > 0 && <p className="text-sm text-gray-600">Repeated messages appear once. Check again refreshes affected information. Retry saves and job submissions from their forms.</p>}
        {notifications.length ? <ul className="space-y-3" aria-label="Warnings and errors">
          {notifications.map(item => <li key={item.id} className="rounded border border-amber-200 bg-amber-50 p-3 text-amber-950">
            <p className="break-words">{item.message}</p>
            <button type="button" className="mt-2 rounded px-2 py-1 text-sm font-semibold underline focus-visible:outline-2" onClick={() => dismissError(item.id)}>Dismiss</button>
          </li>)}
        </ul> : <p>No current warnings or errors.</p>}
        {open && <ServerLogs />}
      </div>
    </Modal>
  </>;
}
