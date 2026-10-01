import { Modal } from "@usace/groundwork";
import { MdClose, MdTerminal, MdMenuBook } from "react-icons/md";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import "./command-modal.css";

export function CommandModal({ opened, onClose, title, children, footer }: {
  opened: boolean; onClose: () => void; title: string; children: ReactNode; footer: ReactNode;
}) {
  return <Modal opened={opened} onClose={onClose} className="command-modal" dialogTitle={
    <span className="flex items-center gap-3 text-left">
      <MdTerminal aria-hidden="true" className="size-7 shrink-0 text-sky-300" />
      <span className="flex-1">{title}</span>
      <button type="button" aria-label="Close dialog" onClick={onClose} className="rounded p-2 hover:bg-white/15 focus-visible:outline-2"><MdClose /></button>
    </span>
  }>
    <div className="space-y-5 p-5 sm:p-6">{children}</div>
    <div className="flex flex-wrap items-center justify-end gap-3 border-t border-slate-200 bg-slate-50 px-5 py-4">{footer}</div>
  </Modal>;
}

export function ScriptVersionHelp() {
  return <Link to="/help/script-versions" className="action-link">
    <MdMenuBook aria-hidden /> Script version guide
  </Link>;
}
