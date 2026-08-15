import type { CardDef, CurseType } from './types';

/**
 * 선택 화면의 조정 가능한 수치를 전부 여기 모은다.
 */

/** 파편 몇 개를 모으면 탈출. */
export const ESCAPE_TARGET = 5;

/**
 * 시작 체력. 0이 되면 사망.
 *
 * 전투가 빠지면서 체력을 쓰는 곳이 저주뿐이 되어 34에서 20으로 내렸다.
 * 34에서는 무지성으로 계속 뽑아도 67%가 탈출해서, "계속 뽑으면 죽는다"가
 * 성립하지 않았다.
 *
 * 자동 플레이 400판 기준: 무지성 탈출 43%, 필드를 관리하는 플레이 59%.
 */
export const MAX_HP = 20;

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
 * `value`는 "가장 값나가는 것을 버린다" 같은 선택지가 무엇을 집을지 정한다.
 * 시너지는 아직 없으므로 카드에 다른 능력은 없다.
 */
export const CARD_POOL: CardDef[] = [
  // 보상
  { id: 'silver-blade', name: '은빛 검', kind: 'reward', value: 4 },
  { id: 'steel-guard', name: '강철 방패', kind: 'reward', value: 4 },
  { id: 'rune-spear', name: '룬 창', kind: 'reward', value: 5 },
  { id: 'firebomb', name: '화염병', kind: 'reward', value: 4 },
  { id: 'chainmail', name: '사슬갑옷', kind: 'reward', value: 3 },
  { id: 'hawk-eye', name: '매의 눈', kind: 'reward', value: 3 },
  { id: 'blessed-cup', name: '축복의 잔', kind: 'reward', value: 6 },
  { id: 'old-relic', name: '오래된 성물', kind: 'reward', value: 6 },

  // 저주 — 필드에서 같은 종류가 2장 모이면 발동하고 그 2장은 소멸한다
  { id: 'doom', name: '파멸', kind: 'curse', curseType: 'doom', value: 0 },
  { id: 'rot', name: '부패', kind: 'curse', curseType: 'rot', value: 1 },
  { id: 'erode', name: '침식', kind: 'curse', curseType: 'erode', value: 1 },

  // 중립
  { id: 'worn-dagger', name: '낡은 단검', kind: 'neutral', value: 2 },
  { id: 'wood-shield', name: '나무 방패', kind: 'neutral', value: 2 },
  { id: 'flint', name: '부싯돌', kind: 'neutral', value: 1 },
  { id: 'travel-coat', name: '여행자의 외투', kind: 'neutral', value: 2 },
  { id: 'pocket-knife', name: '주머니칼', kind: 'neutral', value: 1 },

  // 파편 — 탈출 진척을 나타낸다
  { id: 'shard', name: '탈출구 파편', kind: 'shard', value: 0 },
];

/* ---------- 손패와 저주 ---------- */

/**
 * 게임 시작 시 필드에 놓인 장수.
 *
 * 0이다. 필드는 오직 선택지를 통해서만 채워진다 — 첫 장부터 플레이어가
 * 뽑기로 결정한 결과여야 한다.
 */
export const FIELD_START = 0;

export interface CurseRule {
  type: CurseType;
  name: string;
  /**
   * 덱에 이 종류가 최대 몇 장까지 들어갈 수 있는지.
   * 파멸은 즉사라서 아주 적게 유지해야 "1장만 보여도 긴장"이 성립한다.
   */
  deckMax: number;
  /** 저주를 새로 넣을 때의 상대 가중치. */
  weight: number;
  /**
   * 발동한 2장의 행선지. 카드는 덱으로 돌아가지 않으므로 지금은 전부 소멸이다.
   * 되돌리는 규칙이 생기면 여기서 갈린다.
   */
  afterTrigger: 'gone';
  /** 겹쳤을 때 무슨 일이 일어나는지. "겹치면 ___" 형태로 이어 붙여 쓴다. */
  description: string;
}

export const CURSE_RULES: Record<CurseType, CurseRule> = {
  doom: {
    type: 'doom',
    name: '파멸',
    deckMax: 3,
    weight: 1,
    afterTrigger: 'gone',
    description: '즉사한다',
  },
  rot: {
    type: 'rot',
    name: '부패',
    deckMax: 99,
    weight: 2,
    afterTrigger: 'gone',
    description: '크게 터진다',
  },
  erode: {
    type: 'erode',
    name: '침식',
    deckMax: 99,
    weight: 3,
    // 필드에서 벗어난 카드는 어디로도 돌아가지 않는다.
    afterTrigger: 'gone',
    description: '멀쩡한 카드가 저주로 바뀐다',
  },
};

/** 필드의 부패 한 장당 매 선택 깎이는 체력. */
export const ROT_DRAIN = 1;
/** 부패 2장이 겹쳤을 때 한 번에 깎이는 체력. */
export const ROT_BURST = 4;
/** 침식 2장이 겹쳤을 때 저주로 바뀌는 필드 카드 수. */
export const ERODE_CONVERT = 2;

/** 저주를 새로 만들 때 종류를 고른다. 덱 상한을 넘는 종류는 제외된다. */
export function curseWeights(deckCounts: Record<CurseType, number>): CurseType[] {
  const out: CurseType[] = [];
  for (const rule of Object.values(CURSE_RULES)) {
    if (deckCounts[rule.type] >= rule.deckMax) continue;
    for (let i = 0; i < rule.weight; i++) out.push(rule.type);
  }
  // 전부 상한이면 그나마 덜 치명적인 부패로 보낸다.
  return out.length > 0 ? out : ['rot'];
}


/* ---------- 덱 ---------- */

/**
 * 시작 덱 20장. 저주는 한 장도 없다 — 덱에 들어오는 저주는 전부 선택의 결과라야
 * "내가 넣은 저주가 날 죽인다"가 성립한다.
 *
 * 카드는 덱에서 필드로 한 방향으로만 흐르고 되돌아오지 않으므로, 버린 더미도
 * 재순환도 없다. 이 20장이 한 판에 뽑을 수 있는 전부다.
 */
export const STARTING_DECK: string[] = [
  'worn-dagger',
  'worn-dagger',
  'worn-dagger',
  'wood-shield',
  'wood-shield',
  'wood-shield',
  'flint',
  'flint',
  'travel-coat',
  'travel-coat',
  'pocket-knife',
  'pocket-knife',
  'silver-blade',
  'silver-blade',
  'steel-guard',
  'rune-spear',
  'firebomb',
  'chainmail',
  'hawk-eye',
  'blessed-cup',
];

export function cardById(id: string): CardDef {
  const found = CARD_POOL.find((c) => c.id === id);
  if (!found) throw new Error(`알 수 없는 카드 id: ${id}`);
  return found;
}

export function poolOf(kind: CardDef['kind']): CardDef[] {
  return CARD_POOL.filter((c) => c.kind === kind && c.id !== 'shard');
}
