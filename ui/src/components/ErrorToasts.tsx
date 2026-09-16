import { useEffect, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { dismissToast, getNotifications, subscribe } from "../utils/errorNotifications";

export default function ErrorToasts() {
  const notifications = useSyncExternalStore(subscribe, getNotifications);
  const [container, setContainer] = useState<Element>(document.body);
  const [summaryOpen, setSummaryOpen] = useState(false);
  useEffect(() => {
    // Native modal dialogs make content outside their top layer inaccessible.
    const updateContainer = () => {
      const dialogs = document.querySelectorAll('dialog[open], [role="dialog"][aria-modal="true"]');
      const activeDialog = dialogs[dialogs.length - 1];
      // Headless UI treats clicks outside its panel as dismissal, even when
      // the notification is inside the dialog's outer element.
      setContainer(activeDialog?.querySelector('[id^="headlessui-dialog-panel"]') ?? activeDialog ?? document.body);
      setSummaryOpen(Boolean(activeDialog?.querySelector("[data-error-summary]")));
    };
    const observer = new MutationObserver(updateContainer);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["open", "aria-modal"] });
    updateContainer();
    return () => observer.disconnect();
  }, []);
  return createPortal(<section aria-label="Notifications" hidden={summaryOpen} className="pointer-events-none fixed right-4 bottom-4 z-[10000] flex max-h-[70vh] w-[calc(100%-2rem)] max-w-md flex-col gap-3 overflow-y-auto">
    {notifications.filter(item => item.kind !== "warning" && !item.toastDismissed).map(item => <div key={item.id} role="alert" className="pointer-events-auto rounded-lg border border-red-300 bg-white p-4 text-slate-900 shadow-lg">
      <div className="flex items-start justify-between gap-3">
        <p className="font-semibold text-red-800">Request failed</p>
        <button type="button" aria-label="Dismiss notification" className="shrink-0 rounded px-2 text-xl hover:bg-slate-100 focus-visible:outline-2" onClick={() => dismissToast(item.id)}>×</button>
      </div>
      <p className="mt-1 break-words text-sm">{item.message}</p>
      {item.retry && <button type="button" className="mt-3 rounded bg-blue-700 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-800 focus-visible:outline-2" onClick={() => { void item.retry?.(); }}>Try again</button>}
    </div>)}
  </section>, container);
}
