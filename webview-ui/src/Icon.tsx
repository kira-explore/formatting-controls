export type IconName =
  | "sliders"
  | "save"
  | "code"
  | "layers"
  | "scan"
  | "book"
  | "help"
  | "file"
  | "enabled"
  | "disabled"
  | "mixed";
const paths: Record<IconName, string> = {
  sliders: "M3 7h18M3 17h18M8 4v6M16 14v6",
  save: "M5 3h12l4 4v14H3V3h2ZM7 3v6h10V3M7 21v-8h10v8",
  code: "m8 6-6 6 6 6m8-12 6 6-6 6m-3-16-2 20",
  layers: "m12 2 10 6-10 6L2 8l10-6ZM2 12l10 6 10-6M2 16l10 6 10-6",
  scan: "M8 3H3v5m13-5h5v5M3 16v5h5m8 0h5v-5M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z",
  book: "M12 5v16M12 5C8 2 4 3 2 4v16c4-2 7-1 10 1 3-2 6-3 10-1V4c-4-2-7-1-10 1Z",
  help: "M9 8a3 3 0 0 1 6 0c0 2-3 2-3 5m0 3v.1M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0Z",
  file: "M14 2H4v20h16V8l-6-6Zm0 0v6h6M8 12h8M8 16h8M8 8h2",
  enabled: "M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0ZM7 12l3 3 7-7",
  disabled: "M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0ZM7 12h10",
  mixed: "M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0ZM12 2v20",
};
export const Icon = ({ name }: { name: IconName }) => (
  <svg
    className="icon"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    <path d={paths[name]} />
    {name === "mixed" && (
      <path d="M12 2a10 10 0 0 1 0 20Z" fill="currentColor" stroke="none" />
    )}
  </svg>
);
