export interface ErrorNotification {
  id: string;
  message: string;
  kind?: "error" | "warning";
  retry?: () => void | Promise<unknown>;
  toastDismissed?: boolean;
}

let notifications: ErrorNotification[] = [];
// Keep request sources separately so one recovery cannot clear another failure.
const sources = new Map<string, ErrorNotification[]>();
const hiddenToasts = new Set<string>();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(listener => listener());
const normalize = (message: string) => message.trim().replace(/\s+/g, " ");

function update() {
  const groups = new Map<string, ErrorNotification[]>();
  for (const entries of sources.values()) for (const entry of entries) {
    const message = normalize(entry.message);
    if (message) groups.set(message, [...(groups.get(message) ?? []), entry]);
  }
  for (const message of hiddenToasts) if (!groups.has(message)) hiddenToasts.delete(message);
  notifications = [...groups].map(([message, entries]) => {
    const retries = [...new Set(entries.flatMap(entry => entry.retry ? [entry.retry] : []))];
    return {
      id: message, message,
      kind: entries.some(entry => entry.kind !== "warning") ? "error" : "warning",
      toastDismissed: hiddenToasts.has(message),
      retry: retries.length ? () => Promise.allSettled(retries.map(retry => Promise.resolve().then(retry))) : undefined,
    };
  });
  emit();
}

export const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};
export const getNotifications = () => notifications;
export function notifyError(notification: ErrorNotification) {
  sources.set(notification.id, [notification]);
  update();
}
export function reportWarnings(source: string, data: unknown, retry: ErrorNotification["retry"]) {
  const warnings = data && typeof data === "object" && "warnings" in data ? data.warnings : undefined;
  const entries: ErrorNotification[] = Array.isArray(warnings) ? warnings.flatMap(warning =>
    warning && typeof warning.message === "string"
      ? [{ id: source, message: warning.message, kind: "warning" as const, retry }] : []) : [];
  if (entries.length) sources.set(source, entries);
  else sources.delete(source);
  update();
}
export function dismissToast(id: string) {
  hiddenToasts.add(id);
  update();
}
export function dismissError(id: string) {
  for (const [source, entries] of sources) {
    const remaining = entries.filter(entry => normalize(entry.message) !== id);
    if (remaining.length) sources.set(source, remaining);
    else sources.delete(source);
  }
  update();
}
