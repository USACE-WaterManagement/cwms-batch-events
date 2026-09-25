import { useRef, useState } from "react";
import { useRepositoryFiles } from "./useRepositoryFiles";
import { Link } from "@tanstack/react-router";
import { Modal, Button } from "@usace/groundwork";
import { MdFolder, MdFolderOpen, MdInsertDriveFile, MdSearch, MdArrowUpward, MdChevronRight, MdCheck } from "react-icons/md";

interface Entry { name: string; path: string; folder: boolean }
function contents(paths: string[], directory: string, extension: string): Entry[] {
  const entries = new Map<string, Entry>();
  for (const path of paths) {
    if (!path.startsWith(directory)) continue;
    const relative = path.slice(directory.length);
    const slash = relative.indexOf("/");
    const folder = slash >= 0;
    const name = folder ? relative.slice(0, slash) : relative;
    if (!name || (!folder && extension !== "all" && !name.toLowerCase().endsWith(extension))) continue;
    entries.set(name, { name, folder, path: directory + name + (folder ? "/" : "") });
  }
  return [...entries.values()].sort((a, b) => Number(b.folder) - Number(a.folder) || a.name.localeCompare(b.name));
}

export function RepositoryPathPicker({ office, runtime, value, onChange, error }: {
  office: string; runtime: string; value: string; onChange: (path: string) => void; error?: string;
}) {
  const extension = runtime === "java" ? ".jar" : runtime === "shell" ? ".sh" : ".py";
  const input = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [suggest, setSuggest] = useState(false);
  const [active, setActive] = useState(-1);
  const [directory, setDirectory] = useState("");
  const [filter, setFilter] = useState(extension);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState("");
  const catalog = useRepositoryFiles(office);
  const paths = catalog.data?.paths ?? [];
  const unavailable = catalog.isError || Boolean(catalog.data?.warnings?.length);
  const typedDirectory = value.slice(0, value.lastIndexOf("/") + 1);
  const prefix = value.slice(typedDirectory.length).toLowerCase();
  const suggestions = contents(paths, typedDirectory, extension).filter(entry => entry.name.toLowerCase().startsWith(prefix));
  const entries = contents(paths, directory, filter).filter(entry => entry.name.toLowerCase().includes(search.toLowerCase()));
  const navigate = (path: string) => { setDirectory(path); setSearch(""); setSelected(""); };
  const chooseSuggestion = (entry: Entry) => {
    onChange(entry.path); setActive(-1); setSuggest(entry.folder); input.current?.focus();
  };
  return <div className="min-w-0 space-y-2">
    <div className="relative flex gap-2">
      <input ref={input} id="repoPath" name="repoPath" required value={value} autoComplete="off"
        role="combobox" aria-autocomplete="list" aria-expanded={suggest && value.length > 0}
        aria-controls="repository-path-suggestions" aria-activedescendant={active >= 0 ? `repository-suggestion-${active}` : undefined}
        onChange={event => { onChange(event.target.value); setSuggest(true); setActive(-1); }}
        onFocus={() => setSuggest(true)} onBlur={() => { setSuggest(false); setActive(-1); }}
        onKeyDown={event => {
          if (event.key === "Escape") { setSuggest(false); setActive(-1); }
          if ((event.key === "ArrowDown" || event.key === "ArrowUp") && suggestions.length) {
            event.preventDefault(); setSuggest(true);
            setActive(previous => Math.max(0, Math.min(suggestions.length - 1, previous + (event.key === "ArrowDown" ? 1 : -1))));
          }
          if (event.key === "Enter" && suggest && active >= 0 && suggestions[active]) {
            event.preventDefault(); chooseSuggestion(suggestions[active]);
          }
        }}
        placeholder={runtime === "java" ? "java-artifacts/BuildWSmetadataViaCDA.jar" : `Directory or ${extension} file path`} aria-invalid={Boolean(error)} aria-describedby={error ? "repoPath-error repository-path-help" : "repository-path-help"}
        title={value || `Directory or ${extension} file path`}
        className={`min-w-0 flex-1 truncate rounded border px-3 py-2 focus:text-clip ${error ? "border-red-600 bg-red-50" : "border-gray-300 bg-white"}`} />
      <Button type="button" disabled={unavailable} aria-haspopup="dialog" onClick={() => {
        navigate(paths.some(path => path.startsWith(typedDirectory)) ? typedDirectory : "");
        setFilter(extension); setSuggest(false); setOpen(true);
      }} className="inline-flex shrink-0 items-center gap-2 [&_svg]:size-5"><MdFolderOpen aria-hidden />Browse</Button>
      {suggest && value.length > 0 && <div className="absolute top-full left-0 z-20 mt-1 max-h-60 w-full overflow-y-auto rounded border border-gray-300 bg-white p-1 shadow-lg">
        <ul id="repository-path-suggestions" role="listbox" aria-label="Directory contents">
          {suggestions.map((entry, index) => <li key={entry.path} id={`repository-suggestion-${index}`} role="option" aria-selected={active === index}
            onMouseDown={event => event.preventDefault()} onClick={() => chooseSuggestion(entry)}
            className={`flex cursor-pointer items-center gap-2 rounded px-3 py-2 text-sm hover:bg-blue-50 ${active === index ? "bg-blue-50" : ""}`}>
            {entry.folder ? <MdFolder aria-hidden className="shrink-0 text-amber-600" /> : <MdInsertDriveFile aria-hidden className="shrink-0 text-gray-500" />}
            <span title={entry.path} className="min-w-0 truncate font-mono">{entry.name}{entry.folder ? "/" : ""}</span>
          </li>)}
        </ul>
        {!suggestions.length && <p className="p-2 text-sm text-gray-600">{catalog.isPending ? "Loading files…" : "No matching files or folders. You can keep this manual path."}</p>}
      </div>}
    </div>
    {unavailable && <p role="status" className="rounded border border-amber-200 bg-amber-50 p-2 text-sm text-amber-950">Repository browsing is unavailable. Enter the path manually. Open the warning icon in the header for details.</p>}
    {catalog.data?.mock && <p className="text-xs font-semibold text-amber-800">Local demo catalog — these are sample paths, not live GitHub files.</p>}
    <p id="repository-path-help" className={runtime === "java" ? "text-xs text-gray-600" : "sr-only"}>{runtime === "java" ? <>Path relative to <code>/jobs</code>. Enabled release JARs are downloaded from <code>java/artifacts.json</code> pins before execution. Enter their paths manually; Browse lists GitHub files only.</> : "Type a directory to see its contents, or browse for a file. Manual paths are accepted. Use the question mark beside the path for help adding files."}</p>
    {catalog.data && <p title={`${catalog.data.repository} · ${catalog.data.ref}`} className="truncate font-mono text-xs text-gray-600">{catalog.data.repository} · {catalog.data.ref}</p>}
    <Modal opened={open} onClose={() => setOpen(false)} dialogTitle={`Choose a file · ${office}`} size="3xl"
      className="[&_[id^=headlessui-dialog-panel]]:w-[min(48rem,100%)]! [&_[id^=headlessui-dialog-panel]]:min-w-0 [&_[id^=headlessui-dialog-panel]]:p-4! [&_[id^=headlessui-dialog-panel]]:max-h-[calc(100dvh-2rem)] [&_[id^=headlessui-dialog-panel]]:overscroll-contain sm:[&_[id^=headlessui-dialog-panel]]:p-6! [&_[id^=headlessui-dialog-panel]]:overflow-y-auto"
      buttons={<div className="flex flex-wrap justify-end gap-3">
        <Button type="button" onClick={() => setOpen(false)}>Cancel</Button>
        <Button type="button" disabled={!selected} onClick={() => { onChange(selected); setSuggest(false); setOpen(false); }}>Use selected file</Button>
      </div>}>
      <div className="select-none w-full min-w-0 space-y-4">
        <p className="text-sm leading-normal text-gray-600 [&_a]:text-blue-700 [&_a]:underline">Select an existing file. To create files or directories, clone the district repository. <Link to="/help/script-files" target="_blank" rel="noopener noreferrer">Read the guide (opens a new tab)</Link></p>
        <p title={`${catalog.data?.repository ?? ""} · ${catalog.data?.ref ?? ""}`} className="truncate font-mono text-sm text-gray-600">{catalog.data?.repository} · {catalog.data?.ref}</p>
        <div className="flex items-center gap-3 rounded-md border border-gray-300 bg-gray-50 p-2 [&_nav]:min-w-0 [&_nav]:wrap-anywhere">
          <button type="button" aria-label="Up one folder" title="Up one folder" disabled={!directory}
            onClick={() => navigate(directory.slice(0, directory.slice(0, -1).lastIndexOf("/") + 1))} className="grid size-8 shrink-0 cursor-pointer place-items-center rounded border border-gray-300 bg-white disabled:cursor-default disabled:opacity-35 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-blue-600"><MdArrowUpward aria-hidden /></button>
        <nav aria-label="Repository folders" className="flex flex-wrap items-center gap-2 text-sm">
          <button type="button" onClick={() => navigate("")} className="text-blue-700 underline">Repository root</button>
          {directory.split("/").filter(Boolean).map((part, index, parts) => <span key={index} className="flex gap-2"><span>/</span>
            <button type="button" onClick={() => navigate(parts.slice(0, index + 1).join("/") + "/")} className="text-blue-700 underline">{part}</button></span>)}
        </nav>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row">
          <label className="min-w-0 flex-1 text-sm">Search this folder
            <span className="relative mt-1 block [&_svg]:pointer-events-none [&_svg]:absolute [&_svg]:top-1/2 [&_svg]:left-3 [&_svg]:size-5 [&_svg]:-translate-y-1/2 [&_svg]:text-gray-500 [&_input]:pl-10 [&_input]:pr-3 [&_input]:select-text"><MdSearch aria-hidden />
            <input value={search} onChange={event => setSearch(event.target.value)} placeholder="File or folder name"
              className="block w-full truncate rounded border border-gray-300 py-2 focus:text-clip" /></span></label>
          <label className="text-sm">File type
            <select value={filter} onChange={event => { setFilter(event.target.value); setSelected(""); }} className="mt-1 block w-full rounded border border-gray-300 px-3 py-2">
              <option value=".py">Python (*.py)</option><option value=".jar">Java JAR (*.jar)</option><option value=".sh">Bash (*.sh)</option><option value="all">All files</option>
            </select></label>
        </div>
        <div className="h-72 overflow-y-auto overscroll-contain rounded-md border border-gray-300 bg-white" role="region" aria-label="Files and folders" tabIndex={0}>
          <div className="sticky top-0 z-10 flex justify-between border-b border-gray-300 bg-gray-100 py-2 pr-12 pl-4 text-xs font-semibold text-gray-600"><span>Name</span><span>Type</span></div>
          {catalog.isPending ? <p className="p-4 text-sm">Loading repository files…</p> : unavailable ? <p className="p-4 text-sm">Repository files are unavailable. Close this window to type a path manually.</p> : <>
            {entries.map(entry => <button key={entry.path} type="button" aria-label={`${entry.folder ? "Open folder" : "Select file"} ${entry.name}`}
              aria-pressed={entry.folder ? undefined : selected === entry.path}
              onClick={() => entry.folder ? navigate(entry.path) : setSelected(entry.path)}
              className="grid w-full cursor-pointer grid-cols-[1.25rem_minmax(0,1fr)_auto_1rem] items-center gap-3 border-b border-gray-100 px-4 py-2.5 text-left text-sm hover:bg-blue-50 aria-pressed:bg-blue-100 aria-pressed:text-blue-800 aria-pressed:shadow-[inset_3px_0_#2563eb] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-blue-600">
              {entry.folder ? <MdFolder aria-hidden className="shrink-0 text-xl text-amber-600" /> : <MdInsertDriveFile aria-hidden className="shrink-0 text-xl text-gray-500" />}
              <span title={entry.name} className="min-w-0 truncate font-mono">{entry.name}</span>
              <span className="text-xs text-gray-500">{entry.folder ? "Folder" : entry.name.includes(".") ? `${entry.name.split(".").pop()?.toUpperCase()} file` : "File"}</span>
              {entry.folder ? <MdChevronRight aria-hidden /> : selected === entry.path ? <MdCheck aria-hidden /> : <span />}
            </button>)}
            {!entries.length && <p className="p-4 text-sm text-gray-600">No matching files in this folder. Choose All files or try another folder.</p>}
          </>}
        </div>
        <div className="flex cursor-default items-baseline gap-3 text-sm [&>span]:shrink-0 [&>span]:font-medium [&>div]:min-w-0 [&>div]:flex-1 [&>div]:truncate [&>div]:rounded [&>div]:border [&>div]:border-gray-300 [&>div]:bg-gray-50 [&>div]:px-3 [&>div]:py-2 [&>div]:text-gray-600"><span>File name</span><div title={selected || "Select a file to continue"}>{selected || "Select a file to continue"}</div></div>
      </div>
    </Modal>
  </div>;
}
