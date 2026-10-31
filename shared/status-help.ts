export const statusHelp = {
  file: [
    "Shows the active file, its language and workspace.",
    "Settings may differ by language or folder.",
  ].join("\n"),
  formatting: [
    "Formatting status for save, paste and type.",
    "1. Enabled: All three triggers are enabled.",
    "2. Disabled: All three triggers are disabled.",
    "3. Mixed: Some triggers are enabled.",
  ].join("\n"),
} as const;

export const issueUrl =
  "https://github.com/kira-explore/formatting-controls/issues/new";
