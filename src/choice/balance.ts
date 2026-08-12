import type { CardDef, EnemyDef } from './types';

/**
 * 선택 화면의 조정 가능한 수치를 전부 여기 모은다.
 */

/** 파편 몇 개를 모으면 탈출. */
export const ESCAPE_TARGET = 5;

/**
 * 시작 체력. 0이 되면 사망.
 *
 * 전투가 붙기 전에는 12였다. 전투가 체력을 추가로 먹으면서 12로는 무지성
 * 탈출률이 7%까지 떨어져(배우기 전에 죽는다) 18로 올렸다.
 *
 * 자동 플레이 400판 기준: 무지성 탈출 14%, 덱 상태를 보고 고르는 플레이 63%.
 */
export const MAX_HP = 18;

/**
 * 덱소비형 선택지에서 저주를 한 장 뽑을 때마다 깎이는 체력.
 *
 * 이 값이 저주 페널티의 전부다. 올리면 저주가 무서워지고 무지성 플레이가
 * 빨리 죽는다. 내리면 다시 아무 버튼이나 눌러도 탈출하게 된다.
 */
export const CURSE_DAMAGE = 3;

/** 덱소비형에서 보상을 한 장 뽑을 때마다 회복되는 체력. */
export const REWARD_HEAL = 1;

/**
 * 파편 하나를 캘 때 덱에 섞이는 저주 장수.
 *
 * 파편을 넣는 대가가 실질적 비용이 되려면 이 저주가 나중에 덱소비형에서
 * 물어야 한다. 올리면 파편을 급하게 모으는 플레이가 더 위험해진다.
 *
 * 이건 파편 하나짜리 선택지의 기준값이다. 파편 2개를 한 번에 주거나 다른
 * 대가(보상 상실 등)로 바꾼 선택지는 의도적으로 이 값에서 벗어난다.
 */
export const SHARD_CURSE_COST = 2;

/**
 * 파편형 선택지가 뽑힐 확률.
 *
 * 매번 파편을 당길 수 있으면 다섯 번 눌러 끝나버려서 "누적되면 덱이 달라진다"를
 * 검증할 수 없다. 0.22면 파편 5개를 모으는 데 대략 23~30번의 선택이 필요하고,
 * 그 사이에 덱이 충분히 변한다.
 */
export const SHARD_EVENT_RATE = 0.22;

/** 최근 이 개수만큼의 이벤트는 다시 뽑지 않는다. */
export const RECENT_WINDOW = 7;

/**
 * 오염도 구간. 저주 비율이 이 값을 넘으면 해당 단계로 표시된다.
 *
 * 전투가 없어 저주는 아무 규칙도 건드리지 않는다. "저주가 들어가는 건 나쁜
 * 것"이라는 신호만 주는 표시용 수치다.
 */
export const TAINT_LEVELS = [
  { max: 0.12, label: '맑음', tone: 'clean' },
  { max: 0.25, label: '흐림', tone: 'murky' },
  { max: 0.4, label: '오염', tone: 'tainted' },
  { max: 1.01, label: '썩음', tone: 'rotten' },
] as const;

/**
 * 카드 풀.
 *
 * `value`는 "가장 값나가는 것을 버린다" 같은 선택지가 무엇을 집을지 정하고,
 * `attack`/`block`은 전투에서 쓰인다. 저주는 둘 다 0이며 애초에 낼 수 없다.
 */
export const CARD_POOL: CardDef[] = [
  // 보상 — 공격형과 방어형이 갈린다
  { id: 'silver-blade', name: '은빛 검', kind: 'reward', value: 4, attack: 4, block: 0 },
  { id: 'steel-guard', name: '강철 방패', kind: 'reward', value: 4, attack: 0, block: 5 },
  { id: 'rune-spear', name: '룬 창', kind: 'reward', value: 5, attack: 5, block: 0 },
  { id: 'firebomb', name: '화염병', kind: 'reward', value: 4, attack: 6, block: 0 },
  { id: 'chainmail', name: '사슬갑옷', kind: 'reward', value: 3, attack: 0, block: 4 },
  { id: 'hawk-eye', name: '매의 눈', kind: 'reward', value: 3, attack: 3, block: 1 },
  { id: 'blessed-cup', name: '축복의 잔', kind: 'reward', value: 6, attack: 2, block: 4 },
  { id: 'old-relic', name: '오래된 성물', kind: 'reward', value: 6, attack: 6, block: 2 },

  // 저주 — 손패 자리만 차지하고 낼 수 없다
  { id: 'rusty-nail', name: '녹슨 못', kind: 'curse', value: 1, attack: 0, block: 0 },
  { id: 'cursed-doll', name: '저주받은 인형', kind: 'curse', value: 0, attack: 0, block: 0 },
  { id: 'lead-weight', name: '납덩이', kind: 'curse', value: 1, attack: 0, block: 0 },
  { id: 'plague-mark', name: '역병 자국', kind: 'curse', value: 0, attack: 0, block: 0 },
  { id: 'leech', name: '거머리', kind: 'curse', value: 1, attack: 0, block: 0 },
  { id: 'broken-mirror', name: '깨진 거울', kind: 'curse', value: 0, attack: 0, block: 0 },

  // 중립 — 약하지만 없는 것보다는 낫다
  { id: 'worn-dagger', name: '낡은 단검', kind: 'neutral', value: 2, attack: 2, block: 0 },
  { id: 'wood-shield', name: '나무 방패', kind: 'neutral', value: 2, attack: 0, block: 2 },
  { id: 'flint', name: '부싯돌', kind: 'neutral', value: 1, attack: 1, block: 0 },
  { id: 'travel-coat', name: '여행자의 외투', kind: 'neutral', value: 2, attack: 0, block: 2 },
  { id: 'pocket-knife', name: '주머니칼', kind: 'neutral', value: 1, attack: 1, block: 1 },

  // 파편 — 전투에는 쓸모없지만 손패를 막지도 않는다
  { id: 'shard', name: '탈출구 파편', kind: 'shard', value: 0, attack: 1, block: 0 },
];

/* ---------- 전투 ---------- */

/** 전투 시작 시 덱에서 가져오는 손패 장수. */
export const BATTLE_HAND_SIZE = 5;

/**
 * 적.
 *
 * 손패 5장 중 쓸 수 있는 카드는 깨끗한 덱이라도 4장 남짓이고, 그중 방어형은
 * 피해를 못 낸다. 실제로 손패 하나가 뽑아내는 피해는 8~13이다. 체력을 그보다
 * 높게 잡으면 이길 수 없는 전투가 되어 전부 도망만 치게 된다 (체력 13~16으로
 * 잡았을 때 도망 73%).
 */
export const ENEMIES: EnemyDef[] = [
  { id: 'stray', name: '떠도는 것', hp: 6, attack: 2 },
  { id: 'warden', name: '파수꾼', hp: 9, attack: 2 },
  { id: 'gnawer', name: '굶주린 것', hp: 8, attack: 3 },
  { id: 'keeper', name: '탈출구 수호자', hp: 12, attack: 3 },
];

/**
 * 도망 대가.
 *
 * 싸면 전부 도망만 치고, 비싸면 도망이 선택지가 아니게 된다. 체력은 즉시
 * 아프고 저주는 나중에 아프도록 나눠 두었다.
 */
export const FLEE_HP_COST = 2;
/** 도망칠 때 저주 1장을 떠안을 확률. */
export const FLEE_CURSE_CHANCE = 0.5;

export function enemyById(id: string): EnemyDef {
  const found = ENEMIES.find((e) => e.id === id);
  if (!found) throw new Error(`알 수 없는 적 id: ${id}`);
  return found;
}

/** 시작 덱. 중립 위주로 밋밋하게 두고, 변화는 전부 선택에서 나오게 한다. */
export const STARTING_DECK: string[] = [
  'worn-dagger',
  'worn-dagger',
  'wood-shield',
  'wood-shield',
  'flint',
  'travel-coat',
  'pocket-knife',
  'silver-blade',
];

export function cardById(id: string): CardDef {
  const found = CARD_POOL.find((c) => c.id === id);
  if (!found) throw new Error(`알 수 없는 카드 id: ${id}`);
  return found;
}

export function poolOf(kind: CardDef['kind']): CardDef[] {
  return CARD_POOL.filter((c) => c.kind === kind && c.id !== 'shard');
}
