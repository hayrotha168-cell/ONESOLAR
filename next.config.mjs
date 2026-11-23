import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
let commit = '';
try {
  commit = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
} catch {}

// Next evaluates this file in several build processes; create the build stamp once and let the
// worker processes inherit it, so the app and /version.json always carry the same id.
process.env.ONESOLAR_BUILD_TIME ??= new Date().toISOString();
const buildTime = process.env.ONESOLAR_BUILD_TIME;
const buildId = `${pkg.version}-${commit || 'local'}-${Date.parse(buildTime).toString(36)}`;

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Fully static site in ./out, served by Cloudflare Workers static assets.
  // HTTP headers (e.g. for sw.js) live in public/_headers.
  output: 'export',
  // Baked into each build; /version.json exposes the same values so open apps can spot a newer release.
  env: {
    NEXT_PUBLIC_APP_VERSION: pkg.version,
    NEXT_PUBLIC_BUILD_ID: buildId,
    NEXT_PUBLIC_BUILD_TIME: buildTime,
    NEXT_PUBLIC_COMMIT: commit,
  },
};

export default nextConfig;
