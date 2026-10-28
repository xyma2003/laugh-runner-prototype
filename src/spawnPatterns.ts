export type ObstacleKind = "crate" | "spike" | "drone" | "pit";
export type PickupLane = "low" | "middle" | "high";

export interface ObstaclePatternItem {
  kind: ObstacleKind;
  offsetX: number;
}

export interface ObstaclePattern {
  id: string;
  tier: 1 | 2 | 3;
  obstacles: readonly ObstaclePatternItem[];
}

export const OBSTACLE_PATTERNS: readonly ObstaclePattern[] = [
  { id: "crate-solo", tier: 1, obstacles: [{ kind: "crate", offsetX: 0 }] },
  { id: "spike-solo", tier: 1, obstacles: [{ kind: "spike", offsetX: 0 }] },
  { id: "pit-solo", tier: 1, obstacles: [{ kind: "pit", offsetX: 0 }] },
  { id: "drone-solo", tier: 1, obstacles: [{ kind: "drone", offsetX: 0 }] },
  {
    id: "crate-spike-wide",
    tier: 1,
    obstacles: [
      { kind: "crate", offsetX: 0 },
      { kind: "spike", offsetX: 560 },
    ],
  },
  {
    id: "spike-crate-wide",
    tier: 1,
    obstacles: [
      { kind: "spike", offsetX: 0 },
      { kind: "crate", offsetX: 560 },
    ],
  },
  {
    id: "crate-spike",
    tier: 2,
    obstacles: [
      { kind: "crate", offsetX: 0 },
      { kind: "spike", offsetX: 420 },
    ],
  },
  {
    id: "spike-pit",
    tier: 2,
    obstacles: [
      { kind: "spike", offsetX: 0 },
      { kind: "pit", offsetX: 460 },
    ],
  },
  {
    id: "pit-crate",
    tier: 2,
    obstacles: [
      { kind: "pit", offsetX: 0 },
      { kind: "crate", offsetX: 500 },
    ],
  },
  {
    id: "drone-crate",
    tier: 2,
    obstacles: [
      { kind: "drone", offsetX: 0 },
      { kind: "crate", offsetX: 700 },
    ],
  },
  {
    id: "crate-drone",
    tier: 2,
    obstacles: [
      { kind: "crate", offsetX: 0 },
      { kind: "drone", offsetX: 700 },
    ],
  },
  {
    id: "crate-spike-crate",
    tier: 3,
    obstacles: [
      { kind: "crate", offsetX: 0 },
      { kind: "spike", offsetX: 400 },
      { kind: "crate", offsetX: 850 },
    ],
  },
  {
    id: "spike-pit-spike",
    tier: 3,
    obstacles: [
      { kind: "spike", offsetX: 0 },
      { kind: "pit", offsetX: 420 },
      { kind: "spike", offsetX: 880 },
    ],
  },
  {
    id: "drone-pit",
    tier: 3,
    obstacles: [
      { kind: "drone", offsetX: 0 },
      { kind: "pit", offsetX: 700 },
    ],
  },
  {
    id: "pit-drone",
    tier: 3,
    obstacles: [
      { kind: "pit", offsetX: 0 },
      { kind: "drone", offsetX: 700 },
    ],
  },
  {
    id: "crate-drone-pit",
    tier: 3,
    obstacles: [
      { kind: "crate", offsetX: 0 },
      { kind: "drone", offsetX: 700 },
      { kind: "pit", offsetX: 1400 },
    ],
  },
];

function difficultyTier(elapsedSeconds: number): 1 | 2 | 3 {
  if (elapsedSeconds < 25) return 1;
  if (elapsedSeconds < 55) return 2;
  return 3;
}

export function availableObstaclePatterns(elapsedSeconds: number): readonly ObstaclePattern[] {
  const unlockedTier = difficultyTier(elapsedSeconds);
  return OBSTACLE_PATTERNS.filter((pattern) => pattern.tier <= unlockedTier);
}

function shuffle<T>(items: readonly T[], random: () => number): T[] {
  const shuffled = [...items];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.max(0, Math.min(0.999999, random())) * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
}

export class ObstaclePatternDeck {
  private bag: ObstaclePattern[] = [];
  private recentIds: string[] = [];
  private unlockedTier: 1 | 2 | 3 = 1;

  constructor(private readonly random: () => number = Math.random) {}

  reset(): void {
    this.bag = [];
    this.recentIds = [];
    this.unlockedTier = 1;
  }

  next(elapsedSeconds: number): ObstaclePattern {
    const nextTier = difficultyTier(elapsedSeconds);
    if (nextTier !== this.unlockedTier) {
      this.unlockedTier = nextTier;
      this.bag = [];
    }

    let pattern = this.takeFromBag();
    if (!pattern) {
      const unlocked = availableObstaclePatterns(elapsedSeconds);
      const fresh = unlocked.filter((candidate) => !this.recentIds.includes(candidate.id));
      this.bag = shuffle(fresh.length > 0 ? fresh : unlocked, this.random);
      pattern = this.takeFromBag();
    }

    if (!pattern) throw new Error("No obstacle patterns are available");
    this.recentIds = [...this.recentIds, pattern.id].slice(-3);
    return pattern;
  }

  private takeFromBag(): ObstaclePattern | undefined {
    while (this.bag.length > 0) {
      const candidate = this.bag.shift();
      if (candidate && !this.recentIds.includes(candidate.id)) return candidate;
    }
    return undefined;
  }
}

export function obstaclePatternCooldownMs(
  pattern: ObstaclePattern,
  speed: number,
  elapsedSeconds: number,
  randomValue: number,
): number {
  const spanX = pattern.obstacles.at(-1)?.offsetX ?? 0;
  const travelMs = (spanX / Math.max(1, speed)) * 1000;
  const [minimumRest, maximumRest] = elapsedSeconds < 25
    ? [1100, 1500]
    : elapsedSeconds < 55
      ? [850, 1250]
      : [700, 1050];
  const normalizedRandom = Math.max(0, Math.min(1, randomValue));
  return travelMs + minimumRest + (maximumRest - minimumRest) * normalizedRandom;
}

const PICKUP_LANES: readonly PickupLane[] = ["low", "middle", "high"];

export class PickupLaneDeck {
  private recentLanes: PickupLane[] = [];

  constructor(private readonly random: () => number = Math.random) {}

  reset(): void {
    this.recentLanes = [];
  }

  next(allowHigh: boolean): PickupLane {
    const available = PICKUP_LANES.filter((lane) => allowHigh || lane !== "high");
    const fresh = available.filter((lane) => !this.recentLanes.includes(lane));
    const choices = fresh.length > 0 ? fresh : available;
    const index = Math.floor(Math.max(0, Math.min(0.999999, this.random())) * choices.length);
    const lane = choices[index];
    this.recentLanes = [...this.recentLanes, lane].slice(-2);
    return lane;
  }
}

export function pickupLaneY(floorY: number, lane: PickupLane): number {
  const offsets: Record<PickupLane, number> = {
    low: 116,
    middle: 205,
    high: 285,
  };
  return floorY - offsets[lane];
}
