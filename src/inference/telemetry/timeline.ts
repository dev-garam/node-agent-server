export class Timeline {
  private readonly startedAt = Date.now();

  private readonly marks = new Map<string, number>();

  mark(name: string): void {
    this.marks.set(name, Date.now());
  }

  elapsedFromStart(name: string): number | undefined {
    const markedAt = this.marks.get(name);
    return markedAt ? markedAt - this.startedAt : undefined;
  }

  duration(from: string, to: string): number | undefined {
    const fromAt = this.marks.get(from);
    const toAt = this.marks.get(to);
    if (!fromAt || !toAt) {
      return undefined;
    }
    return toAt - fromAt;
  }

  total(): number {
    return Date.now() - this.startedAt;
  }
}

