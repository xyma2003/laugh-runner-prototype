import { describe, expect, it } from "vitest";
import {
  MAX_LAUGH_CHARGE,
  LAUGH_GUARD_MS,
  LAUGH_RESPAWN_DELAY_MS,
  PLAYER_MAX_X,
  PLAYER_MIN_X,
  addLaughCharge,
  canReleaseLaugh,
  distanceScore,
  isLaughProtected,
  movePlayerX,
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
