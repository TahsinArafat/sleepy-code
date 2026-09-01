import { Flag } from "@/flag/flag"

export function withCheckpointDescription(base: string, extra: string) {
  if (Flag.SLEEPYCODE_DISABLE_CHECKPOINT) return base
  return `${base}\n\n${extra}`
}

export function withCheckpointClause(base: string, extra: string) {
  if (Flag.SLEEPYCODE_DISABLE_CHECKPOINT) return base
  return `${base} ${extra}`
}
