import { useSyncExternalStore } from "react";

const REMEMBERED_OFFICE_KEY = "cwms-batch-events:selected-office";
const OFFICE_CHANGED = "batch-events-office-changed";
const subscribe = (notify: () => void) => {
  window.addEventListener(OFFICE_CHANGED, notify);
  window.addEventListener("storage", notify);
  return () => {
    window.removeEventListener(OFFICE_CHANGED, notify);
    window.removeEventListener("storage", notify);
  };
};

const loadRememberedOffice = () => {
  if (typeof window === "undefined") return undefined;
  return window.localStorage.getItem(REMEMBERED_OFFICE_KEY) ?? undefined;
};

export const useRememberedOffice = (offices: string[]) => {
  const storedOffice = useSyncExternalStore(subscribe, loadRememberedOffice, () => undefined);
  const office =
    storedOffice && (offices.length === 0 || offices.includes(storedOffice))
      ? storedOffice
      : undefined;

  const setOffice = (nextOffice: string) => {
    if (typeof window === "undefined") return;

    if (nextOffice) {
      window.localStorage.setItem(REMEMBERED_OFFICE_KEY, nextOffice);
    } else {
      window.localStorage.removeItem(REMEMBERED_OFFICE_KEY);
    }
    window.dispatchEvent(new Event(OFFICE_CHANGED));
  };

  return [office, setOffice] as const;
};
