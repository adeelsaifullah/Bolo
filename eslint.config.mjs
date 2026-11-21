import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // Rule 4: no user-facing text inside components. Text comes from config/strings.json via t().
      "react/jsx-no-literals": ["error", { noStrings: true, ignoreProps: true }],
      // Rule 5: never log audio, transcripts, phone numbers or payment screenshots.
      // All logging goes through lib/log, which redacts.
      "no-console": "error",
    },
  },
  {
    // The safe logger is the only place allowed to touch the console.
    files: ["lib/log/**"],
    rules: { "no-console": "off" },
  },
  globalIgnores([".next/**", "out/**", "build/**", "coverage/**", "next-env.d.ts"]),
]);
