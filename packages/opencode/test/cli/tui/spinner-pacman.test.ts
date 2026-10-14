import { describe, expect, test } from "bun:test"
import { createColors, createFrames } from "../../../src/cli/cmd/tui/ui/spinner"

// Mirrors the prompt footer's spinnerDef (component/prompt/index.tsx).
// Pacing at the footer's 40ms tick: 120ms/dot → 2.4s per sweep, 960ms per
// chomp, 480ms hold at each edge, 5.64s full cycle.
const OPTS = {
  color: "#9333ea",
  style: "pacman",
  width: 20,
  holdStart: 12,
  holdEnd: 12,
  moveEvery: 3,
  chompFrames: 12,
  trailSide: "ahead",
  trailSteps: 4,
  inactiveFactor: 0.4,
  enableFading: false,
} as const

const HEADS = new Set(["●", "◐", "◑"])
const WIDTH = 20
const MOVE = 3
const HOLD = 12
const CHOMP = 12
const FORWARD = WIDTH * MOVE // 60 ticks: frames 0..59
const HOLD_END = HOLD // frames 60..71
const BACKWARD = (WIDTH - 1) * MOVE // 57 ticks: frames 72..128
const HOLD_START = HOLD // frames 129..140
const FRAMES = FORWARD + HOLD_END + BACKWARD + HOLD_START // 141

const headPos = (frame: string) => [...frame].findIndex((c) => HEADS.has(c))
const alpha = (c: ReturnType<ReturnType<typeof createColors>>) =>
  typeof c === "string" ? 1 : (c as { a: number }).a

describe("pacman spinner frames", () => {
  const frames = createFrames(OPTS)
  const gen = createColors(OPTS)

  test("generates the full bidirectional cycle", () => {
    expect(frames.length).toBe(FRAMES)
  })

  test("never renders the fire emoji", () => {
    for (const frame of frames) expect(frame.includes("🔥")).toBe(false)
  })

  test("every frame is WIDTH cells with exactly one head", () => {
    for (const [i, frame] of frames.entries()) {
      const chars = [...frame]
      expect(chars.length, `frame ${i}: ${JSON.stringify(frame)}`).toBe(WIDTH)
      const head = chars.filter((c) => HEADS.has(c))
      expect(head.length, `frame ${i}: ${JSON.stringify(frame)}`).toBe(1)
      for (const c of chars) expect(HEADS.has(c) || c === "·" || c === " ").toBe(true)
    }
  })

  test("eats the field: dots only ahead of him, eaten side empty", () => {
    for (const [i, frame] of frames.entries()) {
      const chars = [...frame]
      const pos = chars.findIndex((c) => HEADS.has(c))
      const foodLeft = chars[0] === "·" // head at 0 -> food must be on the right
      for (let j = 0; j < WIDTH; j++) {
        if (j === pos) continue
        const foodSide = foodLeft ? j < pos : j > pos
        expect(chars[j], `frame ${i} cell ${j}`).toBe(foodSide ? "·" : " ")
      }
    }
  })

  test("mouth opens toward the dot field, flipping at the edges", () => {
    for (const [i, frame] of frames.entries()) {
      const chars = [...frame]
      const pos = chars.findIndex((c) => HEADS.has(c))
      const open = Math.floor(i / CHOMP) % 2 === 0 // 12 ticks open / 12 closed
      if (!open) {
        expect(chars[pos], `frame ${i}`).toBe("●")
        continue
      }
      const foodLeft = chars[0] === "·"
      expect(chars[pos], `frame ${i}`).toBe(foodLeft ? "◑" : "◐")
    }
  })

  test("advances one cell every moveEvery ticks (slow eating), holds at edges", () => {
    for (let i = 0; i < FORWARD; i++) expect(headPos(frames[i]!), `forward frame ${i}`).toBe(Math.floor(i / MOVE))
    for (let i = FORWARD; i < FORWARD + HOLD_END; i++)
      expect(headPos(frames[i]!), `hold-end frame ${i}`).toBe(WIDTH - 1)
    for (let i = FORWARD + HOLD_END; i < FORWARD + HOLD_END + BACKWARD; i++)
      expect(headPos(frames[i]!), `backward frame ${i}`).toBe(WIDTH - 2 - Math.floor((i - FORWARD - HOLD_END) / MOVE))
    for (let i = FORWARD + HOLD_END + BACKWARD; i < FRAMES; i++)
      expect(headPos(frames[i]!), `hold-start frame ${i}`).toBe(0)
  })

  test("head never dims — even through the holds (old bug: 0.18 alpha)", () => {
    for (const [i, frame] of frames.entries()) {
      const pos = headPos(frame)
      const a = alpha(gen(i, pos, FRAMES, WIDTH))
      expect(a, `frame ${i} head alpha`).toBeGreaterThanOrEqual(0.9)
    }
  })

  test("every visible dot stays readable (old bug: 0.18 at sweep start)", () => {
    for (const [i, frame] of frames.entries()) {
      const chars = [...frame]
      for (const [j, c] of chars.entries()) {
        if (c !== "·") continue
        const a = alpha(gen(i, j, FRAMES, WIDTH))
        expect(a, `frame ${i} dot ${j} alpha`).toBeGreaterThanOrEqual(0.4)
      }
    }
  })

  test("gradient leads his mouth: near dots vivid, far dots at the floor", () => {
    // Frame 30: mid-forward sweep, head at 10, food to the right (cells 11..19).
    const near = alpha(gen(30, 11, FRAMES, WIDTH)) // distance 1
    const mid = alpha(gen(30, 12, FRAMES, WIDTH)) // distance 2
    const far = alpha(gen(30, 13, FRAMES, WIDTH)) // distance 3
    const floor = alpha(gen(3, 19, FRAMES, WIDTH)) // far cell -> inactive floor
    expect(near).toBeGreaterThan(mid)
    expect(mid).toBeGreaterThan(far)
    expect(far).toBeGreaterThanOrEqual(0.4)
    expect(floor).toBeCloseTo(0.4, 5)
  })
})
