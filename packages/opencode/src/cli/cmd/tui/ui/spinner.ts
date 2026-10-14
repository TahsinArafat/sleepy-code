import type { ColorInput } from "@opentui/core"
import { RGBA } from "@opentui/core"
import type { ColorGenerator } from "opentui-spinner"

interface AdvancedGradientOptions {
  colors: ColorInput[]
  trailLength: number
  defaultColor?: ColorInput
  direction?: "forward" | "backward" | "bidirectional"
  holdFrames?: { start?: number; end?: number }
  enableFading?: boolean
  minAlpha?: number
  /** Which side of the head the color trail lights up. `"ahead"` leads the
   * animation (pacman's food side); default `"behind"` trails it. */
  trailSide?: "behind" | "ahead"
  /** Frames the head stays on each cell before advancing (default: 1).
   * Higher values slow the sweep without slowing the tick rate. */
  moveEvery?: number
}

interface ScannerState {
  activePosition: number
  isHolding: boolean
  holdProgress: number
  holdTotal: number
  movementProgress: number
  movementTotal: number
  isMovingForward: boolean
}

function getScannerState(
  frameIndex: number,
  totalChars: number,
  options: Pick<AdvancedGradientOptions, "direction" | "holdFrames" | "moveEvery">,
): ScannerState {
  const { direction = "forward", holdFrames = {}, moveEvery = 1 } = options
  const every = Math.max(1, Math.floor(moveEvery))

  if (direction === "bidirectional") {
    const forwardFrames = totalChars * every
    const holdEndFrames = holdFrames.end ?? 0
    const backwardFrames = (totalChars - 1) * every

    if (frameIndex < forwardFrames) {
      // Moving forward
      return {
        activePosition: Math.min(Math.floor(frameIndex / every), totalChars - 1),
        isHolding: false,
        holdProgress: 0,
        holdTotal: 0,
        movementProgress: frameIndex,
        movementTotal: forwardFrames,
        isMovingForward: true,
      }
    } else if (frameIndex < forwardFrames + holdEndFrames) {
      // Holding at end
      return {
        activePosition: totalChars - 1,
        isHolding: true,
        holdProgress: frameIndex - forwardFrames,
        holdTotal: holdEndFrames,
        movementProgress: 0,
        movementTotal: 0,
        isMovingForward: true,
      }
    } else if (frameIndex < forwardFrames + holdEndFrames + backwardFrames) {
      // Moving backward
      const backwardIndex = frameIndex - forwardFrames - holdEndFrames
      return {
        activePosition: totalChars - 2 - Math.min(Math.floor(backwardIndex / every), totalChars - 2),
        isHolding: false,
        holdProgress: 0,
        holdTotal: 0,
        movementProgress: backwardIndex,
        movementTotal: backwardFrames,
        isMovingForward: false,
      }
    } else {
      // Holding at start
      return {
        activePosition: 0,
        isHolding: true,
        holdProgress: frameIndex - forwardFrames - holdEndFrames - backwardFrames,
        holdTotal: holdFrames.start ?? 0,
        movementProgress: 0,
        movementTotal: 0,
        isMovingForward: false,
      }
    }
  } else if (direction === "backward") {
    const step = Math.floor(frameIndex / every) % totalChars
    return {
      activePosition: totalChars - 1 - step,
      isHolding: false,
      holdProgress: 0,
      holdTotal: 0,
      movementProgress: step,
      movementTotal: totalChars,
      isMovingForward: false,
    }
  } else {
    const step = Math.floor(frameIndex / every) % totalChars
    return {
      activePosition: step,
      isHolding: false,
      holdProgress: 0,
      holdTotal: 0,
      movementProgress: step,
      movementTotal: totalChars,
      isMovingForward: true,
    }
  }
}

/**
 * Which way the animation leads — and which way pacman faces. Normally the
 * direction of travel, but when parked at an edge with no cells ahead he turns
 * around so there is always a dot field in front of him (shared by frames and
 * colors so the two never disagree).
 */
function leadForward(state: ScannerState, totalChars: number): boolean {
  const cellsAhead = state.isMovingForward ? totalChars - 1 - state.activePosition : state.activePosition
  return cellsAhead > 0 ? state.isMovingForward : !state.isMovingForward
}

function calculateColorIndex(
  frameIndex: number,
  charIndex: number,
  totalChars: number,
  options: Pick<AdvancedGradientOptions, "direction" | "holdFrames" | "trailLength" | "trailSide" | "moveEvery">,
  state?: ScannerState,
): number {
  const { trailLength, trailSide = "behind" } = options
  const scanner = state ?? getScannerState(frameIndex, totalChars, options)
  const { activePosition, isHolding, holdProgress, isMovingForward } = scanner

  // With trailSide "ahead" the gradient leads the head (pacman's food side),
  // using the same edge-flip as the frames so dots and colors stay in sync.
  const forward = trailSide === "ahead" ? leadForward(scanner, totalChars) : isMovingForward
  const behindDistance = forward ? activePosition - charIndex : charIndex - activePosition
  const directionalDistance = trailSide === "ahead" ? -behindDistance : behindDistance

  // Handle hold frame fading: keep the lead bright, fade the trail
  if (isHolding) {
    // Pin the head to the brightest color — otherwise the hold-slide pushes its
    // index past the palette and the spinner itself blinks out mid-hold.
    if (directionalDistance === 0) return 0
    // Shift the color index by how long we've been holding
    return directionalDistance + holdProgress
  }

  // Normal movement - show gradient trail only behind the movement direction
  if (directionalDistance > 0 && directionalDistance < trailLength) {
    return directionalDistance
  }

  // At the active position, show the brightest color
  if (directionalDistance === 0) {
    return 0
  }

  return -1
}

function createKnightRiderTrail(options: AdvancedGradientOptions): ColorGenerator {
  const { colors, defaultColor, enableFading = true, minAlpha = 0 } = options

  // Use the provided defaultColor if it's an RGBA instance, otherwise convert/default
  // We use RGBA.fromHex for the fallback to ensure we have an RGBA object.
  // Note: If defaultColor is a string, we convert it once here.
  const defaultRgba = defaultColor instanceof RGBA ? defaultColor : RGBA.fromHex((defaultColor as string) || "#000000")

  // Store the base alpha from the inactive factor
  const baseInactiveAlpha = defaultRgba.a

  let cachedFrameIndex = -1
  let cachedState: ScannerState | null = null

  return (frameIndex: number, charIndex: number, _totalFrames: number, totalChars: number) => {
    if (frameIndex !== cachedFrameIndex) {
      cachedFrameIndex = frameIndex
      cachedState = getScannerState(frameIndex, totalChars, options)
    }

    const state = cachedState!

    const index = calculateColorIndex(frameIndex, charIndex, totalChars, options, state)

    // Calculate global fade for inactive dots during hold or movement
    const { isHolding, holdProgress, holdTotal, movementProgress, movementTotal } = state

    let fadeFactor = 1.0
    if (enableFading) {
      if (isHolding && holdTotal > 0) {
        // Fade out linearly to minAlpha
        const progress = Math.min(holdProgress / holdTotal, 1)
        fadeFactor = Math.max(minAlpha, 1 - progress * (1 - minAlpha))
      } else if (!isHolding && movementTotal > 0) {
        // Fade in linearly from minAlpha during movement
        const progress = Math.min(movementProgress / Math.max(1, movementTotal - 1), 1)
        fadeFactor = minAlpha + progress * (1 - minAlpha)
      }
    }

    // Combine base inactive alpha with the fade factor
    // This ensures inactiveFactor is respected while still allowing fading animation
    defaultRgba.a = baseInactiveAlpha * fadeFactor

    if (index === -1) {
      return defaultRgba
    }

    return colors[index] ?? defaultRgba
  }
}

/**
 * Derives a gradient of tail colors from a single bright color using alpha falloff
 * @param brightColor The brightest color (center/head of the scanner)
 * @param steps Number of gradient steps (default: 6)
 * @returns Array of RGBA colors with alpha-based trail fade (background-independent)
 */
export function deriveTrailColors(brightColor: ColorInput, steps: number = 6): RGBA[] {
  const baseRgba = brightColor instanceof RGBA ? brightColor : RGBA.fromHex(brightColor as string)

  const colors: RGBA[] = []

  for (let i = 0; i < steps; i++) {
    // Alpha-based falloff with optional bloom effect
    let alpha: number
    let brightnessFactor: number

    if (i === 0) {
      // Lead position: full brightness and opacity
      alpha = 1.0
      brightnessFactor = 1.0
    } else if (i === 1) {
      // Slight bloom/glare effect: brighten color but reduce opacity slightly
      alpha = 0.9
      brightnessFactor = 1.15
    } else {
      // Exponential alpha decay for natural-looking trail fade
      alpha = Math.pow(0.65, i - 1)
      brightnessFactor = 1.0
    }

    const r = Math.min(1.0, baseRgba.r * brightnessFactor)
    const g = Math.min(1.0, baseRgba.g * brightnessFactor)
    const b = Math.min(1.0, baseRgba.b * brightnessFactor)

    colors.push(RGBA.fromValues(r, g, b, alpha))
  }

  return colors
}

/**
 * Derives the inactive/default color from a bright color using alpha
 * @param brightColor The brightest color (center/head of the scanner)
 * @param factor Alpha factor for inactive color (default: 0.2, range: 0-1)
 * @returns The same color with reduced alpha for background-independent dimming
 */
export function deriveInactiveColor(brightColor: ColorInput, factor: number = 0.2): RGBA {
  const baseRgba = brightColor instanceof RGBA ? brightColor : RGBA.fromHex(brightColor as string)

  // Use the full color brightness but adjust alpha for background-independent dimming
  return RGBA.fromValues(baseRgba.r, baseRgba.g, baseRgba.b, factor)
}

export type KnightRiderStyle = "blocks" | "diamonds" | "plane" | "pacman"

export interface KnightRiderOptions {
  width?: number
  style?: KnightRiderStyle
  holdStart?: number
  holdEnd?: number
  colors?: ColorInput[]
  /** Single color to derive trail from (alternative to providing colors array) */
  color?: ColorInput
  /** Number of trail steps when using single color (default: 6) */
  trailSteps?: number
  defaultColor?: ColorInput
  /** Alpha factor for inactive color when using single color (default: 0.2, range: 0-1) */
  inactiveFactor?: number
  /** Enable fading of inactive dots during hold and movement (default: true) */
  enableFading?: boolean
  /** Minimum alpha value when fading (default: 0, range: 0-1) */
  minAlpha?: number
  /** Which side of the head the color trail lights up. `"ahead"` leads the
   * animation (pacman's food side); default `"behind"` trails it. */
  trailSide?: "behind" | "ahead"
  /** Frames the head stays on each cell before advancing (default: 1).
   * Higher values slow the sweep without slowing the tick rate. */
  moveEvery?: number
  /** Frames per chomp phase for the pacman mouth (default: 8 — open and
   * closed each last this long). Raise it to slow the mouth flap. */
  chompFrames?: number
}

/**
 * Creates frame strings for a Knight Rider style scanner animation
 * @param options Configuration options for the Knight Rider effect
 * @returns Array of frame strings
 */
export function createFrames(options: KnightRiderOptions = {}): string[] {
  const width = options.width ?? 8
  const style = options.style ?? "diamonds"
  const holdStart = options.holdStart ?? 30
  const holdEnd = options.holdEnd ?? 9

  const colors =
    options.colors ??
    (options.color
      ? deriveTrailColors(options.color, options.trailSteps)
      : [
        RGBA.fromHex("#ff0000"), // Brightest Red (Center)
        RGBA.fromHex("#ff5555"), // Glare/Bloom
        RGBA.fromHex("#dd0000"), // Trail 1
        RGBA.fromHex("#aa0000"), // Trail 2
        RGBA.fromHex("#770000"), // Trail 3
        RGBA.fromHex("#440000"), // Trail 4
      ])

  const defaultColor =
    options.defaultColor ??
    (options.color ? deriveInactiveColor(options.color, options.inactiveFactor) : RGBA.fromHex("#330000"))

  const trailOptions = {
    colors,
    trailLength: colors.length,
    defaultColor,
    direction: "bidirectional" as const,
    holdFrames: { start: holdStart, end: holdEnd },
    enableFading: options.enableFading,
    minAlpha: options.minAlpha,
    trailSide: options.trailSide,
    moveEvery: options.moveEvery,
  }

  // Bidirectional cycle: Forward (width) + Hold End + Backward (width-1) + Hold
  // Start — each cell occupies moveEvery ticks, so the cycle scales with it.
  const every = Math.max(1, Math.floor(options.moveEvery ?? 1))
  const totalFrames = width * every + holdEnd + (width - 1) * every + holdStart

  // Generate dynamic frames where inactive pixels are dots and active ones are blocks
  const frames = Array.from({ length: totalFrames }, (_, frameIndex) => {
    const state = getScannerState(frameIndex, width, trailOptions)
    return Array.from({ length: width }, (_, charIndex) => {
      if (style === "plane") {
        const dd = state.isMovingForward ? state.activePosition - charIndex : charIndex - state.activePosition
        if (dd === 0) return "🔥"
        if (dd > 0 && dd < trailOptions.colors.length) {
          return ["·", "∙", "˙"][(frameIndex + dd) % 3]!
        }
        return " "
      }

      if (style === "pacman") {
        // Pac-Man game-style loader: dots only exist AHEAD of him (the food
        // he is about to eat) — everything behind is already eaten (empty), so
        // the row visibly shrinks as he chomps across the field. leadForward
        // turns him around at the edges so the field is always in front, using
        // the same flip as the trailSide:"ahead" colors.
        const forward = leadForward(state, width)
        if (charIndex === state.activePosition) {
          // One flap per chompFrames×2 ticks. At the footer's 40ms tick,
          // 12 frames per phase = 960ms/cycle (~1 flap/sec) — slow enough to
          // actually watch him eat.
          const phase = Math.max(1, options.chompFrames ?? 8)
          const open = Math.floor(frameIndex / phase) % 2 === 0
          if (!open) return "●" // mouth closed
          return forward ? "◐" : "◑" // mouth opens toward the dots
        }
        const ahead = forward ? charIndex - state.activePosition : state.activePosition - charIndex
        return ahead > 0 ? "·" : " " // food ahead, eaten field behind
      }

      const index = calculateColorIndex(frameIndex, charIndex, width, trailOptions, state)

      if (style === "diamonds") {
        const shapes = ["⬥", "◆", "⬩", "⬪"]
        if (index >= 0 && index < trailOptions.colors.length) {
          return shapes[Math.min(index, shapes.length - 1)]
        }
        return "·"
      }

      // Default to blocks
      // It's active if we have a valid color index that is within our colors array
      const isActive = index >= 0 && index < trailOptions.colors.length
      return isActive ? "■" : "⬝"
    }).join("")
  })

  return frames
}

/**
 * Creates a color generator function for Knight Rider style scanner animation
 * @param options Configuration options for the Knight Rider effect
 * @returns ColorGenerator function
 */
export function createColors(options: KnightRiderOptions = {}): ColorGenerator {
  const holdStart = options.holdStart ?? 30
  const holdEnd = options.holdEnd ?? 9

  const colors =
    options.colors ??
    (options.color
      ? deriveTrailColors(options.color, options.trailSteps)
      : [
        RGBA.fromHex("#ff0000"), // Brightest Red (Center)
        RGBA.fromHex("#ff5555"), // Glare/Bloom
        RGBA.fromHex("#dd0000"), // Trail 1
        RGBA.fromHex("#aa0000"), // Trail 2
        RGBA.fromHex("#770000"), // Trail 3
        RGBA.fromHex("#440000"), // Trail 4
      ])

  const defaultColor =
    options.defaultColor ??
    (options.color ? deriveInactiveColor(options.color, options.inactiveFactor) : RGBA.fromHex("#330000"))

  const trailOptions = {
    colors,
    trailLength: colors.length,
    defaultColor,
    direction: "bidirectional" as const,
    holdFrames: { start: holdStart, end: holdEnd },
    enableFading: options.enableFading,
    minAlpha: options.minAlpha,
    trailSide: options.trailSide,
    moveEvery: options.moveEvery,
  }

  return createKnightRiderTrail(trailOptions)
}
