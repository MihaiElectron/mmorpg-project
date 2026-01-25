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
