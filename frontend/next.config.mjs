const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Content-Security-Policy",
    value: process.env.NODE_ENV === "development"
      ? ""
      : "default-src 'self'; script-src 'self' 'unsafe-inline' https://vercel.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self' https://api.blockstream.info https://mempool.space; frame-ancestors 'none';"
  },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" }
];

export default {
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
  reactStrictMode: true,
  poweredByHeader: false,
};
