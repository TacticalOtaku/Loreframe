import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist/", "node_modules/", "artifacts/"] },
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    languageOptions: {
      globals: { ...globals.browser },
    },
    rules: {
      "no-eval": "error",
      "no-implied-eval": "error",
      "no-new-func": "error",
      "no-script-url": "error",
      "no-empty": ["error", { allowEmptyCatch: false }],
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-explicit-any": "error",
    },
  },
  {
    // Tests deliberately contain attack strings.
    files: ["tests/**/*.ts"],
    rules: { "no-script-url": "off", "@typescript-eslint/no-non-null-assertion": "off" },
  },
  {
    files: ["tools/**/*.mjs", "*.config.*"],
    languageOptions: { globals: { ...globals.node } },
  },
);
