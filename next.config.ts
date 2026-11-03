import type { NextConfig } from "next";

const config: NextConfig = {
  // ffmpeg-static ships a native binary; keep it out of the bundle and include it in the function.
  serverExternalPackages: ["ffmpeg-static"],
  outputFileTracingIncludes: {
    "/api/whatsapp": ["./node_modules/ffmpeg-static/ffmpeg*"],
  },
};

export default config;
