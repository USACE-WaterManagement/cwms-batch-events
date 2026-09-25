import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@usace-watermanagement/groundwork-water";
import { Button } from "@usace/groundwork";
import fetchWithAuth from "../../utils/fetchWithAuth";
import type { ScriptFormData } from "./types";

type Selection = NonNullable<ScriptFormData["releaseJar"]>;
interface Releases { repository: string; ref: string; hasMore: boolean; releases: { id: number; name: string; tag: string; prerelease: boolean }[] }
interface Assets { assets: { name: string; selection: Selection | null }[]; hasMore: boolean }

export function ReleaseJarPicker({ office, value, onChange }: { office: string; value: Selection | null; onChange: (value: Selection | null) => void }) {
  const auth = useAuth();
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [assetPage, setAssetPage] = useState(1);
  const [release, setRelease] = useState<number>();
  const catalog = useQuery<Releases>({ queryKey: ["releases", office, page], enabled: open,
    queryFn: async () => (await fetchWithAuth(`/api/repository-releases?office=${encodeURIComponent(office)}&page=${page}`, {}, auth.token)).json() });
  const assets = useQuery<Assets>({ queryKey: ["releaseJars", office, release, assetPage], enabled: open && !!release,
    queryFn: async () => (await fetchWithAuth(`/api/repository-releases/${release}/jars?office=${encodeURIComponent(office)}&page=${assetPage}`, {}, auth.token)).json() });
  return <section aria-label="Release JAR selection" className="my-3 min-w-0 rounded-lg border border-blue-200 bg-blue-50 p-3">
    <p className="font-semibold">GitHub Release JAR</p>
    <p className="my-2 text-sm">Select a published release asset. The runner downloads and verifies this exact JAR before starting Java. Releases belong to the repository, not a branch.</p>
    {value && <div className="mb-3 text-sm"><p className="font-mono break-all">{value.repository} · {value.tag} · {value.name}</p><p className="mt-1">Pinned asset #{value.assetId} · SHA-256 verified</p><Button type="button" size="sm" onClick={() => onChange(null)}>Use repository file instead</Button></div>}
    <Button type="button" size="sm" onClick={() => setOpen(!open)}>{open ? "Close release picker" : "Browse release JARs"}</Button>
    {open && <div className="mt-3 space-y-3">
      {catalog.isPending && <p role="status">Loading releases…</p>}
      {catalog.isError && <p role="alert">Releases could not be loaded. <button type="button" className="action-link" onClick={() => void catalog.refetch()}>Retry releases</button></p>}
      {catalog.data && <>
        <label className="block text-sm font-semibold">Release<select className="mt-1 block w-full min-w-0 rounded border bg-white p-2" value={release ?? ""} onChange={event => { setRelease(Number(event.target.value) || undefined); setAssetPage(1); }}>
          <option value="">Select a release</option>{catalog.data.releases.map(item => <option key={item.id} value={item.id}>{item.tag} — {item.name}{item.prerelease ? " (prerelease)" : ""}</option>)}
        </select></label>
        {catalog.data.releases.length === 0 && <p>No published releases on this page.</p>}
        <div className="flex flex-wrap gap-2"><Button type="button" size="sm" disabled={page === 1} onClick={() => { setPage(page - 1); setRelease(undefined); }}>Previous releases</Button><Button type="button" size="sm" disabled={!catalog.data.hasMore} onClick={() => { setPage(page + 1); setRelease(undefined); }}>More releases</Button></div>
      </>}
      {release && assets.isPending && <p role="status">Loading JAR assets…</p>}
      {release && assets.isError && <p role="alert">JAR assets could not be loaded. <button type="button" className="action-link" onClick={() => void assets.refetch()}>Retry assets</button></p>}
      {release && assets.data && <>
        {assets.data.assets.length === 0 && <p>No JAR assets on this page.</p>}
        <ul className="space-y-2">{assets.data.assets.map((item, index) => <li key={index} className="min-w-0 rounded border bg-white p-2"><p className="font-mono break-all">{item.name}</p>
          {item.selection ? <Button type="button" size="sm" onClick={() => { onChange(item.selection); setOpen(false); }}>Select {item.name}</Button> : <p className="text-sm text-amber-900">Unavailable for selection. Requires a GitHub SHA-256 digest, a supported filename, and a size up to 512 MiB.</p>}
        </li>)}</ul>
        <div className="flex flex-wrap gap-2"><Button type="button" size="sm" disabled={assetPage === 1} onClick={() => setAssetPage(assetPage - 1)}>Previous assets</Button><Button type="button" size="sm" disabled={!assets.data.hasMore} onClick={() => setAssetPage(assetPage + 1)}>More assets</Button></div>
      </>}
    </div>}
  </section>;
}
