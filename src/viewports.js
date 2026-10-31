/**
 * Convert a DOM panel's rectangle into a full WebGL viewport plus a separately
 * clipped scissor rectangle. The FULL viewport and camera aspect must not change
 * when the panel is partially scrolled outside the visible canvas.
 *
 * All inputs use CSS pixels, not device pixels; Three.js applies DPR internally.
 */
export function calculateViewRect(panel, canvas, bufferWidth, bufferHeight) {
  if (panel.width <= 0 || panel.height <= 0 ||
      canvas.width <= 0 || canvas.height <= 0 ||
      bufferWidth <= 0 || bufferHeight <= 0) return null;

  const sx = bufferWidth / canvas.width;
  const sy = bufferHeight / canvas.height;
  const left = (panel.left - canvas.left) * sx;
  const top = (panel.top - canvas.top) * sy;
  const width = panel.width * sx;
  const height = panel.height * sy;

  // A panel can extend beyond the visible canvas. Keep its real, uncut size.
  const viewport = {
    x: left,
    y: bufferHeight - top - height,
    width,
    height,
  };

  // Only the GL scissor is restricted to the visible canvas.
  const clipL = Math.max(0, left);
  const clipT = Math.max(0, top);
  const clipR = Math.min(bufferWidth, left + width);
  const clipB = Math.min(bufferHeight, top + height);
  if (clipR <= clipL || clipB <= clipT) return null;

  return {
    aspect: panel.width / panel.height,
    viewport,
    scissor: {
      x: clipL,
      y: bufferHeight - clipB,
      width: clipR - clipL,
      height: clipB - clipT,
    },
  };
}
