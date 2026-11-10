import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Opsional: folder build terpisah (mis. untuk tes produksi saat `npm run dev` berjalan)
  distDir: process.env.NEXT_DIST_DIR || ".next",
  allowedDevOrigins: ["100.97.62.120", "100.97.62.120:3000", "192.168.1.3", "192.168.1.3:3000", "localhost:3000"],
  experimental: {
    serverActions: { bodySizeLimit: "2mb" },
  },
  // Agar Prisma (berjalan di server) tidak di-bundle oleh webpack client-side
  // ssh2 & cpu-features memakai native addon (.node) yang tidak bisa di-parse webpack
  // libsql (Turso) juga membawa binary native & file non-JS
  serverExternalPackages: [
    "@prisma/client",
    "prisma",
    "ssh2",
    "cpu-features",
    "@prisma/adapter-libsql",
    "@libsql/client",
    "libsql",
  ],
};

export default nextConfig;
