import { useState } from "react";

const REMEMBERED_OFFICE_KEY = "cwms-batch-events:selected-office";

const loadRememberedOffice = () => {
  if (typeof window === "undefined") return undefined;
  return window.localStorage.getItem(REMEMBERED_OFFICE_KEY) ?? undefined;
};

export const useRememberedOffice = (offices: string[]) => {
  const [storedOffice, setStoredOffice] = useState<string | undefined>(
    loadRememberedOffice,
  );
  const office =
    storedOffice && (offices.length === 0 || offices.includes(storedOffice))
      ? storedOffice
      : undefined;

  const setOffice = (nextOffice: string) => {
    setStoredOffice(nextOffice || undefined);
    if (typeof window === "undefined") return;

    if (nextOffice) {
      window.localStorage.setItem(REMEMBERED_OFFICE_KEY, nextOffice);
    } else {
      window.localStorage.removeItem(REMEMBERED_OFFICE_KEY);
    }
  };

  return [office, setOffice] as const;
};
