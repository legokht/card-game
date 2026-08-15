import type { Rng } from '../engine/rng';
import { FLEE_CURSE_CHANCE, FLEE_HP_COST, enemyById } from './balance';
import { makeCurse } from './hand';
import { countKind } from './effects';
import type { BattleState, CardInstance, Effect, GameState } from './types';

/**
 * 전투. 이 게임의 주인공은 버튼 딜레마이고, 전투는 그 선택의 결과를 청구하는
 * 장치다. 그래서 규칙은 짧다.
 *
 * - 따로 뽑지 않고 **지금 들고 있는 상시 손패**로 싸운다. 전투 전에 손패를
 *   갖춰놨는지가 곧 전투 준비다.
 * - 낸 카드는 손패에서 영영 사라진다. 좋은 카드는 쓰면 없어진다.
 * - 저주는 손패 자리만 차지하고 낼 수 없다. 저주가 많으면 싸울 카드가 없다.
 * - 낼 카드가 없으면 강제로 도망친다. 도망은 대가를 치른다.
 */

/** 손패에서 실제로 낼 수 있는 카드. 저주는 제외된다. */
export function playable(hand: CardInstance[]): CardInstance[] {
  return hand.filter((c) => c.kind !== 'curse');
}

export function startBattle(
  state: GameState,
  enemyId: string,
  onWin: Effect[],
  rng: Rng,
): BattleState {
  const enemy = enemyById(enemyId);

  // 상시 손패를 그대로 쓴다. 전투용으로 따로 뽑지 않는다.
  const hand = state.hand;
  const cursesDrawn = hand.filter((c) => c.kind === 'curse').length;
  const owned = state.deck.length + hand.length;
  const taintAtStart =
    owned === 0 ? 0 : (countKind(state.deck, 'curse') + cursesDrawn) / owned;

  const battle: BattleState = {
    enemy,
    enemyHp: enemy.hp,
    hand,
    block: 0,
    turn: 1,
    outcome: 'ongoing',
    onWin,
    spent: 0,
    cursesDrawn,
    handSize: hand.length,
    taintAtStart,
    log: [
      `${enemy.name}과 마주쳤다. 체력 ${enemy.hp}, 매 턴 ${enemy.attack} 피해.`,
      `들고 있던 손패 ${hand.length}장 중 저주 ${cursesDrawn}장 — 쓸 수 있는 카드 ${
        hand.length - cursesDrawn
      }장 (덱 저주 비율 ${Math.round(taintAtStart * 100)}%)`,
    ],
  };

  state.battle = battle;
  if (cursesDrawn > 0) {
    state.log.push(`전투 시작 — 손패 ${hand.length}장 중 저주 ${cursesDrawn}장이 잡혔다`);
  }

  // 처음부터 낼 카드가 없으면 그대로 쫓겨난다.
  if (playable(state.hand).length === 0) {
    battle.log.push('낼 수 있는 카드가 없다.');
    flee(state, rng, true);
  }

  return battle;
}

export interface PlayCheck {
  ok: boolean;
  reason?: string;
}

export function canPlay(state: GameState, uid: string): PlayCheck {
  const battle = state.battle;
  if (!battle || battle.outcome !== 'ongoing') return { ok: false, reason: '전투 중이 아니다' };

  const card = state.hand.find((c) => c.uid === uid);
  if (!card) return { ok: false, reason: '손패에 없는 카드다' };
  if (card.kind === 'curse') return { ok: false, reason: '저주는 낼 수 없다' };

  return { ok: true };
}

/** 카드를 한 장 내고, 적이 살아 있으면 반격을 받는다. */
export function playCard(state: GameState, uid: string, rng: Rng): void {
  const battle = state.battle;
  if (!battle) return;

  const check = canPlay(state, uid);
  if (!check.ok) throw new Error(check.reason);

  const index = state.hand.findIndex((c) => c.uid === uid);
  const card = state.hand[index]!;
  // 상시 손패에서 바로 빠진다. 전투에서 쓴 카드는 돌아오지 않는다.
  state.hand.splice(index, 1);
  battle.spent += 1;

  battle.enemyHp -= card.attack;
  battle.block += card.block;
  battle.log.push(
    `${battle.turn}턴 — ${card.name}` +
      (card.attack > 0 ? ` (피해 ${card.attack})` : '') +
      (card.block > 0 ? ` (방어 ${card.block})` : ''),
  );

  if (battle.enemyHp <= 0) {
    battle.enemyHp = 0;
    battle.outcome = 'won';
    battle.log.push(`${battle.enemy.name}을(를) 쓰러뜨렸다.`);
    return;
  }

  // 적의 반격. 방어는 이번 턴만 유효하다.
  const incoming = Math.max(0, battle.enemy.attack - battle.block);
  state.hp -= incoming;
  battle.log.push(
    battle.block > 0
      ? `${battle.enemy.name}의 공격 ${battle.enemy.attack} — 방어 ${battle.block}으로 ${incoming}만 통과`
      : `${battle.enemy.name}의 공격 — 체력 -${incoming}`,
  );
  battle.block = 0;
  battle.turn += 1;

  if (state.hp <= 0) {
    state.hp = 0;
    battle.outcome = 'lost';
    battle.log.push('쓰러졌다.');
    return;
  }

  // 낼 카드가 떨어지면 그대로 쫓겨난다.
  if (playable(state.hand).length === 0) {
    battle.log.push('더 낼 카드가 없다.');
    flee(state, rng, true);
  }
}

/**
 * 도망친다. 체력을 잃고, 확률적으로 저주 한 장을 떠안는다.
 *
 * 대가가 싸면 전부 도망만 치고, 비싸면 도망이 선택지가 아니게 된다.
 * 체력은 즉시 아프고 저주는 나중에 아프도록 나눠 두었다.
 */
export function flee(state: GameState, rng: Rng, forced = false): void {
  const battle = state.battle;
  if (!battle || battle.outcome !== 'ongoing') return;

  battle.outcome = 'fled';
  state.hp -= FLEE_HP_COST;

  const lines = [`${forced ? '쫓겨났다' : '도망쳤다'} — 체력 -${FLEE_HP_COST}`];
  if (rng.next() < FLEE_CURSE_CHANCE) {
    const curse = makeCurse(state, rng);
    state.deck.push(curse);
    lines.push(`달아나며 ${curse.name}을(를) 주웠다`);
  }
  battle.log.push(...lines);

  if (state.hp <= 0) {
    state.hp = 0;
    battle.outcome = 'lost';
    battle.log.push('달아나다 쓰러졌다.');
  }
}

/** 전투가 끝났는지. UI가 결과 화면으로 넘어갈 시점. */
export function isOver(battle: BattleState): boolean {
  return battle.outcome !== 'ongoing';
}

/**
 * 전투를 정리한다.
 *
 * 손패는 상시 유지되므로 덱으로 되돌리지 않는다 — 안 낸 카드는 그대로 손에
 * 남고, 저주도 남아 다음 선택까지 따라온다.
 */
export function collectHand(state: GameState): void {
  const battle = state.battle;
  if (!battle) return;
  battle.hand = [];
}
