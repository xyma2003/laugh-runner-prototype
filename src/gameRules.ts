export const MAX_LAUGH_CHARGE = 3;
export const PLAYER_MIN_X = 105;
export const PLAYER_MAX_X = 570;
export const PLAYER_STRAFE_SPEED = 330;

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

export function movePlayerX(current: number, direction: number, deltaSeconds: number): number {
  const normalizedDirection = Math.max(-1, Math.min(1, direction));
  const next = current + normalizedDirection * PLAYER_STRAFE_SPEED * Math.max(0, deltaSeconds);
  return Math.max(PLAYER_MIN_X, Math.min(PLAYER_MAX_X, next));
}
