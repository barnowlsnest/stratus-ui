import type { NextConfig } from "next";

const config: NextConfig = {
  // Self-contained server bundle for the Docker image.
  output: "standalone",
  // gRPC runs on the Next.js server only: browsers cannot speak it.
  serverExternalPackages: ["ts-stratus", "@grpc/grpc-js", "@grpc/proto-loader"],
  experimental: {
    // Proxy buffers request bodies and silently cuts them at this size. Keep it above the
    // 12 MiB limit in /api/ops, so that route can see an oversized body and answer 413.
    proxyClientMaxBodySize: "13mb",
  },
  outputFileTracingIncludes: {
    // ts-stratus reads its .proto from disk at runtime, which tracing cannot see.
    "/api/**": ["./node_modules/ts-stratus/proto/**/*"],
  },
};

export default config;
