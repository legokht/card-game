import { beforeEach, describe, expect, it } from 'vitest';
import { Rng } from '../src/engine/rng';
import { choose, createGame, deckByKind, drawPair, summarize } from '../src/choice/engine';
import { applyEffects, countKind, resetUidCounter } from '../src/choice/effects';
import { PAIR_TABLE } from '../src/choice/pairs';
import {
  CARD_POOL,
  CURSE_RULES,
  ESCAPE_TARGET,
  FIELD_START,
  MAX_HP,
  RECENT_PAIRS,
  SEAL_DAMAGE,
  SEAL_TURNS,
  STARTING_DECK,
} from '../src/choice/balance';
import type { ChoicePair, Effect, GameState } from '../src/choice/types';

beforeEach(() => {
  resetUidCounter();
});

function apply(state: GameState, effects: Effect[], seed = 'fx'): string[] {
  return applyEffects(state, effects, new Rng(seed));
}

/** 테스트가 특정 상황을 직접 세울 때 쓰는 최소한의 짝. */
function testPair(id: string, red: Effect[], blue: Effect[]): ChoicePair {
  return {
    id,
    intent: '테스트용',
    rarity: 'common',
    red: { text: `${id}-빨강`, effects: red },
    blue: { text: `${id}-파랑`, effects: blue },
  };
}

describe('짝 테이블', () => {
  it('11개이고 id가 겹치지 않는다', () => {
    expect(PAIR_TABLE).toHaveLength(11);
    expect(new Set(PAIR_TABLE.map((p) => p.id)).size).toBe(PAIR_TABLE.length);
  });

  it('모든 짝이 양쪽 다 문구와 효과를 갖는다', () => {
    for (const p of PAIR_TABLE) {
      for (const side of ['red', 'blue'] as const) {
        expect(p[side].text.length, `${p.id}.${side}`).toBeGreaterThan(0);
        expect(p[side].effects.length, `${p.id}.${side}`).toBeGreaterThan(0);
      }
    }
  });

  it('모든 짝이 의도를 적어 두었다', () => {
    // 의도는 게임에 노출되지 않지만, 없으면 "이 짝이 무엇을 묻는가"를
    // 나중에 아무도 복원할 수 없다.
    for (const p of PAIR_TABLE) expect(p.intent.length, p.id).toBeGreaterThan(0);
  });

  it('양쪽 문구가 서로 다르다', () => {
    for (const p of PAIR_TABLE) expect(p.red.text, p.id).not.toBe(p.blue.text);
  });

  it('참조하는 카드 id가 전부 풀에 있다', () => {
    const ids = new Set(CARD_POOL.map((c) => c.id));
    const walk = (fx: Effect[]): void => {
      for (const f of fx) {
        if (f.type === 'addSpecific') expect(ids.has(f.cardId)).toBe(true);
        if (f.type === 'ifThen' || f.type === 'ifField') {
          walk(f.then);
          walk(f.otherwise);
        }
      }
    };
    for (const p of PAIR_TABLE) {
      walk(p.red.effects);
      walk(p.blue.effects);
    }
    for (const id of STARTING_DECK) expect(ids.has(id)).toBe(true);
  });

  it('짝은 통째로 나온다 — 양쪽이 늘 같은 상대와 붙는다', () => {
    // 자동 조합을 폐기했다는 것을 못박는 테스트. 문구 조합이 테이블에
    // 없는 쌍으로 나오면 어딘가에서 다시 조합하고 있다는 뜻이다.
    const known = new Set(PAIR_TABLE.map((p) => `${p.red.text}|${p.blue.text}`));
    const rng = new Rng('fixed');
    const state = createGame(rng);
    for (let i = 0; i < 400; i++) {
      const pair = drawPair(state, rng);
      expect(known.has(`${pair.red.text}|${pair.blue.text}`), pair.id).toBe(true);
    }
  });

  it('희소도가 등장 빈도를 가른다', () => {
    const rng = new Rng('weights');
    const state = createGame(rng);
    const seen: Record<string, number> = {};
    const N = 20000;
    for (let i = 0; i < N; i++) {
      // 최근 목록을 비워야 희소도 가중치만 남는다.
      state.recent = [];
      const p = drawPair(state, rng);
      seen[p.id] = (seen[p.id] ?? 0) + 1;
    }
    const rateOf = (id: string) => (seen[id] ?? 0) / N;
    // 흔함이 매우 희귀보다 확실히 자주 나온다.
    expect(rateOf('quality-or-bulk')).toBeGreaterThan(rateOf('shard-or-cleanse'));
    expect(rateOf('quality-or-bulk')).toBeGreaterThan(rateOf('seal'));
    // 11개뿐이므로 어느 짝도 완전히 사라지지는 않는다.
    for (const p of PAIR_TABLE) expect(rateOf(p.id), p.id).toBeGreaterThan(0);
  });

  it('방금 나온 짝이 바로 다시 나오지 않는다', () => {
    const rng = new Rng('recent');
    const state = createGame(rng);
    let last = state.current!.id;
    for (let i = 0; i < 200; i++) {
      choose(state, 'blue', rng);
      if (!state.current) break;
      expect(state.current.id).not.toBe(last);
      last = state.current.id;
    }
  });
});

describe('지속 효과', () => {
  function sealRed(seed = 'seal'): { state: GameState; rng: Rng } {
    const rng = new Rng(seed);
    const state = createGame(rng);
    state.current = PAIR_TABLE.find((p) => p.id === 'seal')!;
    choose(state, 'red', rng);
    return { state, rng };
  }

  it('봉인을 걸면 남은 횟수가 붙는다', () => {
    const { state } = sealRed();
    expect(state.lasting).toHaveLength(1);
    expect(state.lasting[0]!.remaining).toBe(SEAL_TURNS);
    expect(state.lasting[0]!.side).toBe('red');
  });

  it('무슨 선택을 하든 남은 횟수가 준다', () => {
    const { state, rng } = sealRed();
    const before = state.lasting[0]!.remaining;
    choose(state, 'blue', rng);
    expect(state.lasting[0]!.remaining).toBe(before - 1);
  });

  it('봉인된 색을 누르면 피해를 문다', () => {
    const { state, rng } = sealRed();
    const hp = state.hp;
    choose(state, 'red', rng);
    expect(state.hp).toBeLessThanOrEqual(hp - SEAL_DAMAGE);
  });

  it('봉인되지 않은 색은 피해가 없다', () => {
    const { state, rng } = sealRed();
    const hp = state.hp;
    // 필드가 비어 있으면 부패 지속 피해도 없으므로 봉인 피해만 남는다.
    state.field = [];
    choose(state, 'blue', rng);
    expect(state.hp).toBe(hp);
  });

  it('정해진 횟수가 지나면 저절로 풀린다', () => {
    const { state, rng } = sealRed();
    for (let i = 0; i < SEAL_TURNS; i++) {
      if (!state.current) break;
      choose(state, 'blue', rng);
    }
    // 도중에 봉인 짝이 다시 떠서 파랑 봉인이 새로 걸릴 수 있다.
    // 확인할 것은 처음 건 빨강 봉인이 풀렸는가다.
    expect(state.lasting.some((l) => l.id === 'seal-red')).toBe(false);
  });

  it('여러 개가 동시에 걸릴 수 있다', () => {
    const rng = new Rng('two');
    const state = createGame(rng);
    apply(state, [
      { type: 'lasting', id: 'a', label: 'A', turns: 3, damage: 1, side: 'red' },
      { type: 'lasting', id: 'b', label: 'B', turns: 4, damage: 2 },
    ]);
    expect(state.lasting).toHaveLength(2);

    // 색이 없는 쪽은 어느 버튼을 눌러도 문다.
    const hp = state.hp;
    state.field = [];
    state.current = PAIR_TABLE.find((p) => p.id === 'quality-or-bulk')!;
    choose(state, 'blue', rng);
    expect(state.hp).toBe(hp - 2);
  });

  it('같은 제약을 다시 걸면 쌓이지 않고 다시 채워진다', () => {
    const rng = new Rng('refresh');
    const state = createGame(rng);
    apply(state, [{ type: 'lasting', id: 'a', label: 'A', turns: 3, damage: 1 }]);
    state.lasting[0]!.remaining = 1;
    apply(state, [{ type: 'lasting', id: 'a', label: 'A', turns: 3, damage: 1 }]);
    expect(state.lasting).toHaveLength(1);
    expect(state.lasting[0]!.remaining).toBe(3);
  });
});

describe('기록', () => {
  it('짝 id별 등장과 빨강/파랑 선택을 센다', () => {
    const rng = new Rng('stats');
    const state = createGame(rng);
    for (let i = 0; i < 40 && state.current; i++) choose(state, i % 2 === 0 ? 'red' : 'blue', rng);

    const stats = Object.values(state.pairStats);
    expect(stats.length).toBeGreaterThan(0);
    for (const [id, st] of Object.entries(state.pairStats)) {
      // 마지막에 제시된 짝은 아직 선택되지 않았으므로 seen이 1 많을 수 있다.
      expect(st.red + st.blue, id).toBeLessThanOrEqual(st.seen);
    }
    const chosen = stats.reduce((a, s) => a + s.red + s.blue, 0);
    expect(chosen).toBe(state.records.length);
  });

  it('선택 시점의 덱·필드·저주·체력을 남긴다', () => {
    const rng = new Rng('snapshot');
    const state = createGame(rng);
    choose(state, 'red', rng);

    const r = state.records[0]!;
    expect(r.pairId.length).toBeGreaterThan(0);
    expect(r.deckSize).toBeGreaterThan(0);
    expect(r.fieldSize).toBeGreaterThanOrEqual(0);
    expect(r.curseCount).toBeGreaterThanOrEqual(0);
    expect(r.hp).toBeGreaterThan(0);
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
    // 시작 덱의 가장 싼 중립은 부싯돌(1)과 주머니칼(1)로 각 2장씩이다.
    apply(state, [{ type: 'removeKind', kind: 'neutral', count: 4 }]);

    const names = state.deck.filter((c) => c.kind === 'neutral').map((c) => c.name);
    expect(names).not.toContain('부싯돌');
    expect(names).not.toContain('주머니칼');
  });

  it('가장 값나가는 카드를 지운다', () => {
    const state = createGame(new Rng('high'));
    const top = Math.max(...state.deck.map((c) => c.value));
    const topCount = state.deck.filter((c) => c.value === top).length;

    apply(state, [{ type: 'removeExtreme', end: 'highest', count: topCount }]);

    expect(Math.max(...state.deck.map((c) => c.value))).toBeLessThan(top);
  });

  it('지울 카드가 모자라면 있는 만큼만 지우고 넘어간다', () => {
    const state = createGame(new Rng('short'));
    expect(countKind(state.deck, 'curse')).toBe(0);

    const changes = apply(state, [{ type: 'removeKind', kind: 'curse', count: 3 }]);

    expect(changes.join()).toContain('없어');
    expect(state.deck.length).toBeGreaterThan(0);
  });

  it('어느 경로로 만들어진 저주든 종류를 갖는다', () => {
    // 종류 없는 저주는 필드에서 겹치지도, 갉지도, 죽이지도 않는 껍데기다.
    // transform이 그런 저주를 찍어내고 있었다.
    const state = createGame(new Rng('typed'));
    apply(state, [{ type: 'transform', from: 'neutral', to: 'curse', count: 5 }]);

    const curses = state.deck.filter((c) => c.kind === 'curse');
    expect(curses.length).toBeGreaterThan(0);
    for (const c of curses) expect(c.curseType, c.name).toBeDefined();
  });

  it('변환도 파멸 덱 상한을 넘기지 못한다', () => {
    const state = createGame(new Rng('cap'));
    // 중립을 전부 저주로 — 상한이 없으면 파멸이 무더기로 쏟아진다.
    apply(state, [{ type: 'transform', from: 'neutral', to: 'curse', count: 99 }]);

    const doom = state.deck.filter((c) => c.curseType === 'doom').length;
    expect(doom).toBeLessThanOrEqual(CURSE_RULES.doom.deckMax);
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
    // 필드는 비어서 시작한다. 오직 선택지로만 채워진다.
    expect(state.field).toHaveLength(FIELD_START);
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

    for (let i = 0; i < 300 && !state.escaped && !state.dead && !state.push; i++) {
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

    for (let i = 0; i < 250 && !state.escaped && !state.dead && !state.push; i++) {
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
    // 지금 테이블은 예전 풀보다 덱에 더 넣는 쪽이다 — 9개 중 셋이 "덱에
    // 중립/보상을 넣는다"이고, 덱에서 빼는 것은 3번 파랑(저주 일괄 제거)뿐이다.
    // 그래도 뽑기가 덱을 필드로 옮기므로 무작위 플레이 60판 기준 중앙 47장,
    // 최대 79장에서 평평해진다. 100수와 200수의 값이 같다.
    const rng = new Rng('bloat');
    const state = createGame(rng);
    let peak = 0;

    for (let i = 0; i < 200 && !state.escaped && !state.dead && !state.push; i++) {
      choose(state, rng.next() < 0.5 ? 'red' : 'blue', rng);
      peak = Math.max(peak, state.deck.length);
    }

    expect(peak).toBeLessThan(100);
  });

  it('최근에 나온 짝은 바로 다시 나오지 않는다', () => {
    const rng = new Rng('repeat');
    const state = createGame(rng);
    const seen: string[] = [state.current!.id];

    for (let i = 0; i < RECENT_PAIRS; i++) {
      choose(state, 'blue', rng);
      if (state.current) seen.push(state.current.id);
    }

    // RECENT_PAIRS 창 안에서는 같은 짝이 다시 나오지 않는다.
    expect(new Set(seen).size).toBe(seen.length);
  });
});

describe('사망', () => {
  it('체력이 0이 되면 죽고 루프가 멈춘다', () => {
    const rng = new Rng('death');
    const state = createGame(rng);
    expect(state.hp).toBe(MAX_HP);

    state.current = testPair('test-lethal', [{ type: 'damage', amount: MAX_HP }], []);

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
    state.current = testPair(
      'test-shard-lethal',
      [
        { type: 'shard', count: 1 },
        { type: 'damage', amount: 5 },
      ],
      [],
    );

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

    // 파편 선택지를 직접 물려 마지막 하나를 채운다.
    state.current = testPair('test-shard', [{ type: 'shard', count: 1 }], []);
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
    state.current = testPair('test-shard', [{ type: 'shard', count: 1 }], []);
    choose(state, 'red', rng);
    expect(state.escaped).toBe(true);

    const snapshot = structuredClone(state);
    choose(state, 'red', rng);
    expect(state).toEqual(snapshot);
  });

  it('파편은 희소도에 눌려 드물게 나온다 — 매번 당길 수는 없다', () => {
    const rng = new Rng('rate');
    const state = createGame(rng);
    let withShard = 0;
    const runs = 4000;

    for (let i = 0; i < runs; i++) {
      state.recent = [];
      const pair = drawPair(state, rng);
      const hasShard = [pair.red, pair.blue].some((o) =>
        o.effects.some((f) => f.type === 'shard'),
      );
      if (hasShard) withShard += 1;
    }

    const rate = withShard / runs;
    expect(rate).toBeGreaterThan(0.02);
    expect(rate).toBeLessThan(0.25);
  });
});

describe('덱 요약', () => {
  it('종류별 장수와 오염도를 센다', () => {
    const state = createGame(new Rng('sum'));
    apply(state, [{ type: 'addRandom', kind: 'curse', count: 2 }]);

    const s = summarize(state);
    expect(s.total).toBe(state.deck.length + state.field.length);
    expect(s.reward + s.curse + s.neutral + s.shard).toBe(s.total);
    expect(s.curse).toBe(2);
    expect(s.taint).toBeCloseTo(2 / s.total);
    expect(s.taintLabel.length).toBeGreaterThan(0);
  });

  it('저주가 늘면 오염도 단계가 올라간다', () => {
    const state = createGame(new Rng('taint'));
    const clean = summarize(state).taintLabel;
    apply(state, [{ type: 'addRandom', kind: 'curse', count: 25 }]);
    expect(summarize(state).taintLabel).not.toBe(clean);
    expect(summarize(state).taint).toBeGreaterThan(0.4);
  });

  it('빈 덱에서도 오염도가 깨지지 않는다', () => {
    const state = createGame(new Rng('empty'));
    state.deck = [];
    state.field = [];
    const s = summarize(state);
    expect(s.total).toBe(0);
    expect(s.taint).toBe(0);
  });

  it('덱 목록은 종류별로 묶여 나온다', () => {
    const state = createGame(new Rng('list'));
    const groups = deckByKind(state);

    expect(groups.map((g) => g.kind)).toEqual(['reward', 'neutral', 'curse', 'shard']);
    const total = groups.reduce((sum, g) => sum + g.cards.reduce((s, c) => s + c.count, 0), 0);
    expect(total).toBe(state.deck.length + state.field.length);
  });
});
