import { MenuBarExtra } from "@raycast/api";

// TODO(cook): poll `tgdl job list` and render live progress.
export default function Command() {
  return (
    <MenuBarExtra icon="extension-icon.png" tooltip="Telegram Downloader" />
  );
}
