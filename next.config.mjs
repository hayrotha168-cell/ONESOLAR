/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Fully static site in ./out, served by Cloudflare Workers static assets.
  // HTTP headers (e.g. for sw.js) live in public/_headers.
  output: 'export',
};

export default nextConfig;
