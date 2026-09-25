import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "@tanstack/react-router";
import { MdChevronRight, MdExpandMore, MdOpenInNew } from "react-icons/md";

interface MenuLink { text: string; href: string; external?: boolean }

export function AboutMenu({ signedIn, office, repositoryUrl }: {
  signedIn: boolean; office?: string; repositoryUrl?: string;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const location = useLocation();
  const [lastLocation, setLastLocation] = useState(location.href);
  if (lastLocation !== location.href) {
    setLastLocation(location.href);
    setOpen(false);
  }
  useEffect(() => {
    if (!open) return;
    const dismiss = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, [open]);
  const groups: { title: string; links: MenuLink[] }[] = [
    { title: "Application", links: [
      { text: "About Batch Events", href: "/about" },
      { text: "Controls and access", href: "/about/controls" },
      ...(signedIn ? [{ text: "Version and environment", href: "/about/version" }] : []),
      { text: "Report an issue", href: "https://github.com/USACE-WaterManagement/cwms-batch-events/issues", external: true },
    ] },
    { title: "Job guides", links: [
      { text: "Getting started", href: "/help/onboarding" },
      { text: "Script setup", href: "/help/script-files" },
      { text: "Configuration versions", href: "/help/script-versions" },
    ] },
    { title: "Developer resources", links: [
      { text: "Swagger UI", href: `${window.location.origin}/api/docs`, external: true },
      { text: "CWMS Batch Events", href: "https://github.com/USACE-WaterManagement/cwms-batch-events", external: true },
      ...(repositoryUrl ? [{ text: `${office} CWBI jobs`, href: repositoryUrl, external: true }] : []),
      { text: "CWBI WM images", href: "https://github.com/USACE/cwbi-wm-images", external: true },
    ] },
  ];
  return <div ref={root} onBlur={event => {
    if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
  }} onKeyDown={event => {
    if (event.key === "Escape") { setOpen(false); trigger.current?.focus(); }
  }}>
    <button ref={trigger} type="button" aria-expanded={open} aria-controls="about-navigation"
      className="inline-flex min-h-11 items-center gap-1 rounded-lg border border-slate-300 bg-slate-100 px-2 text-sm font-semibold text-slate-900 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
      onClick={() => setOpen(value => !value)}>Help <MdExpandMore aria-hidden className={open ? "rotate-180" : ""} /></button>
    {open && <nav id="about-navigation" aria-label="Help and resources"
      className="fixed left-4 top-28 z-50 sm:absolute sm:left-auto sm:right-0 sm:top-full sm:mt-2 grid max-h-[75dvh] w-[min(42rem,calc(100vw-2rem))] gap-4 overflow-y-auto overscroll-contain whitespace-normal rounded-xl border border-slate-200 bg-white p-4 text-slate-900 shadow-xl sm:grid-cols-3">
      {groups.map(group => <section key={group.title}>
        <h2 className="mb-2 border-b border-slate-200 pb-2 text-xs font-bold uppercase tracking-wide text-slate-500">{group.title}</h2>
        {group.links.map(link => {
          const content = <><span className="flex-1">{link.text}</span>{link.external ? <MdOpenInNew aria-hidden className="shrink-0 text-slate-500" /> : <MdChevronRight aria-hidden className="shrink-0 text-slate-400" />}</>;
          const className = "flex min-h-11 items-center gap-2 rounded-lg px-2 py-2 text-sm font-medium hover:bg-blue-50 hover:text-blue-800 focus-visible:outline-2 focus-visible:outline-blue-600";
          if (link.external) return <a key={link.href} href={link.href} target="_blank" rel="noopener noreferrer" className={className} onClick={() => setOpen(false)}>{content}</a>;
          return <Link key={link.href} to={link.href} className={className} activeProps={{ className: "bg-blue-50 text-blue-800" }} onClick={() => setOpen(false)}>{content}</Link>;
        })}
      </section>)}
    </nav>}
  </div>;
}
