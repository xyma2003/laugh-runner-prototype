import { describe, expect, it } from "vitest";
import {
  OBSTACLE_PATTERNS,
  ObstaclePatternDeck,
  PickupLaneDeck,
  availableObstaclePatterns,
  obstaclePatternCooldownMs,
  pickupLaneY,
} from "../src/spawnPatterns";

describe("obstacle pattern generation", () => {
  it("provides sixteen unique, ordered, reaction-safe patterns", () => {
    expect(OBSTACLE_PATTERNS).toHaveLength(16);
    expect(new Set(OBSTACLE_PATTERNS.map((pattern) => pattern.id)).size).toBe(16);

    OBSTACLE_PATTERNS.forEach((pattern) => {
      expect(pattern.obstacles[0]?.offsetX).toBe(0);
      for (let index = 1; index < pattern.obstacles.length; index += 1) {
        const gap = pattern.obstacles[index].offsetX - pattern.obstacles[index - 1].offsetX;
        expect(gap).toBeGreaterThanOrEqual(400);
      }
    });
  });

  it("unlocks harder patterns gradually", () => {
    expect(availableObstaclePatterns(0).every((pattern) => pattern.tier === 1)).toBe(true);
    expect(availableObstaclePatterns(30).some((pattern) => pattern.tier === 2)).toBe(true);
    expect(availableObstaclePatterns(60).some((pattern) => pattern.tier === 3)).toBe(true);
  });

  it("does not repeat any of the previous three patterns", () => {
    const deck = new ObstaclePatternDeck(() => 0.37);
    const ids = Array.from({ length: 30 }, () => deck.next(60).id);

    ids.forEach((id, index) => {
      expect(ids.slice(Math.max(0, index - 3), index)).not.toContain(id);
    });
  });

  it("keeps a rest window after the last obstacle in a pattern", () => {
    const pattern = OBSTACLE_PATTERNS.find((candidate) => candidate.id === "crate-drone-pit");
    expect(pattern).toBeDefined();
    const earlyCooldown = obstaclePatternCooldownMs(pattern!, 500, 10, 0);
    const lateCooldown = obstaclePatternCooldownMs(pattern!, 690, 60, 0);

    expect(earlyCooldown).toBeGreaterThan(1400 / 500 * 1000);
    expect(lateCooldown).toBeGreaterThan(1400 / 690 * 1000);
    expect(lateCooldown).toBeLessThan(earlyCooldown);
  });
});

describe("pickup lane generation", () => {
  it("varies teaching pickups between reachable low and middle lanes", () => {
    const deck = new PickupLaneDeck(() => 0);
    expect([deck.next(false), deck.next(false), deck.next(false)]).toEqual([
      "low",
      "middle",
      "low",
    ]);
  });

  it("adds a high lane after the teaching pickups", () => {
    const deck = new PickupLaneDeck(() => 0.999);
    const lanes = Array.from({ length: 6 }, () => deck.next(true));
    expect(lanes).toContain("high");
  });

  it("maps pickup lanes to distinct heights", () => {
    expect(pickupLaneY(586, "low")).toBe(470);
    expect(pickupLaneY(586, "middle")).toBe(381);
    expect(pickupLaneY(586, "high")).toBe(301);
  });
});
