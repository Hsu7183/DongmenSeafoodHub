import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
export default defineConfig([...nextVitals, ...nextTs, {
  rules: {
    "@typescript-eslint/no-explicit-any": "off",
    "@typescript-eslint/no-unused-vars": ["warn", { "argsIgnorePattern": "^_", "varsIgnorePattern": "^_" }],
    "react-hooks/set-state-in-effect": "off",
    "react-hooks/purity": "off"
  }
}, globalIgnores([".next/**", "node_modules/**", ".runtime/**", "next-env.d.ts"])]);
