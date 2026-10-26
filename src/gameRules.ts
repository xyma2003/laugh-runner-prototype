export const MAX_LAUGH_CHARGE = 3;

export function addLaughCharge(current: number, amount = 1): number {
  return Math.min(MAX_LAUGH_CHARGE, Math.max(0, current + amount));
}

export function canReleaseLaugh(charge: number): boolean {
  return charge >= MAX_LAUGH_CHARGE;
}

export function runnerSpeed(elapsedSeconds: number): number {
  const baseSpeed = 430;
  return Math.min(690, baseSpeed + Math.max(0, elapsedSeconds) * 6.5);
}

export function distanceScore(distanceMeters: number, bonusScore: number): number {
  return Math.max(0, Math.floor(distanceMeters * 10 + bonusScore));
}
