// Thin, typed wrapper around the `tgdl` CLI. Every command talks to tgdl
// through here, so binary resolution, JSON parsing, and error mapping live in
// one place. See docs/json-api.md in the CLI repo for the contracts.

import { execFile } from "child_process";
import { mkdtempSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { promisify } from "util";
import { getPreferenceValues } from "@raycast/api";
import type {
  AuthStatus,
  Dialog,
  DownloadConfig,
  HistoryResponse,
  JobStatus,
  StartJobResponse,
} from "./types";

const execFileAsync = promisify(execFile);

// `Preferences` is the global type generated from package.json (raycast-env.d.ts).
export function preferences(): Preferences {
  return getPreferenceValues<Preferences>();
}

// ── errors ────────────────────────────────────────────────────────────────────

export class TgdlError extends Error {}
export class TgdlNotInstalled extends TgdlError {
  constructor(path: string) {
    super(
      `Could not run "${path}". Install the CLI with \`pipx install tgdl\`.`,
    );
  }
}
export class TgdlNotAuthenticated extends TgdlError {
  constructor() {
    super(
      "Not authenticated. Run `tgdl init` in a terminal to log in to Telegram.",
    );
  }
}

// ── core runner ───────────────────────────────────────────────────────────────

async function run(args: string[]): Promise<string> {
  const bin = preferences().tgdlPath || "tgdl";
  try {
    // PATH is augmented so pipx/Homebrew shims resolve under Raycast's slim env.
    const env = {
      ...process.env,
      PATH: `${process.env.PATH ?? ""}:/opt/homebrew/bin:/usr/local/bin:${process.env.HOME}/.local/bin`,
    };
    const { stdout } = await execFileAsync(bin, args, {
      env,
      maxBuffer: 16 * 1024 * 1024,
    });
    return stdout;
  } catch (err) {
    const e = err as NodeJS.ErrnoException & {
      stdout?: string;
      stderr?: string;
    };
    if (e.code === "ENOENT") throw new TgdlNotInstalled(bin);
    // tgdl emits a JSON error object on stdout even on non-zero exit.
    const payload = parseMaybe<{ error?: string }>(e.stdout);
    if (payload?.error === "not_authenticated")
      throw new TgdlNotAuthenticated();
    throw new TgdlError(payload?.error ?? e.stderr?.trim() ?? e.message);
  }
}

async function runJson<T>(args: string[]): Promise<T> {
  const out = await run([...args, "--json"]);
  const parsed = parseMaybe<T & { error?: string }>(out);
  if (parsed == null)
    throw new TgdlError(`Unexpected output from tgdl: ${out.slice(0, 200)}`);
  if ((parsed as { error?: string }).error === "not_authenticated") {
    throw new TgdlNotAuthenticated();
  }
  return parsed;
}

function parseMaybe<T>(text?: string): T | null {
  if (!text) return null;
  try {
    return JSON.parse(text.trim()) as T;
  } catch {
    return null;
  }
}

// ── API surface ───────────────────────────────────────────────────────────────

export function authStatus(): Promise<AuthStatus> {
  return runJson<AuthStatus>(["auth", "status"]);
}

export function listDialogs(limit = 50): Promise<Dialog[]> {
  return runJson<Dialog[]>(["dialogs", "-n", String(limit)]);
}

export function listJobs(): Promise<JobStatus[]> {
  return runJson<JobStatus[]>(["job", "list"]);
}

export function jobStatus(jobId: string): Promise<JobStatus> {
  return runJson<JobStatus>(["job", "status", jobId]);
}

export function cancelJob(
  jobId: string,
): Promise<{ ok: boolean; job_id: string }> {
  return runJson<{ ok: boolean; job_id: string }>(["job", "cancel", jobId]);
}

export function cleanJobs(): Promise<{ removed: number }> {
  return runJson<{ removed: number }>(["job", "clean"]);
}

export function history(): Promise<HistoryResponse> {
  return runJson<HistoryResponse>(["status"]);
}

/** Start a detached download from a full config (written to a temp file). */
export async function startJob(
  config: DownloadConfig,
  opts: { dryRun?: boolean } = {},
): Promise<StartJobResponse> {
  const dir = mkdtempSync(join(tmpdir(), "tgdl-"));
  const file = join(dir, "config.json");
  writeFileSync(file, JSON.stringify(config), "utf-8");
  const args = ["job", "start", "--config", file];
  if (opts.dryRun) args.push("--dry-run");
  // `job start` always emits JSON; no --json flag.
  const out = await run(args);
  const parsed = parseMaybe<StartJobResponse & { error?: string }>(out);
  if (!parsed) throw new TgdlError(`Unexpected output: ${out.slice(0, 200)}`);
  if (parsed.error === "not_authenticated") throw new TgdlNotAuthenticated();
  if (parsed.error) throw new TgdlError(parsed.error);
  return parsed;
}

/** Start a detached download from a saved profile. */
export async function startJobFromProfile(
  name: string,
  opts: { dryRun?: boolean; channel?: string } = {},
): Promise<StartJobResponse> {
  const args = ["job", "start", "--profile", name];
  if (opts.channel) args.push("--channel", opts.channel);
  if (opts.dryRun) args.push("--dry-run");
  const out = await run(args);
  const parsed = parseMaybe<StartJobResponse & { error?: string }>(out);
  if (!parsed) throw new TgdlError(`Unexpected output: ${out.slice(0, 200)}`);
  if (parsed.error) throw new TgdlError(parsed.error);
  return parsed;
}
