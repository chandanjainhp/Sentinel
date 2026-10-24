/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The browser client talks to same-origin /api/v1; in dev, rewrites proxy
  // these to a separate backend (default localhost:8000). The backend's own
  // API contract — paths, request shapes, response envelopes — is unchanged.
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
};

module.exports = nextConfig;
