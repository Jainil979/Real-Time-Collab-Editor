// client/src/utils.js

/**
 * Generate a deterministic HSL color from a string (e.g., clientId).
 * The color is consistent for the same ID across all clients.
 */
export function getClientColor(clientId) {
  let hash = 0;
  for (let i = 0; i < clientId.length; i++) {
    hash = clientId.charCodeAt(i) + ((hash << 5) - hash);
    hash = hash & hash; // Convert to 32bit integer
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 70%, 50%)`;
}