import { notifySuccess } from "../../utils/actionNotifications";
import { useState } from "react";
import { useRouter } from "@tanstack/react-router";
import { Button } from "@usace/groundwork";
import { MdLink } from "react-icons/md";

export function ShareJob({ jobId }: { jobId: string }) {
  const router = useRouter();
  const [result, setResult] = useState<"idle" | "manual">("idle");
  const href = router.buildLocation({ to: "/jobs/$jobId", params: { jobId } }).href;
  const url = new URL(href, window.location.origin).href;
  const share = async () => {
    try { await navigator.clipboard.writeText(url); setResult("idle"); notifySuccess("Link copied. Recipients need access to this office."); }
    catch { setResult("manual"); }
  };
  return <div className="min-w-0 space-y-2">
    <Button type="button" onClick={() => void share()} className="inline-flex items-center gap-2"><MdLink aria-hidden />Share job log</Button>
    {result === "manual" && <label className="block text-sm">Copy this job log link<input aria-label="Job log link" readOnly value={url} onFocus={event => event.target.select()} className="mt-1 w-full rounded border p-2" /></label>}
  </div>;
}
