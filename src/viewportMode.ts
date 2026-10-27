export type MobileViewportMode = "desktop" | "portrait" | "landscape";

export function mobileViewportMode(
  width: number,
  height: number,
  isTouchDevice: boolean,
  isCompactMode: boolean,
): MobileViewportMode {
  const isPortrait = height > width;
  const looksPhoneSized = isPortrait ? width <= 520 : height <= 520;

  if (
    isCompactMode ||
    width <= 0 ||
    height <= 0 ||
    Math.min(width, height) > 820 ||
    (!isTouchDevice && !looksPhoneSized)
  ) {
    return "desktop";
  }

  return isPortrait ? "portrait" : "landscape";
}
