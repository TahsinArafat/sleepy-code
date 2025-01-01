declare global {
  const SLEEPYCODE_VERSION: string
  const SLEEPYCODE_CHANNEL: string
}

export const InstallationVersion = typeof SLEEPYCODE_VERSION === "string" ? SLEEPYCODE_VERSION : "local"
export const InstallationChannel = typeof SLEEPYCODE_CHANNEL === "string" ? SLEEPYCODE_CHANNEL : "local"
export const InstallationLocal = InstallationChannel === "local"
