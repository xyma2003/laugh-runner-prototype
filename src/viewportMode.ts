export type MobileViewportMode = "desktop" | "portrait" | "landscape";

export function mobileViewportMode(
  width: number,
  height: number,
  isTouchDevice: boolean,
  isCompactMode: boolean,
): MobileViewportMode {
  if (isCompactMode || !isTouchDevice || width <= 0 || height <= 0 || Math.min(width, height) > 820) {
    return "desktop";
  }

  return height > width ? "portrait" : "landscape";
}
