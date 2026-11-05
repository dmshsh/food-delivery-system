/** @type {import('next').NextConfig} */
const nextConfig = {
  // The browser talks only to Next.js (same origin); Next forwards /api/* to the NestJS server.
  // This keeps the login cookie first-party (SameSite=Strict) and needs no CORS.
  async rewrites() {
    const api = process.env.API_URL ?? 'http://localhost:3001';
    return [{ source: '/api/:path*', destination: `${api}/api/:path*` }];
  },
};

export default nextConfig;
