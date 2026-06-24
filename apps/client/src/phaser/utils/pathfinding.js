// Bresenham line — vérifie que chaque cellule traversée est walkable.
// Cohérent avec le pathfinder A* : les coins diagonaux ne sont pas vérifiés
// (même comportement que les voisins diagonaux de A*).
function hasLineOfSight(grid, x0, y0, x1, y1) {
  if (!grid[y0] || grid[y0][x0] === undefined) return false;
  if (!grid[y1] || grid[y1][x1] === undefined) return false;

  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : x0 > x1 ? -1 : 0;
  const sy = y0 < y1 ? 1 : y0 > y1 ? -1 : 0;
  let err = dx - dy;
  let x = x0;
  let y = y0;

  while (true) {
    if (!grid[y] || grid[y][x] === undefined || grid[y][x] === 1) return false;
    if (x === x1 && y === y1) return true;
    const e2 = 2 * err;
    if (e2 > -dy) { err -= dy; x += sx; }
    if (e2 < dx) { err += dx; y += sy; }
  }
}

// String-pulling greedy : supprime les waypoints intermédiaires si la ligne
// de vue est libre. Premier et dernier points toujours conservés.
// Retourne le path inchangé si grid est null ou path.length ≤ 2.
export function smoothPath(path, grid) {
  if (!path || path.length === 0) return [];
  if (path.length <= 2) return path;
  if (!grid) return path;

  const smooth = [path[0]];
  let anchor = 0;

  for (let current = 2; current < path.length; current++) {
    const from = path[anchor];
    const to = path[current];
    if (!hasLineOfSight(grid, from.x, from.y, to.x, to.y)) {
      smooth.push(path[current - 1]);
      anchor = current - 1;
    }
  }

  const last = path[path.length - 1];
  const prev = smooth[smooth.length - 1];
  if (prev.x !== last.x || prev.y !== last.y) smooth.push(last);

  return smooth;
}

export default class Pathfinder {
  constructor(grid) {
    this.grid = grid; // 0 = walkable, 1 = blocked
  }

  findPath(startX, startY, endX, endY) {
    const open = [];
    const closed = new Set();

    const start = { x: startX, y: startY, g: 0, h: 0, f: 0, parent: null };
    open.push(start);

    const key = (x, y) => `${x},${y}`;

    const neighbors = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
      [1, 1],
      [1, -1],
      [-1, 1],
      [-1, -1],
    ];

    while (open.length > 0) {
      open.sort((a, b) => a.f - b.f);
      const current = open.shift();

      if (current.x === endX && current.y === endY) {
        const path = [];
        let node = current;
        while (node) {
          path.push({ x: node.x, y: node.y });
          node = node.parent;
        }
        return path.reverse();
      }

      closed.add(key(current.x, current.y));

      for (const [dx, dy] of neighbors) {
        const nx = current.x + dx;
        const ny = current.y + dy;

        if (!this.grid[ny] || this.grid[ny][nx] === undefined) continue;
        if (this.grid[ny][nx] === 1) continue;
        if (closed.has(key(nx, ny))) continue;

        const g = current.g + Math.hypot(dx, dy);
        const h = Math.hypot(endX - nx, endY - ny);
        const f = g + h;

        const existing = open.find((n) => n.x === nx && n.y === ny);
        if (existing && existing.f <= f) continue;

        open.push({
          x: nx,
          y: ny,
          g,
          h,
          f,
          parent: current,
        });
      }
    }

    return null;
  }
}
