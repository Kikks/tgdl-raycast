import {
  Action,
  ActionPanel,
  Color,
  Icon,
  Keyboard,
  LaunchType,
  launchCommand,
  List,
  open,
} from "@raycast/api";
import { usePromise } from "@raycast/utils";
import { history, preferences } from "./lib/tgdl";
import { TgdlGate } from "./lib/onboarding";
import { formatBytes } from "./lib/format";

export default function Command() {
  return (
    <TgdlGate>
      <HistoryList />
    </TgdlGate>
  );
}

function HistoryList() {
  const { data, isLoading, revalidate } = usePromise(history);
  const channels = data?.channels ?? [];
  const sessions = data?.recent_sessions ?? [];
  const folder = preferences().defaultDownloadFolder;

  const commonActions = (
    <>
      {folder && (
        <Action
          title="Open Download Folder"
          icon={Icon.Folder}
          onAction={() => open(folder)}
        />
      )}
      <Action
        title="New Download"
        icon={Icon.Plus}
        onAction={() =>
          launchCommand({
            name: "new-download",
            type: LaunchType.UserInitiated,
          })
        }
      />
      <Action
        title="Refresh"
        icon={Icon.ArrowClockwise}
        shortcut={Keyboard.Shortcut.Common.Refresh}
        onAction={revalidate}
      />
    </>
  );

  return (
    <List isLoading={isLoading} searchBarPlaceholder="Search channels…">
      <List.EmptyView
        icon={Icon.BarChart}
        title="No download history yet"
        description="Stats appear here after your first download."
        actions={<ActionPanel>{commonActions}</ActionPanel>}
      />

      {channels.length > 0 && (
        <List.Section title="Channels" subtitle={`${channels.length}`}>
          {channels.map((c) => (
            <List.Item
              key={c.channel_id}
              icon={{ source: Icon.Hashtag, tintColor: Color.Blue }}
              title={c.channel_id}
              subtitle={`${c.complete} files`}
              accessories={[
                c.failed > 0
                  ? { tag: { value: `${c.failed} failed`, color: Color.Red } }
                  : {},
                { text: formatBytes(c.total_bytes), icon: Icon.HardDrive },
              ]}
              actions={
                <ActionPanel>
                  <Action.CopyToClipboard
                    title="Copy Channel ID"
                    content={c.channel_id}
                    shortcut={Keyboard.Shortcut.Common.Copy}
                  />
                  {commonActions}
                </ActionPanel>
              }
            />
          ))}
        </List.Section>
      )}

      {sessions.length > 0 && (
        <List.Section title="Recent Sessions" subtitle={`${sessions.length}`}>
          {sessions.map((s, i) => (
            <List.Item
              key={`${s.session_date}-${s.channel_id}-${i}`}
              icon={Icon.Calendar}
              title={s.session_date}
              subtitle={s.channel_id}
              accessories={[
                { text: `${s.files_downloaded} files` },
                { text: formatBytes(s.bytes_downloaded), icon: Icon.Download },
              ]}
              actions={<ActionPanel>{commonActions}</ActionPanel>}
            />
          ))}
        </List.Section>
      )}
    </List>
  );
}
