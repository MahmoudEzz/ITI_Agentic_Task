import js from "@eslint/js";

export default [
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        process: "readonly",
        console: "readonly",
        fetch: "readonly",
        URL: "readonly",
        AbortController: "readonly",
        AbortSignal: "readonly",
        crypto: "readonly",
        Buffer: "readonly",
        TextDecoder: "readonly",
      },
    },
    rules: {
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
    },
  },
  {
    // Enforce the Hexagonal layer-dependency rule: domain must not import adapters/infra/frameworks.
    files: ["src/domain/**/*.js"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            { group: ["**/adapters/**", "**/infra/**"], message: "domain must not depend on adapters/infra (Hexagonal architecture rule — see CLAUDE.md)." },
            { group: ["fastify", "knex", "pg", "ollama", "@google/*"], message: "domain must not depend on a web framework, DB driver, or LLM SDK." },
          ],
        },
      ],
    },
  },
  {
    files: ["src/application/**/*.js"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [{ group: ["**/adapters/**"], message: "application must depend only on ports, not concrete adapters (Hexagonal architecture rule — see CLAUDE.md)." }],
        },
      ],
    },
  },
  {
    ignores: ["node_modules/**", "corpus/**", "reports/**"],
  },
];
