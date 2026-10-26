export const MAX_LAUGH_CHARGE = 3;
export const PLAYER_MIN_X = 105;
export const PLAYER_MAX_X = 1040;
export const PLAYER_STRAFE_SPEED = 330;
export const LAUGH_GUARD_MS = 3200;
export const LAUGH_RESPAWN_DELAY_MS = 5000;
export const RAGE_DURATION_MS = 3100;
export const MAX_LOCAL_LEADERBOARD_ENTRIES = 5;

export interface LeaderboardEntry {
  score: number;
  distanceMeters: number;
  createdAt: number;
}

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

export function isLaughProtected(now: number, protectedUntil: number): boolean {
  return now < protectedUntil;
}

export function postponeObstacleSpawn(currentSpawnAt: number, now: number): number {
  return Math.max(currentSpawnAt, now + LAUGH_RESPAWN_DELAY_MS);
}

export function droneHoverY(floorY: number, time: number, obstacleX: number): number {
  return floorY + Math.sin(time * 0.006 + obstacleX * 0.01) * 12;
}

export function effectRemainingRatio(now: number, expiresAt: number, duration: number): number {
  if (duration <= 0) return 0;
  return Math.max(0, Math.min(1, (expiresAt - now) / duration));
}

export function normalizeLeaderboard(entries: unknown): LeaderboardEntry[] {
  if (!Array.isArray(entries)) return [];

  return entries
    .filter((entry): entry is Record<string, unknown> => {
      if (!entry || typeof entry !== "object") return false;
      return (
        Number.isFinite(entry.score) &&
        Number.isFinite(entry.distanceMeters) &&
        Number.isFinite(entry.createdAt) &&
        Number(entry.score) >= 0 &&
        Number(entry.distanceMeters) >= 0 &&
        Number(entry.createdAt) > 0
      );
    })
    .map((entry) => ({
      score: Math.floor(Number(entry.score)),
      distanceMeters: Math.floor(Number(entry.distanceMeters)),
      createdAt: Math.floor(Number(entry.createdAt)),
    }))
    .sort(
      (left, right) =>
        right.score - left.score ||
        right.distanceMeters - left.distanceMeters ||
        left.createdAt - right.createdAt,
    )
    .slice(0, MAX_LOCAL_LEADERBOARD_ENTRIES);
}

export function addLeaderboardEntry(
  entries: unknown,
  entry: LeaderboardEntry,
): LeaderboardEntry[] {
  const current = Array.isArray(entries) ? entries : [];
  return normalizeLeaderboard([...current, entry]);
}
