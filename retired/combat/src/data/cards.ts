import type { CardDef, CombatConfig } from '../engine/types';
import {
  LANE_COUNT,
  MAX_ENERGY,
  PLAYER_MAX_HP,
  REACTIVITY,
  STARTING_HAND,
  WAVE_COUNT,
  waveTotalPower,
} from './balance';

/**
 * 플레이어 카드. 밸런스 수치는 balance.ts에 있고, 여기는 카드 정의만 둔다.
 *
 * 적 전력은 공격력 = 체력이라, 전력 5짜리 적을 잡으려면 공격력 5가 필요하고
 * 살아남으려면 체력 6이 필요하다. 벽(체력형)과 화력(공격형)이 갈리는 이유.
 */
export const PLAYER_CARDS: CardDef[] = [
  { id: 'squire', name: '종자', cost: 1, attack: 1, health: 2 },
  { id: 'shield', name: '방패병', cost: 1, attack: 0, health: 4 },
  { id: 'spear', name: '창병', cost: 2, attack: 2, health: 3 },
  { id: 'archer', name: '궁수', cost: 2, attack: 3, health: 1 },
  { id: 'knight', name: '기사', cost: 3, attack: 3, health: 4 },
  { id: 'berserker', name: '광전사', cost: 3, attack: 5, health: 1 },
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

export const STARTER_PLAYER_DECK: CardDef[] = deck([
  [byId(PLAYER_CARDS, 'squire'), 4],
  [byId(PLAYER_CARDS, 'shield'), 3],
  [byId(PLAYER_CARDS, 'spear'), 3],
  [byId(PLAYER_CARDS, 'archer'), 3],
  [byId(PLAYER_CARDS, 'knight'), 3],
  [byId(PLAYER_CARDS, 'berserker'), 2],
]);

export const DEFAULT_CONFIG: CombatConfig = {
  laneCount: LANE_COUNT,
  waveCount: WAVE_COUNT,
  playerMaxHp: PLAYER_MAX_HP,
  maxEnergy: MAX_ENERGY,
  startingHandSize: STARTING_HAND,
  playerDeck: STARTER_PLAYER_DECK,
  reactivity: REACTIVITY,
  totalPowerFor: waveTotalPower,
};
