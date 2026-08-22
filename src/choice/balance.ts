import type { CardDef, CurseType, ElementType, Rarity } from './types';

/**
 * 선택 화면의 조정 가능한 수치를 전부 여기 모은다.
 */

/**
 * 파편 몇 개를 모으면 탈출.
 *
 * 파편을 **덱에 넣는** 것은 3번 짝(매우 희귀)의 빨강뿐이다. 그래서 이 값과
 * PAIR_RARITY_WEIGHT.ultra가 함께 한 판의 길이를 정한다.
 *
 * 덱의 파편을 **필드로 꺼내는** 길은 뽑기와 복합 시너지 둘이다.
 */
export const ESCAPE_TARGET = 3;

/**
 * 시작 체력. 0이 되면 사망.
 *
 * 자동 플레이 400판 기준: 아무렇게나 반반 누르면 8%가 탈출하고 중앙 25수에
 * 끝난다. 상황을 보고 고르는 정책은 89%, 중앙 40수다.
 *
 * 짝이 9개뿐이라 밸런스는 아직 조절 대상이 아니다 — 선택지가 적으면 잘 두는
 * 쪽이 거의 항상 이긴다. 이 값은 "아무렇게나 누르면 죽는다"만 보증한다.
 */
export const MAX_HP = 20;


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

/* ---------- 짝 테이블 ---------- */

/**
 * 희소도별 등장 가중치.
 *
 * 짝 단위로 매긴다. 짝이 9개뿐이라 반복 등장이 당연하고, 이 값은 "어떤 짝을
 * 얼마나 자주 만나는가"만 정한다.
 */
export const PAIR_RARITY_WEIGHT: Record<Rarity, number> = {
  common: 100,
  uncommon: 60,
  rare: 25,
  // 파편을 주는 짝이 3번 하나뿐이라 이 값이 곧 한 판의 길이다. 12에서는
  // 3번이 4%만 떠서 파편 3개를 모으는 데 중앙 70수가 걸렸다. 25면 40수다.
  ultra: 25,
};

/**
 * 최근 이만큼의 짝은 다시 뽑지 않는다.
 *
 * 짝이 9개뿐이라 이 값이 크면 순번 돌리기가 된다. 3이면 "방금 그거 또?"는
 * 막으면서 희소도 가중치가 거의 그대로 살아난다.
 */
export const RECENT_PAIRS = 3;

/* ---------- 지속 효과 ---------- */

/** 봉인이 유지되는 선택 횟수. 무슨 선택을 하든 1씩 줄어든다. */
export const SEAL_TURNS = 5;
/** 봉인된 색을 눌렀을 때 받는 피해. */
export const SEAL_DAMAGE = 5;

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
 * 카드 풀. **카드는 종류로만 구분한다.**
 *
 * 한때는 은빛 검·낡은 단검처럼 이름과 값어치를 하나하나 갖고 있었고, 그 뒤로는
 * 보상과 중립으로 나뉘어 있었다. 둘 다 폐기했다 — 좋은 카드와 아무것도 아닌
 * 카드로 나뉘면 중립은 뽑을 이유가 없는 쓰레기가 된다.
 *
 * 지금은 속성 4종·저주 3종·파편이 전부다. **모든 속성 카드가 조합 재료라
 * 쓸모없는 카드가 없다.** 옛 정의는 `retired/cards/`에 남겨 두었다.
 *
 * `value`는 "가장 값나가는 것을 버린다" 같은 선택지가 무엇을 집을지 정한다.
 * 네 속성은 서로 우열이 없으므로 값어치가 같다 — 그래서 값어치로 고르는
 * 선택지는 속성 사이에서 아무 편도 들지 않는다.
 */
export const CARD_POOL: CardDef[] = [
  // 속성 — 필드에 같은 것이 모이면 시너지가 터진다
  { id: 'fire', name: '불', kind: 'element', element: 'fire', value: 2 },
  { id: 'water', name: '물', kind: 'element', element: 'water', value: 2 },
  { id: 'dark', name: '어둠', kind: 'element', element: 'dark', value: 2 },
  { id: 'light', name: '빛', kind: 'element', element: 'light', value: 2 },

  // 저주만 하위 종류가 있다. 종류마다 발동 조건과 노리는 것이 다르다.
  { id: 'doom', name: '파멸', kind: 'curse', curseType: 'doom', value: 0 },
  { id: 'rot', name: '부패', kind: 'curse', curseType: 'rot', value: 1 },
  { id: 'erode', name: '침식', kind: 'curse', curseType: 'erode', value: 1 },

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

/* ---------- 속성 시너지 ---------- */

/**
 * 단독 시너지가 터지는 필드 장수. 같은 속성이 이만큼 모이면 즉시 발동하고
 * 그 장수만큼 필드에서 소멸한다.
 *
 * 필드가 스스로 줄지 않던 문제의 해답이 이것이다 — 시너지 발동이 곧 소모처다.
 */
export const ELEMENT_SYNERGY_COUNT = 5;

/**
 * 복합 시너지가 터지는 속성별 필드 장수. 네 속성이 **각각** 이만큼 있어야 한다.
 *
 * 발동하면 네 속성에서 이 수만큼씩, 총 `4 × 이 값`장이 소멸한다.
 */
export const COMBO_SYNERGY_COUNT = 3;

/** 물 시너지가 올리는 최대 체력. 부패가 깎은 것을 되찾는 유일한 길이다. */
export const WATER_MAX_HP_GAIN = 3;

/** 어둠 시너지가 무는 체력. 필드의 저주를 태우는 값이다. */
export const DARK_HP_COST = 3;

export interface ElementRule {
  type: ElementType;
  name: string;
  /** 단독 발동에 필요한 필드 장수. 네 속성 모두 같다. */
  threshold: number;
  /** 무엇에 작용하는지 한 단어로. */
  target: string;
  /** 발동하면 무슨 일이 일어나는지. */
  description: string;
}

/**
 * 네 속성. **저주와 정확히 같은 문법이다** — 필드에 같은 것이 모이면 터진다.
 *
 * 좋은 것과 나쁜 것이 같은 규칙으로 움직이므로 플레이어가 배울 것이 하나뿐이다.
 *
 * 빛만 단독 효과가 없다. 의도된 설계다 — 지금은 아무것도 하지 않지만 복합
 * 조합에는 반드시 필요해서, "쓸모없어 보이지만 남겨둬야 하는 카드"라는 판단이
 * 생긴다.
 */
export const ELEMENT_RULES: Record<ElementType, ElementRule> = {
  fire: {
    type: 'fire',
    name: '불',
    threshold: ELEMENT_SYNERGY_COUNT,
    target: '덱의 저주',
    description: `필드에 ${ELEMENT_SYNERGY_COUNT}장 모이면 덱의 저주 1장을 소각한다`,
  },
  water: {
    type: 'water',
    name: '물',
    threshold: ELEMENT_SYNERGY_COUNT,
    target: '최대 체력',
    description: `필드에 ${ELEMENT_SYNERGY_COUNT}장 모이면 최대 체력 +${WATER_MAX_HP_GAIN}`,
  },
  dark: {
    type: 'dark',
    name: '어둠',
    threshold: ELEMENT_SYNERGY_COUNT,
    target: '필드의 저주',
    description: `필드에 ${ELEMENT_SYNERGY_COUNT}장 모이면 체력 -${DARK_HP_COST}, 필드의 저주 1장을 소각한다`,
  },
  light: {
    type: 'light',
    name: '빛',
    threshold: ELEMENT_SYNERGY_COUNT,
    target: '복합 조합',
    description: '단독 효과가 없다 — 복합 시너지에만 쓰인다',
  },
};

/** 화면과 순회에서 쓰는 속성 순서. 불·물·어둠·빛으로 고정한다. */
export const ELEMENT_ORDER: ElementType[] = ['fire', 'water', 'dark', 'light'];

/**
 * 저주를 태울 때 어느 종류부터 집는지.
 *
 * 위험한 순서다 — 파멸은 즉사, 부패는 되돌릴 수 없는 손실, 침식은 소액.
 * 태우는 것은 순수한 이득이므로 플레이어가 원할 순서로 자동으로 집는다.
 */
export const CURSE_BURN_ORDER: CurseType[] = ['doom', 'rot', 'erode'];

/* ---------- 저주 문턱과 피해 ---------- */

/**
 * 파멸이 터지는 필드 장수. 이 수만큼 필드에 모이면 즉사한다.
 * 그래서 **2장인 상태가 최대 긴장 구간**이다.
 */
export const DOOM_THRESHOLD = 3;

/**
 * 부패가 발동하는 필드 장수. 이 수만큼 모이면 즉시 발동하고 그 2장은 소멸한다.
 *
 * 소멸하므로 필드에 무한정 쌓이지 않고, 부패는 반복해서 다시 쌓인다.
 */
export const ROT_THRESHOLD = 2;

/**
 * 부패가 한 번 발동할 때 깎이는 **최대** 체력.
 *
 * 회복으로 되돌릴 수 없다 — 그래서 회복 짝의 가치를 서서히 잠식한다.
 * 파멸이 즉사, 침식이 즉시 소액이라면 부패는 장기 여력 삭감이다.
 */
export const ROT_MAX_HP_LOSS = 5;

/** 최대 체력이 이 아래로는 내려가지 않는다. */
export const MIN_MAX_HP = 5;

/** 침식이 필드에 놓일 때마다 깎이는 체력. 문턱도 중첩도 없다. */
export const ERODE_DAMAGE = 2;

export interface CurseRule {
  type: CurseType;
  name: string;
  /**
   * 덱에 이 종류가 최대 몇 장까지 들어갈 수 있는지.
   * 파멸은 즉사라서 아주 적게 유지해야 "한 장만 더면 끝"이 성립한다.
   */
  deckMax: number;
  /** 저주를 새로 넣을 때의 상대 가중치. */
  weight: number;
  /**
   * 발동에 필요한 필드 장수. 없으면 놓이는 즉시 발동한다(침식).
   * UI가 "파멸 2/3"처럼 현재 장수와 함께 보여준다.
   */
  threshold: number | null;
  /** 무엇을 공격하는지 한 단어로. 세 저주는 공격 대상이 서로 다르다. */
  target: string;
  /** 발동하면 무슨 일이 일어나는지. */
  description: string;
}

/**
 * 세 저주는 **공격 대상이 모두 다르다.**
 *
 * - 파멸은 목숨을 노린다 — 문턱이 높지만 결과가 최악이다.
 * - 부패는 덱을 노린다 — 자기 자신을 늘려 계단식으로 나빠진다.
 * - 침식은 체력을 노린다 — 문턱 없이 매번 조금씩.
 *
 * 그래서 "지금 뭐가 제일 위험한가"가 상황마다 달라진다.
 */
export const CURSE_RULES: Record<CurseType, CurseRule> = {
  doom: {
    type: 'doom',
    name: '파멸',
    deckMax: 3,
    weight: 1,
    threshold: DOOM_THRESHOLD,
    target: '목숨',
    description: `필드에 ${DOOM_THRESHOLD}장 모이면 즉사한다`,
  },
  rot: {
    type: 'rot',
    name: '부패',
    deckMax: 99,
    weight: 2,
    threshold: ROT_THRESHOLD,
    target: '최대 체력',
    description: `필드에 ${ROT_THRESHOLD}장 모이면 최대 체력 -${ROT_MAX_HP_LOSS} (회복으로 되돌릴 수 없다)`,
  },
  erode: {
    type: 'erode',
    name: '침식',
    deckMax: 99,
    weight: 3,
    threshold: null,
    target: '체력',
    description: `필드에 놓일 때마다 체력 -${ERODE_DAMAGE}`,
  },
};

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
 * 시작 덱 20장. **저주 종류마다 한 장씩 섞여 있다** (파멸·부패·침식 각 1장).
 *
 * 한때는 저주가 한 장도 없었다 — "덱에 들어오는 저주는 전부 선택의 결과라야
 * 내가 넣은 저주가 날 죽인다가 성립한다"는 이유였다. 그런데 그러면 초반에
 * 아무 버튼이나 눌러도 되는 구간이 길어진다. 첫 장부터 "한 장만 더 들어오면
 * 터진다"가 걸려 있어야 선택이 처음부터 선택이 된다.
 *
 * 카드는 덱에서 필드로 한 방향으로만 흐르고 되돌아오지 않으므로, 버린 더미도
 * 재순환도 없다. 이 20장이 한 판에 뽑을 수 있는 전부다.
 */
export const STARTING_DECK: string[] = [
  'doom',
  'rot',
  'erode',
  // 나머지 17장은 네 속성으로 고르게 나눈다 — 시작 덱이 어느 조합도
  // 편들지 않아야 조합을 어느 쪽으로 끌고 갈지가 플레이어의 선택이 된다.
  // 4로 나누어떨어지지 않는 한 장은 순서상 첫 속성이 갖는다.
  ...Array<string>(5).fill('fire'),
  ...Array<string>(4).fill('water'),
  ...Array<string>(4).fill('dark'),
  ...Array<string>(4).fill('light'),
];

export function cardById(id: string): CardDef {
  const found = CARD_POOL.find((c) => c.id === id);
  if (!found) throw new Error(`알 수 없는 카드 id: ${id}`);
  return found;
}

export function poolOf(kind: CardDef['kind']): CardDef[] {
  return CARD_POOL.filter((c) => c.kind === kind && c.id !== 'shard');
}

/** 속성 하나의 카드 정의. "원하는 속성을 지정해서 넣는다"에서 쓴다. */
export function elementDef(element: ElementType): CardDef {
  const found = CARD_POOL.find((c) => c.element === element);
  if (!found) throw new Error(`알 수 없는 속성: ${element}`);
  return found;
}
