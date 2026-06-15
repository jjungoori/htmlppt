/**
 * Invariant #2: every mutation flows through a Command so undo/redo is free.
 * Wired from day one — UI never mutates the document directly.
 */

export interface Command {
  /** human label, useful for debugging / future history panel. */
  readonly label: string;
  apply(): void;
  invert(): void;
  /**
   * Optional coalescing: while dragging we emit many tiny commands; merge
   * consecutive same-kind commands into one history entry.
   */
  mergeWith?(next: Command): boolean;
}

export class History {
  private undoStack: Command[] = [];
  private redoStack: Command[] = [];
  private listeners = new Set<() => void>();

  constructor(private readonly limit = 200) {}

  push(cmd: Command, coalesce = false): void {
    cmd.apply();
    const top = this.undoStack[this.undoStack.length - 1];
    if (coalesce && top && top.mergeWith && top.mergeWith(cmd)) {
      // merged into existing entry; nothing more to record.
    } else {
      this.undoStack.push(cmd);
      if (this.undoStack.length > this.limit) this.undoStack.shift();
    }
    this.redoStack.length = 0;
    this.emit();
  }

  /** Drop all undo/redo entries — e.g. after loading a fresh document. */
  clear(): void {
    this.undoStack.length = 0;
    this.redoStack.length = 0;
    this.emit();
  }

  canUndo(): boolean {
    return this.undoStack.length > 0;
  }
  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  undo(): void {
    const cmd = this.undoStack.pop();
    if (!cmd) return;
    cmd.invert();
    this.redoStack.push(cmd);
    this.emit();
  }

  redo(): void {
    const cmd = this.redoStack.pop();
    if (!cmd) return;
    cmd.apply();
    this.undoStack.push(cmd);
    this.emit();
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(): void {
    for (const fn of this.listeners) fn();
  }
}
