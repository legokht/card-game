import { describe, expect, it } from 'vitest';
import { Rng } from '../src/engine/rng';

describe('Rng', () => {
  it('같은 시드는 같은 수열을 만든다', () => {
    const a = new Rng('seed-1');
    const b = new Rng('seed-1');
    const seqA = Array.from({ length: 20 }, () => a.next());
    const seqB = Array.from({ length: 20 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });

  it('다른 시드는 다른 수열을 만든다', () => {
    const a = new Rng('seed-1');
    const b = new Rng('seed-2');
    expect(a.next()).not.toEqual(b.next());
  });

  it('next는 [0, 1) 범위를 벗어나지 않는다', () => {
    const rng = new Rng('range');
    for (let i = 0; i < 5000; i++) {
      const v = rng.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('int는 양끝을 포함하고 범위를 지킨다', () => {
    const rng = new Rng('int');
    const seen = new Set<number>();
    for (let i = 0; i < 5000; i++) {
      const v = rng.int(1, 6);
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(1);
      expect(v).toBeLessThanOrEqual(6);
      seen.add(v);
    }
    expect(seen).toEqual(new Set([1, 2, 3, 4, 5, 6]));
  });

  it('int의 min과 max가 같으면 그 값만 나온다', () => {
    const rng = new Rng('single');
    expect(rng.int(4, 4)).toBe(4);
  });

  it('int는 뒤집힌 범위를 거부한다', () => {
    const rng = new Rng('bad');
    expect(() => rng.int(5, 1)).toThrow(RangeError);
  });

  it('shuffle은 원본을 바꾸지 않고 원소를 보존한다', () => {
    const source = [1, 2, 3, 4, 5, 6, 7, 8];
    const rng = new Rng('shuffle');
    const shuffled = rng.shuffle(source);
    expect(source).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(shuffled.slice().sort((x, y) => x - y)).toEqual(source);
  });

  it('shuffle은 같은 시드에서 같은 결과를 낸다', () => {
    const source = [1, 2, 3, 4, 5, 6, 7, 8];
    expect(new Rng('s').shuffle(source)).toEqual(new Rng('s').shuffle(source));
  });

  it('pick은 빈 배열을 거부한다', () => {
    expect(() => new Rng('p').pick([])).toThrow(RangeError);
  });

  it('상태를 저장하고 복원하면 수열이 이어진다', () => {
    const rng = new Rng('save');
    rng.next();
    const saved = rng.getState();
    const expected = [rng.next(), rng.next(), rng.next()];

    const restored = new Rng('other');
    restored.setState(saved);
    expect([restored.next(), restored.next(), restored.next()]).toEqual(expected);
  });
});
