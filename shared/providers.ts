export interface Adapter {
  id: string;
  name: string;
  formatting: boolean;
  languages: readonly string[];
  actions: readonly string[];
  settings: readonly string[];
  enabledSetting?: string;
  formatSetting?: string;
  note: string;
}
const js = ["javascript", "typescript", "javascriptreact", "typescriptreact"];
export const adapters: readonly Adapter[] = [
  {
    id: "biomejs.biome",
    name: "Biome",
    formatting: true,
    languages: [...js, "json", "jsonc", "css", "graphql", "html"],
    actions: ["source.fixAll.biome", "source.organizeImports.biome"],
    settings: ["biome.enabled", "biome.requireConfiguration"],
    enabledSetting: "biome.enabled",
    note: "Known language family; exact support depends on the Biome version and project configuration.",
  },
  {
    id: "esbenp.prettier-vscode",
    name: "Prettier",
    formatting: true,
    languages: [
      ...js,
      "json",
      "jsonc",
      "html",
      "css",
      "scss",
      "less",
      "markdown",
      "yaml",
      "graphql",
    ],
    actions: [],
    settings: ["prettier.enable", "prettier.requireConfig"],
    enabledSetting: "prettier.enable",
    note: "Formatting only. Plugins and project configuration can extend or restrict language support.",
  },
  {
    id: "dbaeumer.vscode-eslint",
    name: "ESLint",
    formatting: true,
    languages: js,
    actions: ["source.fixAll.eslint"],
    settings: ["eslint.enable", "eslint.format.enable", "eslint.validate"],
    enabledSetting: "eslint.enable",
    formatSetting: "eslint.format.enable",
    note: "Source fixes; formatting requires eslint.format.enable. Validation and server configuration can extend or restrict languages.",
  },
  {
    id: "vscode.typescript-language-features",
    name: "TypeScript / JavaScript",
    formatting: true,
    languages: js,
    actions: ["source.organizeImports"],
    settings: ["javascript.format.enable", "typescript.format.enable"],
    note: "Built-in formatting and language-specific import actions; availability depends on context.",
  },
  {
    id: "vscode.json-language-features",
    name: "JSON / JSONC",
    formatting: true,
    languages: ["json", "jsonc"],
    actions: [],
    settings: ["json.format.enable"],
    formatSetting: "json.format.enable",
    note: "Built-in JSON formatting.",
  },
  {
    id: "vscode.html-language-features",
    name: "HTML",
    formatting: true,
    languages: ["html", "handlebars"],
    actions: [],
    settings: ["html.format.enable"],
    formatSetting: "html.format.enable",
    note: "Built-in HTML formatting.",
  },
  {
    id: "vscode.css-language-features",
    name: "CSS / SCSS / Less",
    formatting: true,
    languages: ["css", "scss", "less"],
    actions: [],
    settings: ["css.format.enable", "scss.format.enable", "less.format.enable"],
    note: "Built-in stylesheet formatting.",
  },
];
