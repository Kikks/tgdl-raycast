import {
  Clipboard,
  LaunchProps,
  LaunchType,
  launchCommand,
  showHUD,
  showToast,
  Toast,
} from "@raycast/api";
import {
  authStatus,
  preferences,
  startJob,
  TgdlError,
  TgdlNotInstalled,
} from "./lib/tgdl";
import type { DownloadConfig } from "./lib/types";

export default async function Command(
  props: LaunchProps<{ arguments: { target?: string } }>,
) {
  // Resolve the target from the argument, falling back to the clipboard.
  let target = props.arguments.target?.trim();
  if (!target) target = (await Clipboard.readText())?.trim();
  if (!target) {
    await showHUD("⚠️ No channel — pass a @username/link or copy one first");
    return;
  }
  target = normalizeTarget(target);

  // Make sure tgdl is set up; otherwise send the user to onboarding.
  try {
    const auth = await authStatus();
    if (!auth.authenticated) return openSetup();
  } catch (e) {
    if (e instanceof TgdlNotInstalled) return openSetup();
    await showHUD(`⚠️ ${e instanceof Error ? e.message : "tgdl error"}`);
    return;
  }

  const prefs = preferences();
  const config: DownloadConfig = { channel: target };
  if (prefs.defaultDownloadFolder)
    config.output_path = prefs.defaultDownloadFolder;
  if (prefs.defaultConcurrency)
    config.concurrency = Number(prefs.defaultConcurrency);

  try {
    await startJob(config); // all media types, full history — the CLI defaults
    await showToast({
      style: Toast.Style.Success,
      title: "Download started",
      message: `${target} — track it in the menu bar`,
    });
  } catch (e) {
    await showToast({
      style: Toast.Style.Failure,
      title: "Couldn't start",
      message: e instanceof TgdlError ? e.message : String(e),
    });
  }
}

async function openSetup() {
  await showToast({
    style: Toast.Style.Failure,
    title: "Set up Telegram Downloader first",
  });
  await launchCommand({
    name: "new-download",
    type: LaunchType.UserInitiated,
  }).catch(() => undefined);
}

/** Turn a t.me/<name> link into @name; otherwise pass through (@user, id, etc.). */
function normalizeTarget(raw: string): string {
  const m = raw.match(/(?:t\.me|telegram\.me)\/(@?[A-Za-z0-9_]+)/i);
  if (m) return m[1].startsWith("@") ? m[1] : `@${m[1]}`;
  return raw;
}
