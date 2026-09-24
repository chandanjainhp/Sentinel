/** @type {import('next').NextConfig} */
const nextConfig = {
  // Required for client/Dockerfile runtime (node server.js from .next/standalone)
  output: 'standalone',
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  // Proxy API calls to the Express server so the browser stays same-origin
  // (cookies + single Cloudflare hostname). Prefer API_UPSTREAM_URL for
  // container networking (http://server:8000); fall back to NEXT_PUBLIC_API_URL
  // for local SSR / legacy configs.
  // Note: rewrites() is evaluated at `next build` / `next dev` start — set
  // API_UPSTREAM_URL in the Docker *builder* stage (see client/Dockerfile).
  async rewrites() {
    const upstream =
      process.env.API_UPSTREAM_URL ||
      process.env.NEXT_PUBLIC_API_URL ||
      'http://localhost:8000';
    return [
      {
        source: '/api/v1/:path*',
        destination: `${upstream}/api/v1/:path*`,
      },
    ];
  },
}

export default nextConfig

