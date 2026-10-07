import next from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const config = [
  ...next,
  ...nextTs,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_", ignoreRestSiblings: true }],
    },
  },
  { ignores: [".next/**", "out/**", "node_modules/**", "next-env.d.ts", "playwright-report/**", "test-results/**"] },
];

export default config;
