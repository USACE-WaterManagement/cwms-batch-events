import { useSyncExternalStore } from "react";

interface ActionNotice { id: number; message: string }
let notices: ActionNotice[] = [];
let sequence = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(listener => listener());
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
const snapshot = () => notices;
export const useActionNotices = () => useSyncExternalStore(subscribe, snapshot);
export function dismissAction(id: number) { notices = notices.filter(item => item.id !== id); emit(); }
export function notifySuccess(message: string) {
  const id = ++sequence;
  notices = [...notices.filter(item => item.message !== message), { id, message }]; emit();
  window.setTimeout(() => dismissAction(id), 6000);
}
