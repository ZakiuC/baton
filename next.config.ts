import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 独立输出模式（Electron 生产打包用）
  output: "standalone",
  // API 的运行时数据目录会触发动态文件追踪；旧发布产物不属于运行依赖。
  outputFileTracingExcludes: {
    "/api/*": [
      "./next.config.ts",
      "./release/**/*",
      "./theme_132144/**/*",
    ],
  },
};

export default nextConfig;
