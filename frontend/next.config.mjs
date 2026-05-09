/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Explicitly set the source directory to avoid conflict with Python app/ directory
  distDir: ".next",
};

export default nextConfig;
