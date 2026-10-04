/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: process.env.API_GATEWAY_URL || 'http://localhost:8000/api/:path*',
      },
      {
        source: '/ws/:path*',
        destination: process.env.WS_GATEWAY_URL || 'ws://localhost:8000/ws/:path*',
      },
    ];
  },
};

export default nextConfig;
