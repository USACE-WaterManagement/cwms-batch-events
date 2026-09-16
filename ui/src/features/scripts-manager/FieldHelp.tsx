import { useEffect, useId, useRef, useState, type ReactNode, type CSSProperties } from "react";

export function FieldHelp({ label, children }: { label: string; children: ReactNode }) {
  const id = useId();
  const panel = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<CSSProperties>({});
  useEffect(() => {
    const closeHelp = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || !panel.current?.matches(":popover-open")) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      panel.current?.hidePopover();
    };
    window.addEventListener("keydown", closeHelp, true);
    return () => window.removeEventListener("keydown", closeHelp, true);
  }, []);
  return <>
    <button type="button" aria-label={`Help with ${label}`} aria-expanded={open} aria-controls={id}
      onClick={event => {
        if (open) { panel.current?.hidePopover(); return; }
        const rect = event.currentTarget.getBoundingClientRect();
        const above = window.innerHeight - rect.bottom < 220 && rect.top > window.innerHeight / 2;
        setPosition({
          left: Math.max(12, Math.min(rect.left, window.innerWidth - 348)),
          top: above ? "auto" : rect.bottom + 8,
          bottom: above ? window.innerHeight - rect.top + 8 : "auto",
          maxHeight: Math.max(80, (above ? rect.top : window.innerHeight - rect.bottom) - 20),
        });
        panel.current?.showPopover();
      }}
      className="inline-flex size-5 shrink-0 cursor-pointer items-center justify-center rounded-full border border-gray-400 text-xs font-semibold text-gray-600 hover:bg-blue-50 focus-visible:outline-2 focus-visible:outline-blue-600">?</button>
    <div ref={panel} id={id} popover="auto" role="region" aria-label={`${label} help`}
      onToggle={event => setOpen(event.newState === "open")} style={position}
      className="fixed m-0 w-84 max-w-[calc(100vw-1.5rem)] overflow-y-auto rounded-lg border border-gray-300 bg-white p-4 text-gray-800 shadow-lg backdrop:bg-transparent">
      <div className="mb-2 flex items-center justify-between gap-3">
        <strong className="text-sm">{label}</strong>
        <button type="button" aria-label={`Close ${label} help`} onClick={() => panel.current?.hidePopover()}
          className="inline-flex size-6 cursor-pointer items-center justify-center rounded hover:bg-gray-100">×</button>
      </div>
      <div className="text-sm leading-relaxed [&_a]:text-blue-700 [&_a]:underline">{children}</div>
    </div>
  </>;
}
