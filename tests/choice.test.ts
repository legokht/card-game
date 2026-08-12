import { beforeEach, describe, expect, it } from 'vitest';
import { Rng } from '../src/engine/rng';
import { choose, createGame, deckByKind, drawEvent, summarize } from '../src/choice/engine';
import { applyEffects, countKind, resetUidCounter } from '../src/choice/effects';
import { EVENTS } from '../src/choice/events';
import { CARD_POOL, CURSE_DAMAGE, ESCAPE_TARGET, MAX_HP, STARTING_DECK } from '../src/choice/balance';
import type { Effect, GameState, OptionKind } from '../src/choice/types';

beforeEach(() => {
  resetUidCounter();
});

function apply(state: GameState, effects: Effect[], seed = 'fx'): string[] {
  return applyEffects(state, effects, new Rng(seed));
}

describe('선택지 데이터', () => {
  it('20개 이상 있다', () => {
    expect(EVENTS.length).toBeGreaterThanOrEqual(20);
  });

  it('네 유형이 각각 최소 4개씩 있다', () => {
    const counts: Record<OptionKind, number> = { consume: 0, cleanse: 0, shard: 0, gain: 0 };
    for (const e of EVENTS) {
      counts[e.red.kind] += 1;
      counts[e.blue.kind] += 1;
    }
    for (const kind of Object.keys(counts) as OptionKind[]) {
      expect(counts[kind], kind).toBeGreaterThanOrEqual(4);
    }
  });

  it('획득형이 절반을 넘지 않는다', () => {
    const gain = EVENTS.filter((e) => e.red.kind === 'gain').length +
      EVENTS.filter((e) => e.blue.kind === 'gain').length;
    expect(gain / (EVENTS.length * 2)).toBeLessThan(0.5);
  });

  it('덱소비형은 실제로 덱에서 뽑는다', () => {
    const draws = (fx: Effect[]): boolean =>
      fx.some((f) => f.type === 'draw' || (f.type === 'ifThen' && (draws(f.then) || draws(f.otherwise))));
    for (const e of EVENTS) {
      for (const side of ['red', 'blue'] as const) {
        if (e[side].kind === 'consume') expect(draws(e[side].effects), `${e.id}.${side}`).toBe(true);
      }
    }
  });

  it('파편형은 반드시 저주를 대가로 치른다', () => {
    // 전투가 없으니 보상 상실은 실질 비용이 아니다. 저주만이 나중에 물어뜯는다.
    const addsCurse = (fx: Effect[]): boolean =>
      fx.some(
        (f) =>
          (f.type === 'addRandom' && f.kind === 'curse') ||
          (f.type === 'ifThen' && (addsCurse(f.then) || addsCurse(f.otherwise))),
      );
    for (const e of EVENTS) {
      for (const side of ['red', 'blue'] as const) {
        if (e[side].kind === 'shard') expect(addsCurse(e[side].effects), `${e.id}.${side}`).toBe(true);
      }
    }
  });

  it('파편형은 반드시 탈출 카운트를 올린다', () => {
    const shards = (fx: Effect[]): boolean =>
      fx.some((f) => f.type === 'shard' || (f.type === 'ifThen' && (shards(f.then) || shards(f.otherwise))));
    for (const e of EVENTS) {
      for (const side of ['red', 'blue'] as const) {
        if (e[side].kind === 'shard') expect(shards(e[side].effects), `${e.id}.${side}`).toBe(true);
      }
    }
  });

  it('id가 겹치지 않는다', () => {
    expect(new Set(EVENTS.map((e) => e.id)).size).toBe(EVENTS.length);
  });

  it('모든 선택지는 양쪽 다 효과가 있다 — 무상으로 좋기만 한 쪽은 없다', () => {
    for (const e of EVENTS) {
      expect(e.red.effects.length, `${e.id} 빨강`).toBeGreaterThan(0);
      expect(e.blue.effects.length, `${e.id} 파랑`).toBeGreaterThan(0);
      expect(e.red.text.length).toBeGreaterThan(0);
      expect(e.blue.text.length).toBeGreaterThan(0);
    }
  });

  it('양쪽의 감정 축이 서로 다르다', () => {
    for (const e of EVENTS) {
      expect(e.red.tone, `${e.id}`).not.toBe(e.blue.tone);
    }
  });

  it('덱을 줄이는 선택지가 충분히 많다', () => {
    const shrinks = (fx: Effect[]): boolean =>
      fx.some(
        (f) =>
          f.type === 'removeKind' ||
          f.type === 'removeExtreme' ||
          f.type === 'transform' ||
          (f.type === 'ifThen' && (shrinks(f.then) || shrinks(f.otherwise))),
      );
    const count = EVENTS.filter((e) => shrinks(e.red.effects) || shrinks(e.blue.effects)).length;
    expect(count / EVENTS.length).toBeGreaterThanOrEqual(0.5);
  });

  it('파편형과 덱 참조형이 모두 존재한다', () => {
    expect(EVENTS.filter((e) => e.hasShard).length).toBeGreaterThanOrEqual(4);
    expect(EVENTS.filter((e) => e.readsDeck).length).toBeGreaterThanOrEqual(4);
  });

  it('참조하는 카드 id가 전부 풀에 있다', () => {
    const ids = new Set(CARD_POOL.map((c) => c.id));
    const walk = (fx: Effect[]): void => {
      for (const f of fx) {
        if (f.type === 'addSpecific') expect(ids.has(f.cardId)).toBe(true);
        if (f.type === 'ifThen') {
          walk(f.then);
          walk(f.otherwise);
        }
      }
    };
    for (const e of EVENTS) {
      walk(e.red.effects);
      walk(e.blue.effects);
    }
    for (const id of STARTING_DECK) expect(ids.has(id)).toBe(true);
  });
});

describe('효과 적용', () => {
  it('카드를 추가한다', () => {
    const state = createGame(new Rng('add'));
    const before = state.deck.length;
    apply(state, [{ type: 'addRandom', kind: 'reward', count: 2 }]);

    expect(state.deck).toHaveLength(before + 2);
    expect(countKind(state.deck, 'reward')).toBeGreaterThanOrEqual(2);
  });

  it('제거는 값싼 것부터 집는다', () => {
    const state = createGame(new Rng('rm'));
    apply(state, [{ type: 'removeKind', kind: 'neutral', count: 2 }]);

    // 시작 덱의 중립은 낡은단검2, 낡은단검2, 나무방패2, 나무방패2, 부싯돌1, 외투2, 주머니칼1
    const names = state.deck.filter((c) => c.kind === 'neutral').map((c) => c.name);
    expect(names).not.toContain('부싯돌');
    expect(names).not.toContain('주머니칼');
  });

  it('가장 값나가는 카드를 지운다', () => {
    const state = createGame(new Rng('high'));
    const top = Math.max(...state.deck.map((c) => c.value));
    apply(state, [{ type: 'removeExtreme', end: 'highest', count: 1 }]);

    expect(Math.max(...state.deck.map((c) => c.value))).toBeLessThanOrEqual(top);
    expect(state.deck.some((c) => c.name === '은빛 검')).toBe(false);
  });

  it('지울 카드가 모자라면 있는 만큼만 지우고 넘어간다', () => {
    const state = createGame(new Rng('short'));
    expect(countKind(state.deck, 'curse')).toBe(0);

    const changes = apply(state, [{ type: 'removeKind', kind: 'curse', count: 3 }]);

    expect(changes.join()).toContain('없어');
    expect(state.deck.length).toBeGreaterThan(0);
  });

  it('변환은 장수를 유지한 채 종류만 바꾼다', () => {
    const state = createGame(new Rng('tf'));
    const before = state.deck.length;
    const neutralBefore = countKind(state.deck, 'neutral');

    apply(state, [{ type: 'transform', from: 'neutral', to: 'reward', count: 2 }]);

    expect(state.deck).toHaveLength(before);
    expect(countKind(state.deck, 'neutral')).toBe(neutralBefore - 2);
  });

  it('조건이 참이면 then, 거짓이면 otherwise가 적용된다', () => {
    const effect: Effect = {
      type: 'ifThen',
      when: { type: 'countAtLeast', kind: 'curse', n: 3 },
      then: [{ type: 'addRandom', kind: 'reward', count: 3 }],
      otherwise: [{ type: 'addRandom', kind: 'curse', count: 1 }],
    };

    const poor = createGame(new Rng('cond-a'));
    apply(poor, [effect]);
    expect(countKind(poor.deck, 'curse')).toBe(1);

    resetUidCounter();
    const cursed = createGame(new Rng('cond-b'));
    apply(cursed, [{ type: 'addRandom', kind: 'curse', count: 3 }]);
    const rewardBefore = countKind(cursed.deck, 'reward');
    apply(cursed, [effect]);
    expect(countKind(cursed.deck, 'reward')).toBe(rewardBefore + 3);
  });

  it('덱에서 뽑으면 저주마다 체력이 깎이고 카드는 덱에 남는다', () => {
    const state = createGame(new Rng('bite'));
    state.deck = state.deck.filter((c) => c.kind !== 'curse');
    apply(state, [{ type: 'addRandom', kind: 'curse', count: 20 }]);
    const size = state.deck.length;
    const hp = state.hp;

    apply(state, [
      { type: 'draw', count: 3, onCurse: [{ type: 'damage', amount: CURSE_DAMAGE }], onReward: [] },
    ]);

    // 덱이 전부 저주라 3장 모두 물어뜯는다.
    expect(state.hp).toBe(hp - CURSE_DAMAGE * 3);
    expect(state.deck).toHaveLength(size);
  });

  it('덱에 저주가 없으면 뽑아도 아프지 않다', () => {
    const state = createGame(new Rng('safe-draw'));
    expect(countKind(state.deck, 'curse')).toBe(0);
    const hp = state.hp;

    apply(state, [
      { type: 'draw', count: 3, onCurse: [{ type: 'damage', amount: CURSE_DAMAGE }], onReward: [] },
    ]);

    expect(state.hp).toBe(hp);
  });

  it('회복은 최대 체력을 넘지 않는다', () => {
    const state = createGame(new Rng('heal'));
    apply(state, [{ type: 'heal', amount: 99 }]);
    expect(state.hp).toBe(state.maxHp);
  });

  it('저주는 값싼 카드 정리에 휩쓸리지 않는다', () => {
    const state = createGame(new Rng('sticky'));
    apply(state, [{ type: 'addRandom', kind: 'curse', count: 3 }]);

    apply(state, [{ type: 'removeExtreme', end: 'lowest', count: 6 }]);

    // 저주가 값싸다고 저절로 청소되면 저주 페널티 자체가 성립하지 않는다.
    expect(countKind(state.deck, 'curse')).toBe(3);
  });

  it('파편은 덱에도 들어가고 카운트도 올린다', () => {
    const state = createGame(new Rng('shard'));
    apply(state, [{ type: 'shard', count: 2 }]);

    expect(state.shards).toBe(2);
    expect(countKind(state.deck, 'shard')).toBe(2);
  });
});

describe('선택 루프', () => {
  it('시작하면 선택지가 하나 제시된다', () => {
    const state = createGame(new Rng('start'));
    expect(state.current).not.toBeNull();
    expect(state.step).toBe(1);
    expect(state.deck).toHaveLength(STARTING_DECK.length);
    expect(state.shards).toBe(0);
  });

  it('선택하면 덱이 바뀌고 다음 선택지가 나온다', () => {
    const rng = new Rng('loop');
    const state = createGame(rng);
    const first = state.current!.id;

    choose(state, 'red', rng);

    expect(state.step).toBe(2);
    expect(state.current).not.toBeNull();
    expect(state.current!.id).not.toBe(first);
    expect(state.records).toHaveLength(1);
  });

  it('종료 조건 없이 계속 돈다', () => {
    const rng = new Rng('endless');
    const state = createGame(rng);

    for (let i = 0; i < 300 && !state.escaped && !state.dead; i++) {
      choose(state, i % 2 === 0 ? 'red' : 'blue', rng);
    }

    // 탈출했거나, 죽었거나, 아직 돌고 있거나. 어느 쪽이든 깨지지 않는다.
    expect(state.escaped || state.dead || state.current !== null).toBe(true);
    expect(state.deck.every((c) => c.name.length > 0)).toBe(true);
  });

  it('파편은 값싼 카드 정리에 휩쓸리지 않는다', () => {
    const state = createGame(new Rng('protect'));
    apply(state, [{ type: 'shard', count: 3 }]);
    apply(state, [{ type: 'removeExtreme', end: 'lowest', count: 5 }]);

    // 파편은 값어치 0이라 그냥 두면 가장 먼저 잘려 나가고, 덱과 카운트가 어긋난다.
    expect(countKind(state.deck, 'shard')).toBe(3);
    expect(state.shards).toBe(3);
  });

  it('항상 덱을 불리는 쪽만 골라도 무한정 커지지 않는다', () => {
    const rng = new Rng('adversarial');
    const state = createGame(rng);

    for (let i = 0; i < 250 && !state.escaped && !state.dead; i++) {
      const event = state.current!;
      // 매번 덱이 더 커지는 쪽을 고른다.
      const probe = structuredClone(state);
      choose(probe, 'red', new Rng(`probe-${i}`));
      const redGrows = probe.deck.length - state.deck.length;
      const probeBlue = structuredClone(state);
      choose(probeBlue, 'blue', new Rng(`probe-${i}`));
      const blueGrows = probeBlue.deck.length - state.deck.length;
      void event;
      choose(state, redGrows >= blueGrows ? 'red' : 'blue', rng);
    }

    expect(state.deck.length).toBeLessThan(120);
  });

  it('덱이 무한정 커지지 않는다', () => {
    const rng = new Rng('bloat');
    const state = createGame(rng);
    let peak = 0;

    for (let i = 0; i < 200 && !state.escaped && !state.dead; i++) {
      choose(state, rng.next() < 0.5 ? 'red' : 'blue', rng);
      peak = Math.max(peak, state.deck.length);
    }

    expect(peak).toBeLessThan(60);
  });

  it('최근에 나온 선택지는 바로 다시 나오지 않는다', () => {
    const rng = new Rng('repeat');
    const state = createGame(rng);
    const seen: string[] = [state.current!.id];

    for (let i = 0; i < 5; i++) {
      choose(state, 'blue', rng);
      if (state.current) seen.push(state.current.id);
    }

    expect(new Set(seen).size).toBe(seen.length);
  });
});

describe('사망', () => {
  it('체력이 0이 되면 죽고 루프가 멈춘다', () => {
    const rng = new Rng('death');
    const state = createGame(rng);
    expect(state.hp).toBe(MAX_HP);

    state.deck = [];
    apply(state, [{ type: 'addRandom', kind: 'curse', count: 10 }]);
    state.current = {
      id: 'test-lethal',
      prompt: '',
      red: {
        text: '',
        tone: 'gamble',
        kind: 'consume',
        effects: [
          {
            type: 'draw',
            count: 10,
            onCurse: [{ type: 'damage', amount: CURSE_DAMAGE }],
            onReward: [],
          },
        ],
      },
      blue: { text: '', tone: 'safe', kind: 'cleanse', effects: [] },
    };

    choose(state, 'red', rng);

    expect(state.hp).toBe(0);
    expect(state.dead).toBe(true);
    expect(state.current).toBeNull();
    expect(state.log.join()).toContain('사망');
  });

  it('죽은 뒤에는 더 선택되지 않는다', () => {
    const rng = new Rng('after-death');
    const state = createGame(rng);
    state.hp = 0;
    state.dead = true;
    state.current = null;

    const snapshot = structuredClone(state);
    choose(state, 'red', rng);
    expect(state).toEqual(snapshot);
  });

  it('마지막 파편을 캐다 죽으면 탈출이 아니라 사망이다', () => {
    const rng = new Rng('lethal-shard');
    const state = createGame(rng);
    state.shards = ESCAPE_TARGET - 1;
    state.hp = 1;
    state.deck = [];
    apply(state, [{ type: 'addRandom', kind: 'curse', count: 5 }]);
    state.current = {
      id: 'test-shard-lethal',
      prompt: '',
      red: {
        text: '',
        tone: 'now',
        kind: 'shard',
        effects: [
          { type: 'shard', count: 1 },
          { type: 'draw', count: 3, onCurse: [{ type: 'damage', amount: CURSE_DAMAGE }], onReward: [] },
        ],
      },
      blue: { text: '', tone: 'safe', kind: 'cleanse', effects: [] },
    };

    choose(state, 'red', rng);

    expect(state.shards).toBeGreaterThanOrEqual(ESCAPE_TARGET);
    expect(state.dead).toBe(true);
    expect(state.escaped).toBe(false);
  });
});

describe('탈출', () => {
  it('파편이 목표에 닿으면 탈출하고 루프가 멈춘다', () => {
    const rng = new Rng('escape');
    const state = createGame(rng);

    apply(state, [{ type: 'shard', count: ESCAPE_TARGET - 1 }]);
    expect(state.escaped).toBe(false);

    // 파편형 선택지를 직접 물려 마지막 하나를 채운다.
    state.current = EVENTS.find((e) => e.id === 'crack-6')!;
    choose(state, 'red', rng);

    expect(state.shards).toBeGreaterThanOrEqual(ESCAPE_TARGET);
    expect(state.escaped).toBe(true);
    expect(state.dead).toBe(false);
    expect(state.current).toBeNull();
    expect(state.log.join()).toContain('탈출 성공');
  });

  it('탈출한 뒤에는 더 선택되지 않는다', () => {
    const rng = new Rng('after');
    const state = createGame(rng);
    apply(state, [{ type: 'shard', count: ESCAPE_TARGET }]);
    state.current = EVENTS.find((e) => e.id === 'crack-6')!;
    choose(state, 'red', rng);
    expect(state.escaped).toBe(true);

    const snapshot = structuredClone(state);
    choose(state, 'red', rng);
    expect(state).toEqual(snapshot);
  });

  it('파편 선택지는 확률적으로만 나온다 — 매번 당길 수는 없다', () => {
    const rng = new Rng('rate');
    const state = createGame(rng);
    let shardEvents = 0;
    const runs = 2000;

    for (let i = 0; i < runs; i++) {
      state.recent = [];
      if (drawEvent(state, rng).hasShard) shardEvents += 1;
    }

    const rate = shardEvents / runs;
    expect(rate).toBeGreaterThan(0.1);
    expect(rate).toBeLessThan(0.4);
  });
});

describe('덱 요약', () => {
  it('종류별 장수와 오염도를 센다', () => {
    const state = createGame(new Rng('sum'));
    apply(state, [{ type: 'addRandom', kind: 'curse', count: 2 }]);

    const s = summarize(state);
    expect(s.total).toBe(state.deck.length);
    expect(s.reward + s.curse + s.neutral + s.shard).toBe(s.total);
    expect(s.curse).toBe(2);
    expect(s.taint).toBeCloseTo(2 / s.total);
    expect(s.taintLabel.length).toBeGreaterThan(0);
  });

  it('저주가 늘면 오염도 단계가 올라간다', () => {
    const state = createGame(new Rng('taint'));
    const clean = summarize(state).taintLabel;
    apply(state, [{ type: 'addRandom', kind: 'curse', count: 10 }]);
    expect(summarize(state).taintLabel).not.toBe(clean);
    expect(summarize(state).taint).toBeGreaterThan(0.4);
  });

  it('빈 덱에서도 오염도가 깨지지 않는다', () => {
    const state = createGame(new Rng('empty'));
    state.deck = [];
    const s = summarize(state);
    expect(s.total).toBe(0);
    expect(s.taint).toBe(0);
  });

  it('덱 목록은 종류별로 묶여 나온다', () => {
    const state = createGame(new Rng('list'));
    const groups = deckByKind(state);

    expect(groups.map((g) => g.kind)).toEqual(['reward', 'neutral', 'curse', 'shard']);
    const total = groups.reduce((sum, g) => sum + g.cards.reduce((s, c) => s + c.count, 0), 0);
    expect(total).toBe(state.deck.length);
  });
});
