export class RateLimiter {
  private readonly perPeer = new Map<string, number[]>();
  private global: number[] = [];

  constructor(
    private readonly now: () => number,
    private readonly windowMs = 60_000,
    private readonly perPeerLimit = 5,
    private readonly globalLimit = 30,
  ) {}

  allow(ip: string): boolean {
    const threshold = this.now() - this.windowMs;
    this.global = this.global.filter((time) => time > threshold);
    const attempts = (this.perPeer.get(ip) ?? []).filter((time) => time > threshold);
    this.global.push(this.now());
    attempts.push(this.now());
    this.perPeer.set(ip, attempts);
    return this.global.length <= this.globalLimit && attempts.length <= this.perPeerLimit;
  }
}
