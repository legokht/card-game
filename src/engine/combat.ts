import type { Rng } from './rng';
import type { CardDef, CardInstance, CombatConfig, CombatState, Lane } from './types';

/**
 * 전투 규칙. DOM에 의존하지 않는 순수 로직이며, 무작위는 전부 인자로 받은
 * Rng를 통해서만 발생한다.
 *
 * 턴 흐름:
 *   1. 플레이어가 에너지를 써서 손패를 아래쪽 칸에 배치한다 (playCard)
 *   2. 턴 종료 (endTurn)
 *      a. 교전: 같은 레인의 적과 유닛이 동시에 서로를 때린다.
 *         막는 유닛이 없으면 플레이어 HP가 깎인다.
 *      b. 사망 처리 후 승패 판정
 *      c. 예고된 적이 아래로 내려온다
 *      d. 몬스터 덱에서 새 예고를 뽑는다
 *      e. 다음 턴: 1장 드로우, 에너지 리셋
 *
 * 예고가 교전 *뒤에* 내려오므로, 플레이어는 적이 필드에 서 있는 모습을 한 턴
 * 동안 보고 나서 대비할 수 있다.
 */

let uidCounter = 0;

function instantiate(def: CardDef): CardInstance {
  uidCounter += 1;
  return {
    uid: `c${uidCounter}`,
    defId: def.id,
    name: def.name,
    cost: def.cost,
    attack: def.attack,
    health: def.health,
    maxHealth: def.health,
  };
}

/** 테스트에서 uid를 예측 가능하게 만들기 위한 리셋. */
export function resetUidCounter(): void {
  uidCounter = 0;
}

function emptyLane(): Lane {
  return { enemy: null, telegraph: null, player: null };
}

export function createCombat(config: CombatConfig, rng: Rng): CombatState {
  const state: CombatState = {
    turn: 1,
    outcome: 'ongoing',
    playerHp: config.playerMaxHp,
    playerMaxHp: config.playerMaxHp,
    energy: config.maxEnergy,
    maxEnergy: config.maxEnergy,
    lanes: Array.from({ length: config.laneCount }, emptyLane),
    hand: [],
    drawPile: rng.shuffle(config.playerDeck).map(instantiate),
    monsterPile: rng.shuffle(config.monsterDeck).map(instantiate),
    log: [],
  };

  for (let i = 0; i < config.startingHandSize; i++) draw(state);

  // 1턴부터 예고가 보이도록 시작 시 한 장 깔아둔다.
  telegraphNext(state, rng);
  state.log.push(`전투 시작. 몬스터 덱 ${state.monsterPile.length + 1}장.`);

  return state;
}

function draw(state: CombatState): CardInstance | null {
  const card = state.drawPile.shift();
  if (!card) return null;
  state.hand.push(card);
  return card;
}

/** 적이 없고 예고도 없는 레인에 몬스터 덱에서 한 장을 예고로 올린다. */
function telegraphNext(state: CombatState, rng: Rng): void {
  const openLanes = state.lanes.filter((l) => l.enemy === null && l.telegraph === null);
  if (openLanes.length === 0) return;

  const card = state.monsterPile.shift();
  if (!card) return;

  rng.pick(openLanes).telegraph = card;
}

export interface PlayCheck {
  ok: boolean;
  reason?: string;
}

/** 배치가 가능한지만 검사한다. UI에서 버튼 비활성화에 쓴다. */
export function canPlayCard(state: CombatState, uid: string, laneIndex: number): PlayCheck {
  if (state.outcome !== 'ongoing') return { ok: false, reason: '전투가 끝났다' };

  const card = state.hand.find((c) => c.uid === uid);
  if (!card) return { ok: false, reason: '손패에 없는 카드다' };

  const lane = state.lanes[laneIndex];
  if (!lane) return { ok: false, reason: '없는 레인이다' };
  if (lane.player) return { ok: false, reason: '이미 유닛이 있는 칸이다' };

  if (card.cost > state.energy) {
    return { ok: false, reason: `에너지가 부족하다 (${card.cost} 필요, ${state.energy} 남음)` };
  }

  return { ok: true };
}

/** 손패의 카드를 레인에 배치한다. 불가능하면 Error를 던진다. */
export function playCard(state: CombatState, uid: string, laneIndex: number): void {
  const check = canPlayCard(state, uid, laneIndex);
  if (!check.ok) throw new Error(check.reason);

  const handIndex = state.hand.findIndex((c) => c.uid === uid);
  const card = state.hand[handIndex]!;
  const lane = state.lanes[laneIndex]!;

  state.hand.splice(handIndex, 1);
  lane.player = card;
  state.energy -= card.cost;

  state.log.push(`${card.name}을(를) ${laneIndex + 1}번 레인에 배치 (에너지 -${card.cost})`);
}

/**
 * 교전 처리. 같은 레인의 적과 유닛이 동시에 서로를 때린다.
 * 한쪽이 죽어도 그 턴의 반격은 들어간다.
 */
function resolveCombat(state: CombatState): void {
  state.lanes.forEach((lane, i) => {
    const { enemy, player } = lane;
    if (!enemy) return;

    if (!player) {
      state.playerHp -= enemy.attack;
      state.log.push(`${i + 1}번 레인이 비어 ${enemy.name}의 공격이 관통 (HP -${enemy.attack})`);
      return;
    }

    // 동시 공격이므로 피해 계산 전에 양쪽 공격력을 먼저 읽는다.
    const enemyAttack = enemy.attack;
    const playerAttack = player.attack;
    enemy.health -= playerAttack;
    player.health -= enemyAttack;
    // 로그에는 음수 체력이 보이지 않도록 0에서 자른다. 사망 판정은 실제 값으로 한다.
    const shown = (c: CardInstance) => `${Math.max(0, c.health)}/${c.maxHealth}`;
    state.log.push(
      `${i + 1}번 레인 교전: ${player.name}(${shown(player)}) vs ${enemy.name}(${shown(enemy)})`,
    );
  });

  // 사망 처리는 모든 레인의 교전이 끝난 뒤에 한 번에 한다.
  state.lanes.forEach((lane, i) => {
    if (lane.enemy && lane.enemy.health <= 0) {
      state.log.push(`${lane.enemy.name} 격파 (${i + 1}번 레인)`);
      lane.enemy = null;
    }
    if (lane.player && lane.player.health <= 0) {
      state.log.push(`${lane.player.name} 파괴됨 (${i + 1}번 레인)`);
      lane.player = null;
    }
  });
}

/** 예고된 적을 아래로 내린다. 적 칸이 아직 차 있으면 예고 상태로 남는다. */
function descendTelegraphs(state: CombatState): void {
  state.lanes.forEach((lane, i) => {
    if (!lane.telegraph) return;
    if (lane.enemy) {
      state.log.push(`${i + 1}번 레인이 막혀 ${lane.telegraph.name}이(가) 대기한다`);
      return;
    }
    lane.enemy = lane.telegraph;
    lane.telegraph = null;
    state.log.push(`${lane.enemy.name}이(가) ${i + 1}번 레인으로 내려왔다`);
  });
}

function fieldIsClear(state: CombatState): boolean {
  return state.lanes.every((l) => l.enemy === null && l.telegraph === null);
}

function updateOutcome(state: CombatState): void {
  if (state.outcome !== 'ongoing') return;

  if (state.playerHp <= 0) {
    state.playerHp = 0;
    state.outcome = 'defeat';
    state.log.push('패배: 플레이어 HP가 0이 되었다.');
    return;
  }

  if (state.monsterPile.length === 0 && fieldIsClear(state)) {
    state.outcome = 'victory';
    state.log.push('승리: 몬스터 덱이 소진되고 필드가 정리되었다.');
  }
}

/** 턴을 종료하고 교전 → 예고 → 다음 턴까지 진행한다. */
export function endTurn(state: CombatState, rng: Rng): void {
  if (state.outcome !== 'ongoing') return;

  state.log.push(`--- ${state.turn}턴 교전 ---`);
  resolveCombat(state);
  updateOutcome(state);
  if (state.outcome !== 'ongoing') return;

  descendTelegraphs(state);
  telegraphNext(state, rng);

  // 예고와 필드가 모두 빈 채로 몬스터 덱까지 소진됐다면 이 시점에 승리한다.
  updateOutcome(state);
  if (state.outcome !== 'ongoing') return;

  state.turn += 1;
  state.energy = state.maxEnergy;
  const drawn = draw(state);
  state.log.push(
    drawn ? `${state.turn}턴 시작. ${drawn.name} 드로우.` : `${state.turn}턴 시작. 덱이 비었다.`,
  );
}
