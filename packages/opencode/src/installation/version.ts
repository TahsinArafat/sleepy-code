import semver from "semver"

declare global {
  const SLEEPYCODE_VERSION: string
  const SLEEPYCODE_CHANNEL: string
}

export const InstallationVersion = typeof SLEEPYCODE_VERSION === "string" ? SLEEPYCODE_VERSION : "local"
export const InstallationChannel = typeof SLEEPYCODE_CHANNEL === "string" ? SLEEPYCODE_CHANNEL : "local"
export const InstallationLocal = InstallationChannel === "local"

// InstallationVersion is an install identity (local / desktop-<hash> / release semver),
// not an npm dist-tag. @sleepy-ai/plugin installs only pin when that identity is a valid
// semver string; otherwise omit the version so npm resolves latest.
export function pluginSdkNpmVersion(version: string, local: boolean): string | undefined {
  if (local) return undefined
  return semver.valid(version) ? version : undefined
}

export const PluginSdkNpmVersion = pluginSdkNpmVersion(InstallationVersion, InstallationLocal)
