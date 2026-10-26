import { describe, expect, it } from "vitest";
import {
  MAX_LAUGH_CHARGE,
  LAUGH_GUARD_MS,
  LAUGH_RESPAWN_DELAY_MS,
  MAX_LOCAL_LEADERBOARD_ENTRIES,
  PLAYER_MAX_X,
  PLAYER_MIN_X,
  RAGE_DURATION_MS,
  addLaughCharge,
  addLeaderboardEntry,
  canReleaseLaugh,
  distanceScore,
  droneHoverY,
  effectRemainingRatio,
  isLaughProtected,
  movePlayerX,
  normalizeLeaderboard,
  postponeObstacleSpawn,
  runnerSpeed,
} from "../src/gameRules";

describe("laugh synthesis", () => {
  it("fills at three and never overflows", () => {
    expect(addLaughCharge(0)).toBe(1);
    expect(addLaughCharge(2)).toBe(MAX_LAUGH_CHARGE);
    expect(addLaughCharge(3)).toBe(MAX_LAUGH_CHARGE);
  });

  it("only releases after all three faces are collected", () => {
    expect(canReleaseLaugh(2)).toBe(false);
    expect(canReleaseLaugh(3)).toBe(true);
  });
});

describe("difficulty and scoring", () => {
  it("increases speed but keeps it bounded", () => {
    expect(runnerSpeed(0)).toBe(430);
    expect(runnerSpeed(20)).toBeGreaterThan(430);
    expect(runnerSpeed(999)).toBe(690);
  });

  it("combines distance and bonus points", () => {
    expect(distanceScore(12.9, 250)).toBe(379);
  });
});

describe("horizontal movement", () => {
  it("moves left and right with a bounded speed", () => {
    expect(movePlayerX(210, -1, 0.1)).toBe(177);
    expect(movePlayerX(210, 1, 0.1)).toBe(243);
  });

  it("keeps the runner inside the playable lane", () => {
    expect(movePlayerX(PLAYER_MIN_X, -1, 1)).toBe(PLAYER_MIN_X);
    expect(movePlayerX(PLAYER_MAX_X, 1, 1)).toBe(PLAYER_MAX_X);
  });

  it("lets the runner reach at least eighty percent of the stage", () => {
    expect(PLAYER_MAX_X / 1280).toBeGreaterThanOrEqual(0.8);
  });
});

describe("laugh protection", () => {
  it("covers the complete post-skill recovery window", () => {
    const releasedAt = 5_000;
    const protectedUntil = releasedAt + LAUGH_GUARD_MS;
    expect(isLaughProtected(5_900, protectedUntil)).toBe(true);
    expect(isLaughProtected(protectedUntil, protectedUntil)).toBe(false);
  });

  it("resets obstacle spawning beyond the protection window", () => {
    expect(LAUGH_RESPAWN_DELAY_MS).toBeGreaterThan(LAUGH_GUARD_MS);
    expect(postponeObstacleSpawn(5_500, 5_000)).toBe(5_000 + LAUGH_RESPAWN_DELAY_MS);
    expect(postponeObstacleSpawn(12_000, 5_000)).toBe(12_000);
  });
});

describe("obstacle rendering and collision alignment", () => {
  it("keeps the flying obstacle anchored around the road height", () => {
    expect(droneHoverY(586, 0, 0)).toBe(586);
    expect(droneHoverY(586, 250, 400)).toBeGreaterThanOrEqual(574);
    expect(droneHoverY(586, 250, 400)).toBeLessThanOrEqual(598);
  });
});

describe("rage duration", () => {
  it("shrinks smoothly from full to empty and stays bounded", () => {
    const startedAt = 10_000;
    const expiresAt = startedAt + RAGE_DURATION_MS;
    expect(effectRemainingRatio(startedAt, expiresAt, RAGE_DURATION_MS)).toBe(1);
    expect(effectRemainingRatio(startedAt + RAGE_DURATION_MS / 2, expiresAt, RAGE_DURATION_MS)).toBe(0.5);
    expect(effectRemainingRatio(expiresAt, expiresAt, RAGE_DURATION_MS)).toBe(0);
    expect(effectRemainingRatio(expiresAt + 500, expiresAt, RAGE_DURATION_MS)).toBe(0);
  });
});

describe("local leaderboard", () => {
  const entry = (score: number, distanceMeters: number, createdAt: number) => ({
    score,
    distanceMeters,
    createdAt,
  });

  it("sorts higher scores first and uses distance as the tie-breaker", () => {
    expect(
      normalizeLeaderboard([
        entry(500, 40, 3),
        entry(800, 30, 2),
        entry(500, 70, 1),
      ]),
    ).toEqual([entry(800, 30, 2), entry(500, 70, 1), entry(500, 40, 3)]);
  });

  it("keeps only the five best local results", () => {
    const results = normalizeLeaderboard(
      Array.from({ length: 8 }, (_, index) => entry(index * 100, index * 10, index + 1)),
    );
    expect(results).toHaveLength(MAX_LOCAL_LEADERBOARD_ENTRIES);
    expect(results.map((result) => result.score)).toEqual([700, 600, 500, 400, 300]);
  });

  it("ignores malformed saved data", () => {
    expect(normalizeLeaderboard(null)).toEqual([]);
    expect(normalizeLeaderboard([{ score: "100", distanceMeters: 8, createdAt: 1 }])).toEqual([]);
  });

  it("adds a new run without mutating the previous list", () => {
    const previous = [entry(300, 20, 1)];
    const results = addLeaderboardEntry(previous, entry(900, 80, 2));
    expect(previous).toEqual([entry(300, 20, 1)]);
    expect(results[0]).toEqual(entry(900, 80, 2));
  });
});
