import { useState } from "react";
import {
  Action,
  ActionPanel,
  Form,
  Icon,
  LaunchType,
  Toast,
  launchCommand,
  popToRoot,
  showToast,
} from "@raycast/api";
import { usePromise } from "@raycast/utils";
import { listDialogs, preferences, startJob, TgdlError } from "./lib/tgdl";
import { TgdlGate } from "./lib/onboarding";
import {
  ALL_MEDIA_TYPES,
  CONCURRENCY_OPTIONS,
  MEDIA_TYPE_OPTIONS,
  RESUME_OPTIONS,
  TEMPLATE_PRESETS,
  parseSize,
} from "./lib/options";
import type { DownloadConfig } from "./lib/types";

interface FormValues {
  mediaTypes: string[];
  days: string;
  dateFrom: Date | null;
  dateTo: Date | null;
  minSize: string;
  maxSize: string;
  caption: string;
  senders: string;
  dedup: boolean;
  output: string[];
  subfolders: string[];
  sidecars: boolean;
  resume: string;
  concurrency: string;
}

export default function Command() {
  return (
    <TgdlGate>
      <NewDownloadForm />
    </TgdlGate>
  );
}

function NewDownloadForm() {
  const prefs = preferences();
  // tgdl is installed + authenticated here (guaranteed by TgdlGate).
  const { data: dialogs } = usePromise(listDialogs, [40]);

  const [channel, setChannel] = useState("");
  const [dateRange, setDateRange] = useState("all");
  const [template, setTemplate] = useState(TEMPLATE_PRESETS[0].value);

  async function submit(values: FormValues, dryRun: boolean) {
    if (!channel.trim()) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Channel is required",
      });
      return;
    }
    if (values.mediaTypes.length === 0) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Pick at least one media type",
      });
      return;
    }

    const config: DownloadConfig = {
      channel: channel.trim(),
      media_types: values.mediaTypes as DownloadConfig["media_types"],
      date_range_type: dateRange as DownloadConfig["date_range_type"],
      deduplicate: values.dedup,
      json_sidecars: values.sidecars,
      filename_template: template,
      resume_mode: values.resume as DownloadConfig["resume_mode"],
      concurrency: Number(values.concurrency),
      subfolders_by_type: values.subfolders.includes("type"),
      subfolders_by_date: values.subfolders.includes("date"),
      subfolders_by_sender: values.subfolders.includes("sender"),
    };

    if (dateRange === "last_n_days")
      config.last_n_days = Number(values.days) || 30;
    if (dateRange === "custom") {
      config.date_from = values.dateFrom ? values.dateFrom.toISOString() : null;
      config.date_to = values.dateTo ? values.dateTo.toISOString() : null;
    }

    const min = parseSize(values.minSize);
    const max = parseSize(values.maxSize);
    if (min != null || max != null)
      config.file_size = { min_bytes: min, max_bytes: max };
    if (values.caption.trim()) config.caption_keyword = values.caption.trim();
    const senders = values.senders
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (senders.length) config.sender_filter = senders;
    if (values.output[0]) config.output_path = values.output[0];

    const toast = await showToast({
      style: Toast.Style.Animated,
      title: "Starting download…",
    });
    try {
      const { job_id } = await startJob(config, { dryRun });
      toast.style = Toast.Style.Success;
      toast.title = dryRun ? "Dry run started" : "Download started";
      toast.message = job_id;
      await launchCommand({
        name: "download-monitor",
        type: LaunchType.UserInitiated,
      }).catch(() => undefined);
      await popToRoot();
    } catch (e) {
      toast.style = Toast.Style.Failure;
      toast.title = "Could not start";
      toast.message = e instanceof TgdlError ? e.message : String(e);
    }
  }

  return (
    <Form
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="Start Download"
            icon={Icon.Download}
            onSubmit={(v: FormValues) => submit(v, false)}
          />
          <Action.SubmitForm
            title="Dry Run (Preview)"
            icon={Icon.Eye}
            onSubmit={(v: FormValues) => submit(v, true)}
          />
        </ActionPanel>
      }
    >
      <Form.Description text="Configure a background download. It keeps running after you close Raycast — track it from the Download Monitor menu bar." />

      {dialogs && dialogs.length > 0 && (
        <Form.Dropdown
          id="recentChat"
          title="Recent Chat"
          info="Pick a recent chat to fill the channel field, or type one manually below."
          value=""
          onChange={(v) => {
            if (v) setChannel(v);
          }}
        >
          <Form.Dropdown.Item value="" title="— choose —" />
          {dialogs.map((d) => (
            <Form.Dropdown.Item
              key={d.id}
              value={d.username ? `@${d.username}` : d.id}
              title={d.name + (d.username ? ` (@${d.username})` : "")}
            />
          ))}
        </Form.Dropdown>
      )}

      <Form.TextField
        id="channel"
        title="Channel"
        placeholder="@username, t.me link, or numeric ID"
        info="@username is the most reliable. Numeric IDs only resolve if cached in your session."
        value={channel}
        onChange={setChannel}
      />

      <Form.TagPicker
        id="mediaTypes"
        title="Media Types"
        defaultValue={ALL_MEDIA_TYPES}
      >
        {MEDIA_TYPE_OPTIONS.map((m) => (
          <Form.TagPicker.Item key={m.value} value={m.value} title={m.label} />
        ))}
      </Form.TagPicker>

      <Form.Separator />

      <Form.Dropdown
        id="dateRange"
        title="Date Range"
        value={dateRange}
        onChange={setDateRange}
      >
        <Form.Dropdown.Item value="all" title="Entire history" />
        <Form.Dropdown.Item value="last_n_days" title="Last N days" />
        <Form.Dropdown.Item value="custom" title="Custom range" />
      </Form.Dropdown>

      {dateRange === "last_n_days" && (
        <Form.TextField
          id="days"
          title="Days back"
          defaultValue="30"
          placeholder="30"
        />
      )}
      {dateRange === "custom" && (
        <>
          <Form.DatePicker
            id="dateFrom"
            title="From"
            type={Form.DatePicker.Type.Date}
          />
          <Form.DatePicker
            id="dateTo"
            title="To"
            type={Form.DatePicker.Type.Date}
          />
        </>
      )}

      <Form.Separator />

      <Form.TextField
        id="minSize"
        title="Min Size"
        placeholder="e.g. 100KB (optional)"
      />
      <Form.TextField
        id="maxSize"
        title="Max Size"
        placeholder="e.g. 500MB (optional)"
      />
      <Form.TextField
        id="caption"
        title="Caption Filter"
        placeholder="text or /regex/ (optional)"
      />
      <Form.TextField
        id="senders"
        title="Senders"
        placeholder="@user1, @user2 (optional, comma-separated)"
      />
      <Form.Checkbox
        id="dedup"
        label="Skip duplicate files (same content)"
        defaultValue={true}
      />

      <Form.Separator />

      <Form.FilePicker
        id="output"
        title="Output Folder"
        allowMultipleSelection={false}
        canChooseDirectories
        canChooseFiles={false}
        defaultValue={
          prefs.defaultDownloadFolder ? [prefs.defaultDownloadFolder] : []
        }
      />
      <Form.Dropdown
        id="template"
        title="Filename Template"
        value={template}
        onChange={setTemplate}
      >
        {TEMPLATE_PRESETS.map((t) => (
          <Form.Dropdown.Item key={t.value} value={t.value} title={t.title} />
        ))}
      </Form.Dropdown>
      <Form.TagPicker id="subfolders" title="Subfolders By" defaultValue={[]}>
        <Form.TagPicker.Item value="type" title="Media type" />
        <Form.TagPicker.Item value="date" title="Year-month" />
        <Form.TagPicker.Item value="sender" title="Sender" />
      </Form.TagPicker>
      <Form.Checkbox
        id="sidecars"
        label="Save .json metadata sidecars"
        defaultValue={false}
      />

      <Form.Separator />

      <Form.Dropdown id="resume" title="Resume Mode" defaultValue="smart">
        {RESUME_OPTIONS.map((r) => (
          <Form.Dropdown.Item key={r.value} value={r.value} title={r.label} />
        ))}
      </Form.Dropdown>
      <Form.Dropdown
        id="concurrency"
        title="Concurrency"
        defaultValue={prefs.defaultConcurrency ?? "3"}
      >
        {CONCURRENCY_OPTIONS.map((c) => (
          <Form.Dropdown.Item key={c} value={c} title={c} />
        ))}
      </Form.Dropdown>
    </Form>
  );
}
