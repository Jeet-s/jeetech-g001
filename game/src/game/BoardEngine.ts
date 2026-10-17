/**
 * Minimal, framework-agnostic board engine for UI-centric puzzle games.
 * The builder specializes the rules (sorting / routing / matching) from the GDD;
 * the state-machine shape stays stable so QA and analytics hooks are reusable.
 */
export type Cell = { id: string; value: string | null };

export interface LevelSpec {
  id: number;
  cells: number;
  goal: string;
  timeLimitSeconds: number; // 0 = untimed
  maxMistakes: number;
}

export type GameStatus = "playing" | "won" | "lost";

export class BoardEngine {
  readonly level: LevelSpec;
  cells: Cell[];
  mistakes = 0;
  status: GameStatus = "playing";

  constructor(level: LevelSpec) {
    this.level = level;
    this.cells = Array.from({ length: level.cells }, (_, i) => ({
      id: `c${i}`,
      value: null,
    }));
  }

  place(cellId: string, value: string, correct: boolean): GameStatus {
    if (this.status !== "playing") return this.status;
    const cell = this.cells.find((c) => c.id === cellId);
    if (cell) cell.value = value;
    if (!correct && ++this.mistakes >= this.level.maxMistakes) {
      this.status = "lost";
    } else if (this.cells.every((c) => c.value !== null)) {
      this.status = "won";
    }
    return this.status;
  }

  reset(): void {
    this.cells.forEach((c) => (c.value = null));
    this.mistakes = 0;
    this.status = "playing";
  }
}
