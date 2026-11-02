/** Counts only repeat selections of an already planned target, never its selection click. */
export class DoubleClickConfirmation {
  private first: { target: string; time: number } | null = null;
  private submitted = false;

  reset() {
    this.first = null;
    this.submitted = false;
  }

  consume() {
    this.first = null;
    this.submitted = true;
  }

  repeat(target: string, time: number | undefined, ready: boolean): boolean {
    if (this.submitted) return false;
    if (!ready || time === undefined || !Number.isFinite(time)) {
      this.first = null;
      return false;
    }
    const first = this.first;
    if (first?.target === target && time > first.time && time - first.time <= 400) {
      this.consume();
      return true;
    }
    this.first = { target, time };
    return false;
  }
}
