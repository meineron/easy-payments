import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Pin the workspace root so Turbopack doesn't get fooled by the stray
  // `package-lock.json` one directory up (the parent EasyCoach folder).
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
