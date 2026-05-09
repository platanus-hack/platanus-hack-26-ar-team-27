/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "images.unsplash.com" },
      { protocol: "https", hostname: "replicate.delivery" },
      { protocol: "https", hostname: "*.supabase.co" },
      { protocol: "https", hostname: "*.cdninstagram.com" },
      { protocol: "https", hostname: "scontent.cdninstagram.com" },
    ],
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
    // Playwright se importa desde una API route para scraping live de
    // influencers; debe quedar como dep externa para que Webpack no intente
    // bundlear el binario de Chromium.
    serverComponentsExternalPackages: ["playwright", "playwright-core"],
  },
};

export default nextConfig;
