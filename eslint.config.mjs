import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // 只检查源码与维护脚本，历史打包产物不参与静态检查。
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "release/**",
    "theme_*/**",
    "next-env.d.ts",
  ]),
  {
    files: ["electron/**/*.js", "scripts/**/*.js"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
]);

export default eslintConfig;
