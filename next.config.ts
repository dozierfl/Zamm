import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // vinext currently applies the Server Action body limit to multipart App
    // Route requests as well. Full-length stereo WAV mix renders routinely
    // exceed the 1 MB default, so keep this aligned with the route's own
    // validated 120 MB ceiling.
    serverActions: {
      bodySizeLimit: "120mb",
    },
  },
};

export default nextConfig;
