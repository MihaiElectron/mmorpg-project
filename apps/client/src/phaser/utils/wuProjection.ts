/** ADR-0001 — projection isométrique WU → pixels Phaser.
 * screenX = 1000 + (worldX − worldY) / 16
 * screenY = (worldX + worldY) / 32
 */
export function wuToScreen(worldX: number, worldY: number): { x: number; y: number } {
  return {
    x: Math.round(1000 + (worldX - worldY) / 16),
    y: Math.round((worldX + worldY) / 32),
  };
}
