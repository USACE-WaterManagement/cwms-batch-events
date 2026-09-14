import { useState, useSyncExternalStore } from "react";
import { Button, Modal } from "@usace/groundwork";
import { MdWarningAmber } from "react-icons/md";
import { getNotifications, subscribe } from "../utils/errorNotifications";
import type { RepositoryWarning } from "../features/scripts-manager/useRepositoryFiles";

export function WarningIndicator({ warnings, onRefresh, refreshing }: {
  warnings: RepositoryWarning[]; onRefresh: () => void; refreshing: boolean;
}) {
  const [open, setOpen] = useState(false);
  const notifications = useSyncExternalStore(subscribe, getNotifications);
  const messages = [...new Set([...warnings.map(item => item.message), ...notifications.map(item => item.message)])];
  return <>
    {messages.length > 0 && <button type="button" aria-label={`View warnings and errors (${messages.length})`}
      title="View warnings and errors" onClick={() => setOpen(true)}
      className="inline-flex items-center gap-1 rounded border border-amber-400 bg-amber-50 px-3 py-2 font-semibold text-amber-900 hover:bg-amber-100 focus-visible:outline-2">
      <MdWarningAmber aria-hidden className="size-5" />{messages.length}
    </button>}
    <Modal opened={open} onClose={() => setOpen(false)} dialogTitle="Warnings and errors"
      buttons={<div className="flex flex-wrap justify-end gap-3">
        <Button type="button" disabled={refreshing} onClick={onRefresh}>Check again</Button>
        <Button type="button" onClick={() => setOpen(false)}>Close</Button>
      </div>}>
      <div className="max-h-[60dvh] space-y-3 overflow-y-auto overscroll-contain">
        {messages.length ? messages.map(message => <p key={message} className="break-words rounded border border-amber-200 bg-amber-50 p-3 text-amber-950">{message}</p>) : <p>No current warnings.</p>}
        <p className="text-sm text-gray-600">Repository browsing is optional. You can type a script or JAR path without it. Job execution uses the runner’s repository access separately.</p>
      </div>
    </Modal>
  </>;
}
