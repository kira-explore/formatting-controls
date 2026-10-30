export const statusHelp = {
  file: "Identifies the active file, language and workspace. Formatting settings can differ by language and workspace folder.",
  formatting: [
    "Formatting status for save, paste and type.",
    "1. Enabled: All three triggers are enabled.",
    "2. Disabled: All three triggers are disabled.",
    "3. Mixed: Some triggers are enabled.",
  ].join("\n"),
} as const;

export const issueUrl =
  "https://github.com/kira-explore/formatting-controls/issues/new";
