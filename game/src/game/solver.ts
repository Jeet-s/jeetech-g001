import { PathEngine, type Direction } from "./PathEngine";

/**
 * Shortest full-cover stroke sequence from the engine's CURRENT state (BFS over
 * the real rules: brush cell + painted set + open gates). Used by the Hint
 * button and by QA level replay (src/modules/qa.ts) to play toward the win from
 * wherever the player is. Returns [] when the board is already covered and null
 * when nothing can win from here (a crumble already cut the maze) or the search
 * exceeds its state cap.
 */
const DIRS: Direction[] = ["up", "down", "left", "right"];

interface Node {
  painted: Set<string>;
  open: Set<string>;
  x: number;
  y: number;
  path: Direction[];
}

export function solveFrom(src: PathEngine, maxStates = 120_000): Direction[] | null {
  if (src.painted.size >= src.target) return [];
  const probe = new PathEngine(src.level);
  const keyOf = (n: { painted: Set<string>; open: Set<string>; x: number; y: number }) =>
    `${n.x},${n.y}|${[...n.painted].sort().join(";")}|${[...n.open].sort().join("")}`;
  const start: Node = { painted: new Set(src.painted), open: new Set(src.openGroups), x: src.cursorX, y: src.cursorY, path: [] };
  const seen = new Set<string>([keyOf(start)]);
  let frontier: Node[] = [start];
  while (frontier.length && seen.size < maxStates) {
    const next: Node[] = [];
    for (const n of frontier) {
      for (const d of DIRS) {
        probe.painted = new Set(n.painted);
        probe.openGroups = new Set(n.open);
        probe.cursorX = n.x;
        probe.cursorY = n.y;
        probe.status = "playing";
        const before = probe.moves;
        probe.move(d);
        (probe as unknown as { history: unknown[] }).history.length = 0;
        if (probe.moves === before) continue;
        const child: Node = { painted: probe.painted, open: probe.openGroups, x: probe.cursorX, y: probe.cursorY, path: [...n.path, d] };
        if (child.painted.size >= src.target) return child.path;
        const k = keyOf(child);
        if (seen.has(k)) continue;
        seen.add(k);
        next.push(child);
      }
    }
    frontier = next;
  }
  return null;
}

/** First stroke of the shortest win from here (null = no win reachable). */
export function nextWinningMove(engine: PathEngine): Direction | null {
  const path = solveFrom(engine);
  return path && path.length ? path[0] : null;
}
