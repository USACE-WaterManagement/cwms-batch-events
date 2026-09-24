import parse from "shell-quote/parse.js";
import type { Script } from "./types";

export const CURRENT_SCRIPT_VERSION = 3;
export const supportsScriptVersion = (version: number) => [1, 2, 3].includes(version);
// Single quotes keep every saved value literal, including glob characters.
export const formatArguments = (args: string[]) => args.map(argument =>
  /^[a-zA-Z0-9_./:-]+$/.test(argument) ? argument : "'" + argument.replace(/'/g, "'\\''") + "'",
).join(" ");

export function parseArguments(text: string): string[] {
  // shell-quote accepts unfinished quotes. Reject them before producing a run.
  let quoted = "";
  let escaped = false;
  for (const character of text) {
    if (escaped) { escaped = false; continue; }
    if (character === "\\" && quoted !== "'") { escaped = true; continue; }
    if (quoted) { if (character === quoted) quoted = ""; }
    else if (character === "'" || character === '"') quoted = character;
    else if (character === "`") throw new Error("Use Bash command mode for command substitution, or quote this argument literally.");
  }
  if (quoted || escaped) throw new Error("Finish the quoted argument or escape before submitting.");
  if (text.includes("\0")) throw new Error("Arguments cannot contain NUL characters.");
  const tokens = parse(text, () => { throw new Error("Use Bash command mode for variables, or single-quote them to pass them literally."); });
  if (tokens.some(token => typeof token !== "string")) {
    throw new Error("Use Bash command mode for &&, ||, pipes, redirection, or wildcards. Quote them to pass them literally.");
  }
  return tokens as string[];
}

export function commandPreview(script: Pick<Script, "executionType" | "repoPath" | "runtime" | "commandArgs">, trimTarget = true): string {
  const target = trimTarget ? script.repoPath.trim() : script.repoPath;
  const args = script.commandArgs ?? [];
  if (script.executionType === "command") return formatArguments([target, ...args]);
  const path = `/jobs/${target.replace(/^\/jobs\//, "")}`;
  if (script.runtime === "java") return formatArguments(["java", "-jar", path, ...args]);
  if (script.runtime === "shell") return formatArguments(["bash", path, ...args]);
  return formatArguments(["python", path, ...args]);
}

export function savedCommandPreview(script: Script): string {
  const version = script.configVersion ?? 1;
  if (version === 1) {
    return `AWS Batch: ${formatArguments(["python", `/jobs/${script.repoPath}`])}\nLocal Docker command text: python /jobs/${script.repoPath}`;
  }
  if (version === 2) return commandPreview(script, false);
  if (version === 3) return script.commandMode === "shell" ? script.shellCommand ?? "" : commandPreview(script, false);
  return "Preview unavailable for this configuration version.";
}
