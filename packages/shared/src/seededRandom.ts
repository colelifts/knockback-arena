export class SeededRandom {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0 || 0x6d2b79f5;
  }

  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let value = this.state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  }

  integer(min: number, maxExclusive: number): number {
    return Math.floor(this.next() * (maxExclusive - min)) + min;
  }

  pick<T>(values: readonly T[]): T {
    if (values.length === 0) throw new Error('Cannot pick from an empty collection');
    return values[this.integer(0, values.length)]!;
  }

  shuffle<T>(values: readonly T[]): T[] {
    const result = [...values];
    for (let i = result.length - 1; i > 0; i -= 1) {
      const j = this.integer(0, i + 1);
      [result[i], result[j]] = [result[j]!, result[i]!];
    }
    return result;
  }
}

export const hashSeed = (text: string): number => {
  let hash = 2166136261;
  for (const character of text) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};
