import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@usace-watermanagement/groundwork-water";
import { Button } from "@usace/groundwork";
import fetchWithAuth from "../../utils/fetchWithAuth";
import LoadingSpinner from "../../shared/components/LoadingSpinner";
import { CURRENT_SCRIPT_VERSION, supportsScriptVersion } from "./commandArguments";
import type { Script } from "./types";
import { ScriptVersionHelp } from "./CommandModal";
import { MdCheckCircle, MdUpgrade, MdArrowForward } from "react-icons/md";

export function UpgradeConfiguration({ script }: { script: Script }) {
  const auth = useAuth();
  const cache = useQueryClient();
  const upgrade = useMutation({
    meta: { inlineError: true },
    mutationFn: async (): Promise<Script> => {
      const response = await fetchWithAuth(`/api/scripts/${script.id}/upgrade`, { method: "POST" }, auth.token);
      return response.json();
    },
    onSuccess: updated => {
      cache.setQueryData<Script[]>(["scripts", script.office], old => old?.map(item => item.id === updated.id ? updated : item));
      void cache.invalidateQueries({ queryKey: ["catalog"] });
    },
  });
  const version = script.configVersion ?? 1;
  const current = version === CURRENT_SCRIPT_VERSION;
  let heading = "A newer configuration is available";
  if (current) heading = "You're up to date";
  if (!supportsScriptVersion(version)) heading = "Update this application";
  return <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
    <div className={`flex items-start gap-3 p-5 ${current ? "bg-emerald-50" : "bg-blue-50"}`}>
      <span className={`flex size-11 shrink-0 items-center justify-center rounded-full bg-white ${current ? "text-emerald-600" : "text-blue-700"}`}>
        {current ? <MdCheckCircle className="size-7" aria-hidden /> : <MdUpgrade className="size-7" aria-hidden />}
      </span>
      <div className="min-w-0"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Configuration update</p>
        <h4 className="mt-1 text-lg font-semibold text-slate-900">{heading}</h4>
        <div role="note" aria-label="Script configuration version" className="mt-3 flex flex-wrap items-center gap-2 text-sm">
          <span className="rounded-md border border-slate-200 bg-white px-2 py-1">Current version {version}</span>
          {!current && supportsScriptVersion(version) && <><MdArrowForward aria-hidden /><span className="rounded-md bg-blue-700 px-2 py-1 font-semibold text-white">Version {CURRENT_SCRIPT_VERSION}</span></>}
        </div>
      </div>
    </div>
    <div className="space-y-4 p-5">
    {current && <p className="text-sm text-slate-600">This configuration is up to date.</p>}
    {!supportsScriptVersion(version) && <p role="alert">This app does not support configuration version {version}. Update the application before editing this script.</p>}
    {supportsScriptVersion(version) && version < CURRENT_SCRIPT_VERSION && <>
      <div><h5 className="font-semibold text-slate-900">What's included</h5>
        <ul className="mt-2 list-disc space-y-2 pl-5 text-sm text-slate-600"><li>Hourly, daily, and monthly scheduling</li><li>Office timezone and daylight-saving support</li><li>Manual and automatic run controls</li></ul>
      </div>
      <p className="text-sm text-slate-600">Your saved command is preserved. Upgrading does not run a job or enable scheduling. Existing run history stays unchanged.</p>
      {version === 1 && <p className="text-sm">Historical scripts keep Python execution. Previously ignored runtime and argument fields will be cleared. Paths that cannot be safely converted require review.</p>}
      <Button type="button" disabled={upgrade.isPending} onClick={() => upgrade.mutate()}>
        {upgrade.isPending ? "Upgrading configuration…" : "Upgrade configuration"}
      </Button>
    </>}
    {upgrade.isPending && <div role="status" className="flex items-center gap-2"><LoadingSpinner />Saving configuration version {CURRENT_SCRIPT_VERSION}…</div>}
    {upgrade.isSuccess && <div role="status" className="rounded border border-green-600 bg-green-50 p-3 text-green-900">Configuration upgraded successfully to version {CURRENT_SCRIPT_VERSION}. Scheduling is disabled until you configure and enable it.</div>}
    {upgrade.isError && <div role="alert" className="rounded border border-red-500 bg-red-50 p-3 text-red-800">Upgrade failed: {upgrade.error.message} You can retry with Upgrade configuration.</div>}
    <ScriptVersionHelp />
    </div>
  </div>;
}
