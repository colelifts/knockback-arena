interface Bucket {
  tokens: number;
  updatedAt: number;
}

export class RateLimiter {
  private readonly buckets = new Map<string, Bucket>();
  constructor(
    private readonly capacity: number,
    private readonly refillPerSecond: number,
  ) {}

  allow(key: string, now = Date.now()): boolean {
    const bucket = this.buckets.get(key) ?? { tokens: this.capacity, updatedAt: now };
    bucket.tokens = Math.min(
      this.capacity,
      bucket.tokens + ((now - bucket.updatedAt) / 1000) * this.refillPerSecond,
    );
    bucket.updatedAt = now;
    if (bucket.tokens < 1) {
      this.buckets.set(key, bucket);
      return false;
    }
    bucket.tokens -= 1;
    this.buckets.set(key, bucket);
    return true;
  }

  delete(key: string): void {
    this.buckets.delete(key);
  }
}
