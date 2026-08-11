/**
 * 시드 기반 결정론적 난수 생성기.
 *
 * 로그라이크는 같은 시드에서 항상 같은 런이 재현되어야 디버깅과 리플레이가
 * 가능하다. Math.random 대신 항상 이 RNG를 사용한다.
 */

/** 문자열 시드를 32비트 정수로 변환한다 (xmur3). */
function hashSeed(seed: string): number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^ (h >>> 16)) >>> 0;
}

export class Rng {
  private state: number;

  constructor(seed: string | number) {
    const s = typeof seed === 'number' ? seed >>> 0 : hashSeed(seed);
    // 상태 0은 mulberry32를 고정점에 가두므로 피한다.
    this.state = s === 0 ? 0x9e3779b9 : s;
  }

  /** 현재 내부 상태. 저장/복원용. */
  getState(): number {
    return this.state;
  }

  /** getState로 얻은 값을 되돌려 런 중간부터 재현한다. */
  setState(state: number): void {
    this.state = state >>> 0;
  }

  /** [0, 1) 구간의 실수. */
  next(): number {
    // mulberry32
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** [min, max] 구간의 정수 (양끝 포함). */
  int(min: number, max: number): number {
    if (max < min) throw new RangeError(`빈 범위: [${min}, ${max}]`);
    return min + Math.floor(this.next() * (max - min + 1));
  }

  /** 배열에서 하나를 균등하게 고른다. */
  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new RangeError('빈 배열에서 뽑을 수 없다');
    return items[this.int(0, items.length - 1)]!;
  }

  /** 원본을 건드리지 않고 섞은 새 배열을 반환한다 (Fisher-Yates). */
  shuffle<T>(items: readonly T[]): T[] {
    const out = items.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = this.int(0, i);
      const a = out[i]!;
      const b = out[j]!;
      out[i] = b;
      out[j] = a;
    }
    return out;
  }
}
