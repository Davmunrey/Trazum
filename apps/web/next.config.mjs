/** @type {import('next').NextConfig} */
const nextConfig = {
  // El núcleo se publica como ESM con tipos; Next lo transpila junto a la app.
  transpilePackages: ['@trazum/core'],
};

export default nextConfig;
