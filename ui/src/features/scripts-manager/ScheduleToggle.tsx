import { useEffect, useRef, useState } from "react";

export function ScheduleToggle({ enabled, disabled = false, onChange, onToggle }: {
  enabled: boolean;
  disabled?: boolean;
  onChange?: (enabled: boolean) => void;
  onToggle: (enabled: boolean) => void | Promise<void>;
}) {
  const [pendingEnabled, setPendingEnabled] = useState<boolean | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const toggle = () => {
    const nextEnabled = !localEnabled;
    setPendingEnabled(nextEnabled);
    onChange?.(nextEnabled);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      timer.current = null;
      try {
        await onToggle(nextEnabled);
      } finally {
        setPendingEnabled(null);
      }
    }, 300);
  };

  const localEnabled = pendingEnabled ?? enabled;

  return <button
    type="button"
    role="switch"
    aria-checked={localEnabled}
    aria-label={localEnabled ? "Schedule Enabled" : "Schedule Disabled"}
    disabled={disabled}
    className="flex w-full cursor-pointer items-center gap-2 text-left text-sm font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
    onClick={toggle}
  >
    <span
      className={`relative inline-flex h-6 w-11 shrink-0 rounded-full p-1 shadow-inner transition-colors ${localEnabled ? "bg-emerald-500" : "bg-slate-300"}`}
      aria-hidden="true"
    >
      <span className={`h-4 w-4 rounded-full bg-white shadow transition-transform ${localEnabled ? "translate-x-5" : "translate-x-0"}`} />
    </span>
    {localEnabled ? "Schedule Enabled" : "Schedule Disabled"}
  </button>;
}
