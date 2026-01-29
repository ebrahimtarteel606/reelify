import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Use Babel instead of SWC if SWC fails
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production',
  },
  // Ensure FFmpeg.wasm works in browser
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
        crypto: false,
        stream: false,
        util: false,
      };
    }
    return config;
  },
  // Optimize for video handling
  experimental: {
    optimizePackageImports: ['@ffmpeg/ffmpeg', '@ffmpeg/util'],
  },
  // Note: COEP headers removed to allow cross-origin resources (Vercel Blob Storage)
  // Modern FFmpeg.wasm doesn't require COEP for basic operations
  // If SharedArrayBuffer is needed in the future, use COEP: credentialless
  // and ensure all cross-origin resources have proper CORP headers
  // Explicitly use webpack instead of Turbopack for FFmpeg.wasm compatibility
  // Turbopack doesn't support webpack fallbacks yet
};

export default withNextIntl(nextConfig);
