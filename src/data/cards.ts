import type { CardDef, CombatConfig } from '../engine/types';

/**
 * 프로토타입용 더미 데이터.
 *
 * 숫자는 자동 플레이 시뮬레이션 300판을 돌려 맞췄다 (승률 71%, 중앙 8턴,
 * 승리 시 잔여 HP 7.7/10). 목표는 "막을 수는 있지만 공짜로는 못 막는" 구간이다.
 *
 * 핵심 제약: 예고는 턴당 1장만 올라오므로 전투 길이는 사실상 몬스터 덱 크기가
 * 정한다. 5~8턴 목표를 지키려면 몬스터 덱은 5~6장이어야 한다.
 */

/** 사용 가능한 플레이어 카드 풀. 선택지 시스템이 여기서 카드를 꺼내 쓴다. */
export const PLAYER_CARDS: CardDef[] = [
  { id: 'squire', name: '종자', cost: 1, attack: 1, health: 2 },
  { id: 'shield', name: '방패병', cost: 1, attack: 0, health: 4 },
  { id: 'spear', name: '창병', cost: 2, attack: 2, health: 3 },
  { id: 'archer', name: '궁수', cost: 2, attack: 3, health: 1 },
  { id: 'knight', name: '기사', cost: 3, attack: 3, health: 4 },
  { id: 'berserker', name: '광전사', cost: 3, attack: 5, health: 1 },
];

/**
 * 몬스터 풀. 공격력이 높고 체력이 낮게 잡혀 있다.
 *
 * 체력이 높으면 적이 레인에 눌러앉아 뒤의 예고를 막아버리고, 전투가 10턴 넘게
 * 늘어진다. 체력을 낮추면 레인이 계속 회전하면서 압박이 유지된다.
 */
export const MONSTER_CARDS: CardDef[] = [
  { id: 'rat', name: '쥐', cost: 0, attack: 2, health: 1 },
  { id: 'wolf', name: '늑대', cost: 0, attack: 3, health: 2 },
  { id: 'hound', name: '들개', cost: 0, attack: 4, health: 2 },
  { id: 'bear', name: '곰', cost: 0, attack: 5, health: 3 },
];

/** 덱 구성: [카드 정의, 장수] 목록을 펼친다. */
function deck(entries: [CardDef, number][]): CardDef[] {
  return entries.flatMap(([def, count]) => Array.from({ length: count }, () => def));
}

function byId(cards: CardDef[], id: string): CardDef {
  const found = cards.find((c) => c.id === id);
  if (!found) throw new Error(`알 수 없는 카드 id: ${id}`);
  return found;
}

/**
 * 에너지가 2뿐이라 3코스트 카드는 한 턴을 통째로 쓴다. 그래서 1~2코스트를
 * 두껍게 깔아 매 턴 뭐라도 낼 수 있게 했다.
 */
export const STARTER_PLAYER_DECK: CardDef[] = deck([
  [byId(PLAYER_CARDS, 'squire'), 4],
  [byId(PLAYER_CARDS, 'shield'), 3],
  [byId(PLAYER_CARDS, 'spear'), 3],
  [byId(PLAYER_CARDS, 'archer'), 2],
  [byId(PLAYER_CARDS, 'knight'), 2],
]);

/** 5장 = 대략 6~11턴, 중앙 8턴. */
export const STARTER_MONSTER_DECK: CardDef[] = deck([
  [byId(MONSTER_CARDS, 'rat'), 1],
  [byId(MONSTER_CARDS, 'wolf'), 2],
  [byId(MONSTER_CARDS, 'bear'), 2],
]);

export const DEFAULT_CONFIG: CombatConfig = {
  laneCount: 3,
  playerMaxHp: 10,
  // 에너지 3이면 플레이어가 턴당 1.5장을 깔아 예고 1장/턴을 항상 앞선다.
  // 2로 낮춰야 "이번 턴엔 뭘 포기할지" 선택이 생긴다.
  maxEnergy: 2,
  startingHandSize: 4,
  playerDeck: STARTER_PLAYER_DECK,
  monsterDeck: STARTER_MONSTER_DECK,
};
