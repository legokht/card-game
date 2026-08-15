import { beforeEach, describe, expect, it } from 'vitest';
import { Rng } from '../src/engine/rng';
import { canPlay, flee, isOver, playCard, playable, startBattle } from '../src/choice/battle';
import { choose, createGame, finishBattle, summarize } from '../src/choice/engine';
import { countKind, resetUidCounter } from '../src/choice/effects';
import { EVENTS } from '../src/choice/events';
import { FLEE_HP_COST, enemyById } from '../src/choice/balance';
import type { CardDef, CardInstance, GameState } from '../src/choice/types';

beforeEach(() => {
  resetUidCounter();
});

const POOL: CardDef[] = [
  { id: 'rune-spear', name: '룬 창', kind: 'reward', value: 5, attack: 5, block: 0 },
  { id: 'steel-guard', name: '강철 방패', kind: 'reward', value: 4, attack: 0, block: 5 },
  { id: 'worn-dagger', name: '낡은 단검', kind: 'neutral', value: 2, attack: 2, block: 0 },
  { id: 'rot', name: '부패', kind: 'curse', value: 1, attack: 0, block: 0, curseType: 'rot' },
  { id: 'erode', name: '침식', kind: 'curse', value: 1, attack: 0, block: 0, curseType: 'erode' },
];

function make(defIds: string[], prefix: string): CardInstance[] {
  return defIds.map((id, i) => {
    const def = POOL.find((d) => d.id === id)!;
    const card: CardInstance = {
      uid: `${prefix}${i}`,
      defId: def.id,
      name: def.name,
      kind: def.kind,
      value: def.value,
      attack: def.attack,
      block: def.block,
    };
    return def.curseType ? { ...card, curseType: def.curseType } : card;
  });
}

/**
 * 전투는 상시 손패로 싸우므로, 손패를 직접 채운다.
 * 겹침이 바로 터지지 않도록 저주는 종류를 섞어 넣는다.
 */
function setHand(state: GameState, defIds: string[]): void {
  state.hand = make(defIds, 'h');
}

function setDeck(state: GameState, defIds: string[]): void {
  state.deck = make(defIds, 'd');
}

const spears = (n: number) => Array.from({ length: n }, () => 'rune-spear');
/** 서로 다른 종류를 번갈아 — 손패에 넣어도 겹쳐서 발동하지 않는다. */
const curses = (n: number) => Array.from({ length: n }, (_, i) => (i % 2 ? 'erode' : 'rot'));

describe('전투 시작', () => {
  it('따로 뽑지 않고 지금 들고 있는 손패로 싸운다', () => {
    const state = createGame(new Rng('start'));
    setHand(state, spears(4));
    setDeck(state, spears(6));
    const deckBefore = state.deck.length;

    const battle = startBattle(state, 'warden', [], new Rng('start'));

    // 전투가 덱에서 카드를 가져가지 않는다.
    expect(state.deck).toHaveLength(deckBefore);
    expect(battle.hand).toBe(state.hand);
    expect(battle.handSize).toBe(4);
  });

  it('전투 시점 손패의 저주 수를 기록한다', () => {
    const state = createGame(new Rng('count'));
    setHand(state, [...curses(2), ...spears(3)]);

    const battle = startBattle(state, 'warden', [], new Rng('count'));

    expect(battle.cursesDrawn).toBe(2);
    expect(battle.handSize).toBe(5);
  });
});

describe('저주는 손패를 막는다', () => {
  it('저주는 낼 수 없다', () => {
    const state = createGame(new Rng('curse'));
    setHand(state, [...curses(2), 'rune-spear']);
    const battle = startBattle(state, 'warden', [], new Rng('curse'));

    const curse = battle.hand.find((c) => c.kind === 'curse')!;
    expect(canPlay(state, curse.uid).ok).toBe(false);
    expect(canPlay(state, curse.uid).reason).toContain('저주');
    expect(() => playCard(state, curse.uid, new Rng('x'))).toThrow();
  });

  it('저주가 많을수록 쓸 수 있는 카드가 줄어든다', () => {
    const state = createGame(new Rng('fewer'));
    setHand(state, [...curses(3), ...spears(2)]);

    const battle = startBattle(state, 'warden', [], new Rng('fewer'));

    expect(battle.hand).toHaveLength(5);
    expect(playable(battle.hand)).toHaveLength(2);
  });

  it('손패가 전부 저주면 시작하자마자 쫓겨난다', () => {
    const state = createGame(new Rng('all-curse'));
    setHand(state, curses(2));
    const hp = state.hp;

    const battle = startBattle(state, 'warden', [], new Rng('all-curse'));

    expect(battle.outcome).toBe('fled');
    expect(state.hp).toBeLessThanOrEqual(hp - FLEE_HP_COST);
  });
});

describe('카드 사용', () => {
  it('카드를 내면 적 체력이 깎이고 반격을 받는다', () => {
    const state = createGame(new Rng('hit'));
    setHand(state, spears(6));
    const battle = startBattle(state, 'warden', [], new Rng('hit'));
    const enemy = enemyById('warden');
    const hp = state.hp;

    playCard(state, battle.hand[0]!.uid, new Rng('hit'));

    expect(battle.enemyHp).toBe(enemy.hp - 5);
    expect(state.hp).toBe(hp - enemy.attack);
    expect(battle.turn).toBe(2);
  });

  it('방어는 그 턴의 반격만 깎고 사라진다', () => {
    const state = createGame(new Rng('block'));
    setHand(state, ['steel-guard', 'steel-guard', 'worn-dagger', 'worn-dagger', 'worn-dagger']);
    const battle = startBattle(state, 'gnawer', [], new Rng('block'));
    const hp = state.hp;

    const guard = battle.hand.find((c) => c.block > 0)!;
    playCard(state, guard.uid, new Rng('b'));
    // 방어 5 > 공격 4 이므로 피해 없음
    expect(state.hp).toBe(hp);
    expect(battle.block).toBe(0);

    const dagger = battle.hand.find((c) => c.attack > 0 && c.block === 0)!;
    playCard(state, dagger.uid, new Rng('b'));
    // 방어가 남아 있지 않으므로 이번엔 그대로 맞는다
    expect(state.hp).toBe(hp - enemyById('gnawer').attack);
  });

  it('낸 카드는 손패에서 영영 사라진다', () => {
    const state = createGame(new Rng('spend'));
    setHand(state, spears(8));
    setDeck(state, []);
    const battle = startBattle(state, 'keeper', [], new Rng('spend'));

    playCard(state, state.hand[0]!.uid, new Rng('s'));
    playCard(state, state.hand[0]!.uid, new Rng('s'));
    flee(state, new Rng('no-curse'));
    finishBattle(state, new Rng('s'), state.hp);

    // 8장 중 2장을 썼으므로 6장만 손에 남는다.
    expect(state.hand).toHaveLength(6);
    void battle;
  });

  it('안 낸 카드는 저주까지 손패에 그대로 남는다', () => {
    const state = createGame(new Rng('return'));
    setHand(state, [...curses(2), ...spears(3)]);
    setDeck(state, []);
    startBattle(state, 'stray', [], new Rng('return'));

    flee(state, new Rng('no-curse-seed'));
    finishBattle(state, new Rng('r'), state.hp);

    // 손패는 상시 유지된다 — 덱으로 돌아가지 않는다.
    expect(state.hand).toHaveLength(5);
    expect(countKind(state.hand, 'curse')).toBe(2);
  });
});

describe('승패', () => {
  it('적을 쓰러뜨리면 승리하고 보상이 들어온다', () => {
    const state = createGame(new Rng('win'));
    setHand(state, spears(8));
    setDeck(state, ['rot']);
    const battle = startBattle(state, 'stray', [{ type: 'removeKind', kind: 'curse', count: 1 }], new Rng('win'));
    const cursesBefore = countKind(state.deck, 'curse');

    while (battle.outcome === 'ongoing') playCard(state, playable(state.hand)[0]!.uid, new Rng('w'));
    expect(battle.outcome).toBe('won');

    finishBattle(state, new Rng('w'), state.maxHp);
    expect(countKind(state.deck, 'curse')).toBe(cursesBefore - 1);
    expect(state.battles[0]!.outcome).toBe('won');
  });

  it('체력이 0이 되면 전투에서 패배하고 게임이 끝난다', () => {
    const state = createGame(new Rng('lose'));
    state.hp = 2;
    setHand(state, ['worn-dagger', 'worn-dagger', 'worn-dagger', 'worn-dagger', 'worn-dagger']);
    const battle = startBattle(state, 'keeper', [], new Rng('lose'));

    playCard(state, state.hand[0]!.uid, new Rng('l'));

    expect(state.hp).toBe(0);
    expect(battle.outcome).toBe('lost');

    finishBattle(state, new Rng('l'), 2);
    expect(state.dead).toBe(true);
    expect(state.current).toBeNull();
  });

  it('전투가 끝나면 더 진행되지 않는다', () => {
    const state = createGame(new Rng('frozen'));
    setHand(state, spears(6));
    const battle = startBattle(state, 'stray', [], new Rng('frozen'));
    while (battle.outcome === 'ongoing') playCard(state, playable(state.hand)[0]!.uid, new Rng('f'));

    expect(isOver(battle)).toBe(true);
    const uid = state.hand[0]?.uid ?? 'none';
    expect(canPlay(state, uid).ok).toBe(false);
    flee(state, new Rng('f'));
    expect(battle.outcome).toBe('won');
  });
});

describe('도망', () => {
  it('체력을 잃는다', () => {
    const state = createGame(new Rng('flee'));
    setHand(state, spears(6));
    startBattle(state, 'keeper', [], new Rng('flee'));
    const hp = state.hp;

    flee(state, new Rng('flee'));

    expect(state.battle!.outcome).toBe('fled');
    expect(state.hp).toBeLessThanOrEqual(hp - FLEE_HP_COST);
  });

  it('확률적으로 저주를 떠안는다', () => {
    let withCurse = 0;
    for (let i = 0; i < 60; i++) {
      resetUidCounter();
      const state = createGame(new Rng(`flee-${i}`));
      setHand(state, spears(6));
      startBattle(state, 'keeper', [], new Rng(`flee-${i}`));
      const before = countKind(state.deck, 'curse');
      flee(state, new Rng(`roll-${i}`));
      if (countKind(state.deck, 'curse') > before) withCurse += 1;
    }
    // 항상도 아니고 전혀도 아니어야 한다.
    expect(withCurse).toBeGreaterThan(5);
    expect(withCurse).toBeLessThan(60);
  });

  it('낼 카드가 떨어지면 강제로 도망친다', () => {
    const state = createGame(new Rng('forced'));
    setHand(state, ['rune-spear', ...curses(2)]);
    const battle = startBattle(state, 'keeper', [], new Rng('forced'));

    const spear = playable(state.hand)[0]!;
    playCard(state, spear.uid, new Rng('f'));

    // 룬 창 하나로는 수호자(체력 16)를 못 잡는다 → 낼 카드가 없어 쫓겨난다
    expect(battle.outcome).toBe('fled');
  });
});

describe('전투 기록', () => {
  it('손패 구성·결과·소모 카드·저주 비율을 남긴다', () => {
    const state = createGame(new Rng('record'));
    setHand(state, [...spears(3), ...curses(2)]);
    setDeck(state, spears(3));
    const battle = startBattle(state, 'stray', [], new Rng('record'));
    const hpBefore = state.hp;

    while (battle.outcome === 'ongoing') playCard(state, playable(state.hand)[0]!.uid, new Rng('r'));
    finishBattle(state, new Rng('r'), hpBefore);

    const rec = state.battles[0]!;
    expect(rec.enemyId).toBe('stray');
    expect(rec.handSize).toBe(5);
    expect(rec.cursesDrawn).toBeGreaterThanOrEqual(0);
    expect(rec.spent).toBeGreaterThan(0);
    expect(rec.turns).toBeGreaterThan(0);
    expect(rec.taintAtStart).toBeGreaterThan(0);
    expect(rec.hpLost).toBe(hpBefore - state.hp);
  });

  it('로그에 손패의 저주 수와 덱 저주 비율이 남는다', () => {
    const state = createGame(new Rng('log'));
    setHand(state, [...curses(2), ...spears(3)]);
    const battle = startBattle(state, 'stray', [], new Rng('log'));
    while (battle.outcome === 'ongoing') playCard(state, playable(state.hand)[0]!.uid, new Rng('l'));
    finishBattle(state, new Rng('l'), state.maxHp);
    expect(state.log.join('\n')).toMatch(/저주 \d+\/\d+/);
    expect(state.log.join('\n')).toMatch(/덱 저주 \d+%/);
  });
});

describe('전투 중 덱 확인', () => {
  it('덱 요약이 손패를 포함해 전투 중에도 저주 비율이 보인다', () => {
    const state = createGame(new Rng('panel'));
    setHand(state, [...curses(2), ...spears(3)]);
    setDeck(state, spears(3));
    const before = summarize(state);

    const battle = startBattle(state, 'stray', [], new Rng('panel'));

    // 손패가 덱에서 빠져나가도 보유 카드 수와 저주 비율은 그대로여야 한다.
    const during = summarize(state);
    expect(during.total).toBe(before.total);
    expect(during.curse).toBe(before.curse);
    expect(during.taint).toBeCloseTo(before.taint);
    expect(state.deck.length).toBeLessThan(during.total);
    expect(battle.hand.length).toBeGreaterThan(0);
  });

  it('전투에서 카드를 쓰면 그만큼 보유 카드가 준다', () => {
    const state = createGame(new Rng('spent-panel'));
    setHand(state, spears(8));
    const battle = startBattle(state, 'keeper', [], new Rng('spent-panel'));
    const before = summarize(state).total;

    playCard(state, state.hand[0]!.uid, new Rng('p'));
    void battle;

    expect(summarize(state).total).toBe(before - 1);
  });
});

describe('선택지 연결', () => {
  it('전투 이벤트가 존재하고 승리 보상이 붙어 있다', () => {
    const withBattle = EVENTS.filter(
      (e) =>
        e.red.effects.some((f) => f.type === 'battle') ||
        e.blue.effects.some((f) => f.type === 'battle'),
    );
    expect(withBattle.length).toBeGreaterThanOrEqual(4);

    for (const e of withBattle) {
      for (const side of ['red', 'blue'] as const) {
        for (const f of e[side].effects) {
          if (f.type !== 'battle') continue;
          // 전투가 순수한 손해면 아무도 하지 않는다.
          expect(f.onWin.length, `${e.id}.${side}`).toBeGreaterThan(0);
          expect(() => enemyById(f.enemyId)).not.toThrow();
        }
      }
    }
  });

  it('전투 중에는 선택지를 고를 수 없다', () => {
    const state = createGame(new Rng('locked'));
    setHand(state, spears(8));
    startBattle(state, 'keeper', [], new Rng('locked'));

    const snapshot = structuredClone(state);
    choose(state, 'red', new Rng('locked'));

    expect(state).toEqual(snapshot);
  });
});
