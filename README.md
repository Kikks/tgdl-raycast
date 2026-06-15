# Telegram Downloader for Raycast

Download photos, videos, and files from any Telegram channel or chat — without
leaving Raycast. Downloads run as **background jobs** that survive closing the
Raycast window, and you track them live from the **menu bar**.

This extension is a front-end for the [`tgdl`](https://github.com/Kikks/tgdl)
command-line tool, which does the actual downloading and talks to Telegram
directly. Nothing is sent to any third-party server.

## Requirements

You need the `tgdl` CLI installed and authenticated:

```bash
pipx install tgdl   # or: pip install tgdl
tgdl init           # one-time: enter your Telegram API credentials and log in
```

Get a Telegram **API ID** and **API hash** from <https://my.telegram.org> →
_API Development Tools_. `tgdl init` walks you through it.

If `tgdl` isn't on your `PATH`, set its full path in the extension's preferences
(run `which tgdl` or `pipx list` to find it).

## Commands

| Command              | What it does                                                                                                       |
| -------------------- | ------------------------------------------------------------------------------------------------------------------ |
| **New Download**     | A form to configure and start a download — channel, media types, date range, filters, output folder, and template. |
| **Download Monitor** | A menu-bar item showing active/recent jobs with live progress and speed.                                           |
| **Quick Download**   | Start a download instantly from a `@channel`, link, or clipboard, using your defaults.                             |
| **Run Profile**      | Launch one of your saved `tgdl` profiles as a background job.                                                      |
| **Download History** | Per-channel stats, bandwidth, and recent sessions.                                                                 |
| **Manage Jobs**      | Cancel, retry, open the output folder, or clear finished jobs.                                                     |

## Preferences

- **tgdl Executable** — path to the binary (default `tgdl`).
- **Default Download Folder** — where downloads are saved unless overridden.
- **Default Concurrency** — how many files to download at once by default.

## How it works

The extension never holds a download in memory. **New Download** / **Quick
Download** write a config and call `tgdl job start`, which spawns a detached
process that keeps running after Raycast closes. The **Download Monitor** simply
reads each job's `status.json`, so progress is never lost when the window goes
away.

## License

MIT
