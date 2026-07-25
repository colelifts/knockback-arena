export class MatchmakingQueue {
  private readonly waiting: string[] = [];
  join(socketId: string): [string, string] | null {
    if (!this.waiting.includes(socketId)) this.waiting.push(socketId);
    return this.waiting.length >= 2 ? [this.waiting.shift()!, this.waiting.shift()!] : null;
  }
  cancel(socketId: string): void {
    const index = this.waiting.indexOf(socketId);
    if (index >= 0) this.waiting.splice(index, 1);
  }
  get size(): number {
    return this.waiting.length;
  }
}
