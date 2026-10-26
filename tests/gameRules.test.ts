import { describe, expect, it } from "vitest";
import {
  MAX_LAUGH_CHARGE,
  addLaughCharge,
  canReleaseLaugh,
  distanceScore,
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
