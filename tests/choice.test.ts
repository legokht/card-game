import { beforeEach, describe, expect, it } from 'vitest';
import { Rng } from '../src/engine/rng';
import { choose, createGame, deckByKind, drawPair, summarize } from '../src/choice/engine';
import { applyEffects, countKind, resetUidCounter } from '../src/choice/effects';
import { OPTION_POOL } from '../src/choice/options';
import { composePair, crisisChance } from '../src/choice/pairing';
import {
  CARD_POOL,
  CRISIS_AT_ESCAPE,
  CRISIS_AT_START,
  CURSE_RULES,
  ESCAPE_TARGET,
  FIELD_START,
  MAX_HP,
  PAIR_MIX,
  STARTING_DECK,
} from '../src/choice/balance';
import type {
  ChoicePair,
  Effect,
  GameState,
  OptionDef,
  PairType,
  Tone,
} from '../src/choice/types';

beforeEach(() => {
  resetUidCounter();
});

function apply(state: GameState, effects: Effect[], seed = 'fx'): string[] {
  return applyEffects(state, effects, new Rng(seed));
}

const pairId = (p: ChoicePair) => `${p.red.id}|${p.blue.id}`;
const optionIds = (p: ChoicePair) => [p.red.id, p.blue.id];

/** 테스트가 특정 상황을 직접 세울 때 쓰는 최소한의 짝. */
function testPair(
  red: { id: string; tone: Tone; effects: Effect[] },
  blue: { id: string; tone: Tone; effects: Effect[] },
): ChoicePair {
  const opt = (o: { id: string; tone: Tone; effects: Effect[] }): OptionDef => ({
    id: o.id,
    text: '',
    tone: o.tone,
    axis: 'deck',
    dir: 'future',
    value: 'low',
    rarity: 'common',
    effects: o.effects,
  });
  return { type: 'kin', prompt: '', red: opt(red), blue: opt(blue) };
}

describe('선택지 풀', () => {
  it('충분히 많고 id가 겹치지 않는다', () => {
    expect(OPTION_POOL.length).toBeGreaterThanOrEqual(60);
    expect(new Set(OPTION_POOL.map((o) => o.id)).size).toBe(OPTION_POOL.length);
  });

  it('모든 선택지가 효과와 문구를 갖는다', () => {
    for (const o of OPTION_POOL) {
      expect(o.effects.length, o.id).toBeGreaterThan(0);
      expect(o.text.length, o.id).toBeGreaterThan(0);
    }
  });

  it('문구가 홀로 선다 — 짝을 모르는 채로 읽혀야 한다', () => {
    // 짝이 매번 조합되므로, 없어진 상황 문구를 가리키는 지시어가 남아 있으면
    // 무슨 소린지 알 수 없는 선택지가 된다.
    for (const o of OPTION_POOL) {
      expect(o.text, o.id).not.toMatch(/이 (틈|문|길|굴|다리)|그 (틈|문|길)|여기서 (지나|건너)/);
    }
  });

  it('방향은 축에서 따라 나온다 — 덱은 미래, 나머지는 현재', () => {
    for (const o of OPTION_POOL) {
      expect(o.dir, o.id).toBe(o.axis === 'deck' ? 'future' : 'now');
    }
  });

  it('위기 선택지는 이득이 없다', () => {
    const gains = (fx: Effect[]): boolean =>
      fx.some(
        (f) =>
          f.type === 'shard' ||
          f.type === 'purgeAll' ||
          f.type === 'purgeCurse' ||
          f.type === 'heal' ||
          f.type === 'healPerFieldCard' ||
          (f.type === 'addRandom' && f.kind === 'reward') ||
          ((f.type === 'ifThen' || f.type === 'ifField') && (gains(f.then) || gains(f.otherwise))),
      );
    const crisis = OPTION_POOL.filter((o) => o.crisis);
    expect(crisis.length).toBeGreaterThanOrEqual(6);
    for (const o of crisis) expect(gains(o.effects), o.id).toBe(false);
  });

  it('네 축이 모두 존재하고, 뽑기와 필드가 충분히 많다', () => {
    const by = (a: string) => OPTION_POOL.filter((o) => o.axis === a).length;
    for (const a of ['deck', 'field', 'draw', 'hp']) expect(by(a), a).toBeGreaterThanOrEqual(1);
    expect(by('draw')).toBeGreaterThanOrEqual(15);
    expect(by('field')).toBeGreaterThanOrEqual(15);
  });

  it('매우 희귀 등급에 대형 제거와 파편이 들어 있다', () => {
    const ultra = OPTION_POOL.filter((o) => o.rarity === 'ultra');
    const flat = (fx: Effect[]): Effect[] =>
      fx.flatMap((f) =>
        f.type === 'ifThen' || f.type === 'ifField' ? [f, ...flat(f.then), ...flat(f.otherwise)] : [f],
      );
    const hasShard = ultra.some((o) => flat(o.effects).some((f) => f.type === 'shard'));
    const hasSweep = ultra.some((o) => flat(o.effects).some((f) => f.type === 'purgeAll'));
    expect(hasShard).toBe(true);
    expect(hasSweep).toBe(true);

    // 반대로, 파편과 전체 정리가 흔한 등급에 새어 나가 있으면 안 된다.
    for (const o of OPTION_POOL) {
      const fx = flat(o.effects);
      if (fx.some((f) => f.type === 'shard' || f.type === 'purgeAll')) {
        expect(o.rarity, o.id).toBe('ultra');
      }
    }
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
    for (const o of OPTION_POOL) walk(o.effects);
    for (const id of STARTING_DECK) expect(ids.has(id)).toBe(true);
  });
});

describe('짝 규칙', () => {
  it('대립 짝은 미래와 현재를 마주 세운다', () => {
    const rng = new Rng('clash');
    const state = createGame(rng);
    for (let i = 0; i < 200; i++) {
      const pair = composePair(state, rng, 'clash');
      expect(pair.red.dir, `${pair.red.id} vs ${pair.blue.id}`).not.toBe(pair.blue.dir);
    }
  });

  it('동류 짝은 같은 방향끼리 붙인다', () => {
    const rng = new Rng('kin');
    const state = createGame(rng);
    for (let i = 0; i < 200; i++) {
      const pair = composePair(state, rng, 'kin');
      expect(pair.red.dir).toBe(pair.blue.dir);
    }
  });

  it('위기 짝은 양쪽 다 손해다', () => {
    const rng = new Rng('crisis');
    const state = createGame(rng);
    for (let i = 0; i < 200; i++) {
      const pair = composePair(state, rng, 'crisis');
      expect(pair.red.crisis, pair.red.id).toBe(true);
      expect(pair.blue.crisis, pair.blue.id).toBe(true);
    }
  });

  it('고밸류는 저밸류와 짝지어지지 않는다', () => {
    // 이 규칙이 없으면 "저주를 전부 지운다" 맞은편에 시시한 것이 놓여
    // 딜레마가 아니라 무료 보상이 된다.
    const rng = new Rng('pairing');
    const state = createGame(rng);
    for (let i = 0; i < 3000; i++) {
      const pair = composePair(state, rng);
      const { red, blue } = pair;
      if (red.value === 'high') expect(blue.value, `${red.id} ↔ ${blue.id}`).not.toBe('low');
      if (blue.value === 'high') expect(red.value, `${blue.id} ↔ ${red.id}`).not.toBe('low');
      if (red.rarity === 'ultra') expect(blue.value, `${red.id} ↔ ${blue.id}`).toBe('high');
      if (blue.rarity === 'ultra') expect(red.value, `${blue.id} ↔ ${red.id}`).toBe('high');
    }
  });

  it('같은 선택지가 자기 자신과 붙지 않는다', () => {
    const rng = new Rng('self');
    const state = createGame(rng);
    for (let i = 0; i < 500; i++) {
      const pair = composePair(state, rng);
      expect(pair.red.id).not.toBe(pair.blue.id);
    }
  });

  it('위기 확률은 탈출이 가까울수록 올라간다', () => {
    for (let s = 1; s <= ESCAPE_TARGET; s++) {
      expect(crisisChance(s, ESCAPE_TARGET), `파편 ${s}`).toBeGreaterThan(
        crisisChance(s - 1, ESCAPE_TARGET),
      );
    }
    expect(crisisChance(0, ESCAPE_TARGET)).toBeCloseTo(CRISIS_AT_START / 100, 5);
    expect(crisisChance(ESCAPE_TARGET, ESCAPE_TARGET)).toBeCloseTo(CRISIS_AT_ESCAPE / 100, 5);
    // 목표를 넘겨도 깨지지 않는다.
    expect(crisisChance(99, ESCAPE_TARGET)).toBe(crisisChance(ESCAPE_TARGET, ESCAPE_TARGET));
  });

  it('짝 유형 비율이 목표 근처에 떨어진다', () => {
    const rng = new Rng('mix');
    const state = createGame(rng);
    const seen: Record<PairType, number> = { clash: 0, kin: 0, crisis: 0 };
    const N = 6000;
    for (let i = 0; i < N; i++) seen[composePair(state, rng).type] += 1;

    // 위기는 파편 수에 따라 움직이므로 여기서는 파편 0 기준으로만 본다.
    expect(seen.crisis / N).toBeCloseTo(crisisChance(0, ESCAPE_TARGET), 1);
    const rest = seen.clash + seen.kin;
    expect(seen.clash / rest).toBeCloseTo(PAIR_MIX.clash / (PAIR_MIX.clash + PAIR_MIX.kin), 1);
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
    // 전투를 여는 선택지는 루프를 멈추므로, 전투가 없는 쪽을 골라 검증한다.
    const side = state.current!.red.effects.some((f) => f.type === 'pushLuck') ? 'blue' : 'red';
    const first = pairId(state.current!);

    choose(state, side, rng);

    expect(state.step).toBe(2);
    expect(state.current).not.toBeNull();
    expect(pairId(state.current!)).not.toBe(first);
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
    const rng = new Rng('bloat');
    const state = createGame(rng);
    let peak = 0;

    for (let i = 0; i < 200 && !state.escaped && !state.dead && !state.push; i++) {
      choose(state, rng.next() < 0.5 ? 'red' : 'blue', rng);
      peak = Math.max(peak, state.deck.length);
    }

    expect(peak).toBeLessThan(60);
  });

  it('최근에 나온 선택지는 바로 다시 나오지 않는다', () => {
    const rng = new Rng('repeat');
    const state = createGame(rng);
    const seen: string[] = [...optionIds(state.current!)];

    for (let i = 0; i < 3; i++) {
      choose(state, 'blue', rng);
      if (state.current) seen.push(...optionIds(state.current));
    }

    // RECENT_WINDOW 안에서는 같은 낱개 선택지가 다시 나오지 않는다.
    expect(new Set(seen).size).toBe(seen.length);
  });
});

describe('사망', () => {
  it('체력이 0이 되면 죽고 루프가 멈춘다', () => {
    const rng = new Rng('death');
    const state = createGame(rng);
    expect(state.hp).toBe(MAX_HP);

    state.current = testPair(
      { id: 'test-lethal', tone: 'gamble', effects: [{ type: 'damage', amount: MAX_HP }] },
      { id: 'test-idle', tone: 'safe', effects: [] },
    );

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
      {
        id: 'test-shard-lethal',
        tone: 'now',
        effects: [
          { type: 'shard', count: 1 },
          { type: 'damage', amount: 5 },
        ],
      },
      { id: 'test-idle', tone: 'safe', effects: [] },
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
    state.current = testPair(
      { id: 'test-shard', tone: 'now', effects: [{ type: 'shard', count: 1 }] },
      { id: 'test-idle', tone: 'safe', effects: [] },
    );
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
    state.current = testPair(
      { id: 'test-shard', tone: 'now', effects: [{ type: 'shard', count: 1 }] },
      { id: 'test-idle', tone: 'safe', effects: [] },
    );
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
