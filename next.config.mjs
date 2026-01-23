/** @type {import("next").NextConfig} */
const nextConfig = {
  output: "standalone",
  experimental: {
    outputFileTracingIncludes: {
      "/api/process": ["./node_modules/ffmpeg-static/**"]
    }
  }
};

export default nextConfig;

