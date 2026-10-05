export function panelWidth(preferred: number, viewport: number): number {
  if (viewport <= 760) return Math.max(0, viewport)
  return Math.min(Math.max(320, viewport - 560), 960, Math.max(320, preferred))
}

/** Fit the entire frame, including a rotated frame, into the available canvas. */
export function fitFrame(width: number, height: number, availableWidth: number, availableHeight: number, rotation: 0 | 90 = 0) {
  if (![width, height, availableWidth, availableHeight].every(value => Number.isFinite(value) && value > 0)) {
    return { width: 0, height: 0, shellWidth: 0, shellHeight: 0, scale: 0 }
  }
  const rotated = rotation === 90
  const scale = Math.min(availableWidth / (rotated ? height : width), availableHeight / (rotated ? width : height))
  return { width: width * scale, height: height * scale, shellWidth: (rotated ? height : width) * scale, shellHeight: (rotated ? width : height) * scale, scale }
}

/** Fill the preview width while retaining the device aspect ratio. The stage
 * scrolls vertically when a portrait device is taller than the viewport. */
export function fillFrame(width: number, height: number, availableWidth: number, rotation: 0 | 90 = 0) {
  if (![width, height, availableWidth].every(value => Number.isFinite(value) && value > 0)) {
    return { width: 0, height: 0, shellWidth: 0, shellHeight: 0, scale: 0 }
  }
  const rotated = rotation === 90
  const scale = availableWidth / (rotated ? height : width)
  return { width: width * scale, height: height * scale, shellWidth: (rotated ? height : width) * scale, shellHeight: (rotated ? width : height) * scale, scale }
}

export function deviceCoordinate(x: number, y: number, rotation: 0 | 90): { x: number; y: number } {
  return rotation === 90 ? { x: y, y: 1 - x } : { x, y }
}
