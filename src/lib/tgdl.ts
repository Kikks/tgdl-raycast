// Thin, typed wrapper around the `tgdl` CLI. Every command talks to tgdl
// through here, so binary resolution, JSON parsing, and error mapping live in
// one place. See docs/json-api.md in the CLI repo for the contracts.

import { spawn } from "child_process";
import { mkdtempSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { getPreferenceValues } from "@raycast/api";
import type {
  AuthStatus,
  Dialog,
  DownloadConfig,
  HistoryResponse,
  JobStatus,
  LoginFinishResult,
  LoginStartResult,
  StartJobResponse,
} from "./types";

// Source for in-app install. Switch to "tgdl" once published to PyPI.
export const TGDL_PACKAGE = "git+https://github.com/Kikks/tgdl.git";

// Raycast runs with a slim environment; make sure pipx/Homebrew shims resolve.
function tgdlEnv(): NodeJS.ProcessEnv {
  const extra = `/opt/homebrew/bin:/usr/local/bin:${process.env.HOME}/.local/bin`;
  return { ...process.env, PATH: `${extra}:${process.env.PATH ?? ""}` };
}

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

function exec(
  args: string[],
  input?: string,
): Promise<{ stdout: string; stderr: string; code: number }> {
  const bin = preferences().tgdlPath || "tgdl";
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { env: tgdlEnv() });
    let stdout = "";
    let stderr = "";
    child.on("error", reject); // e.g. ENOENT when the binary is missing
    child.stdout.on("data", (d) => (stdout += d.toString()));
    child.stderr.on("data", (d) => (stderr += d.toString()));
    child.on("close", (code) => resolve({ stdout, stderr, code: code ?? 0 }));
    if (input != null) child.stdin.write(input);
    child.stdin.end();
  });
}

async function run(args: string[], input?: string): Promise<string> {
  let res: { stdout: string; stderr: string; code: number };
  try {
    res = await exec(args, input);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      throw new TgdlNotInstalled(preferences().tgdlPath || "tgdl");
    }
    throw new TgdlError((err as Error).message);
  }
  if (res.code === 0) return res.stdout;
  // Non-zero exit: tgdl emits a JSON error object on stdout.
  const payload = parseMaybe<{ error?: string }>(res.stdout);
  if (payload?.error === "not_authenticated") throw new TgdlNotAuthenticated();
  throw new TgdlError(
    payload?.error ?? res.stderr.trim() ?? `tgdl exited with code ${res.code}`,
  );
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

// ── onboarding: install + login ───────────────────────────────────────────────

/**
 * Install the tgdl CLI via pipx (bootstrapping pipx through Homebrew if needed).
 * Streams combined stdout/stderr through `onData`. Resolves on success.
 */
export function installTgdl(onData: (chunk: string) => void): Promise<void> {
  const script = [
    "set -e",
    'if command -v pipx >/dev/null 2>&1; then PIPX="$(command -v pipx)";',
    'elif command -v brew >/dev/null 2>&1; then echo "Installing pipx via Homebrew (this can take a minute)…"; brew install pipx; PIPX="$(command -v pipx || echo /opt/homebrew/bin/pipx)";',
    'else echo "ERROR: need pipx or Homebrew. See https://pipx.pypa.io" >&2; exit 1; fi',
    `echo "Installing tgdl…"; "$PIPX" install --force "${TGDL_PACKAGE}"`,
    'echo "✓ Done. You can now sign in."',
  ].join("\n");

  return new Promise((resolve, reject) => {
    const child = spawn("/bin/bash", ["-c", script], {
      env: { ...tgdlEnv(), NONINTERACTIVE: "1", HOMEBREW_NO_AUTO_UPDATE: "1" },
    });
    child.stdout.on("data", (d) => onData(d.toString()));
    child.stderr.on("data", (d) => onData(d.toString()));
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`Install exited with code ${code}`)),
    );
  });
}

/** Headless login step 1 — request a verification code. */
export async function loginStart(
  apiId: string,
  apiHash: string,
  phone: string,
): Promise<LoginStartResult> {
  const out = await run([
    "auth",
    "login-start",
    "--api-id",
    apiId.trim(),
    "--api-hash",
    apiHash.trim(),
    "--phone",
    phone.trim(),
  ]);
  return parseOrThrow<LoginStartResult>(out);
}

/** Headless login step 2 — sign in with the code (and 2FA password via stdin). */
export async function loginFinish(
  phone: string,
  code: string,
  phoneCodeHash: string,
  password?: string,
): Promise<LoginFinishResult> {
  const args = [
    "auth",
    "login-finish",
    "--phone",
    phone.trim(),
    "--code",
    code.trim(),
    "--phone-code-hash",
    phoneCodeHash,
  ];
  if (password) args.push("--password-stdin");
  const out = await run(args, password ? password : undefined);
  return parseOrThrow<LoginFinishResult>(out);
}

export async function logout(): Promise<{ ok: boolean }> {
  return parseOrThrow(await run(["auth", "logout"]));
}

function parseOrThrow<T>(out: string): T {
  const parsed = parseMaybe<T>(out);
  if (parsed == null)
    throw new TgdlError(`Unexpected output: ${out.slice(0, 200)}`);
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
