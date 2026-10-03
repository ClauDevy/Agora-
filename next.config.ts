import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // StrictMode double-invokes effects in dev, which caused a duplicate Agora RTM
  // client ("Ins id is 2 / mutual kick"). The RTC/RTM singletons are managed via
  // refs; disabling StrictMode avoids the dev-only duplicate without affecting
  // production behavior.
  reactStrictMode: false,
};

export default nextConfig;
