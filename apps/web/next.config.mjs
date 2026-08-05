/** @type {import('next').NextConfig} */
const nextConfig = {
  // The core ships as ESM with types; Next transpiles it alongside the app.
  transpilePackages: ['@trazum/core'],
};

export default nextConfig;
