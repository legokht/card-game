import type { CardDef, CurseType, Rarity } from './types';

/**
 * 선택 화면의 조정 가능한 수치를 전부 여기 모은다.
 */

/**
 * 파편 몇 개를 모으면 탈출.
 *
 * 파편을 주는 것은 3번 짝(매우 희귀)의 빨강뿐이다. 그래서 이 값과
 * PAIR_RARITY_WEIGHT.ultra가 함께 한 판의 길이를 정한다.
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
 * 시작 덱 20장. **저주 종류마다 한 장씩 섞여 있다** (파멸·부패·침식 각 1장).
 *
 * 한때는 저주가 한 장도 없었다 — "덱에 들어오는 저주는 전부 선택의 결과라야
 * 내가 넣은 저주가 날 죽인다가 성립한다"는 이유였다. 그런데 그러면 초반에
 * 아무 버튼이나 눌러도 되는 구간이 길어진다. 첫 장부터 "한 장만 더 들어오면
 * 겹친다"가 걸려 있어야 선택이 처음부터 선택이 된다.
 *
 * 총 장수는 20장 그대로다. 자리를 만들기 위해 가장 많이 중복되던 중립
 * 세 장(낡은 단검·나무 방패·부싯돌 각 1장)을 뺐다.
 *
 * 카드는 덱에서 필드로 한 방향으로만 흐르고 되돌아오지 않으므로, 버린 더미도
 * 재순환도 없다. 이 20장이 한 판에 뽑을 수 있는 전부다.
 */
export const STARTING_DECK: string[] = [
  // 저주 — 종류마다 한 장씩. 초반부터 겹침이 걸려 있다.
  'doom',
  'rot',
  'erode',

  'worn-dagger',
  'worn-dagger',
  'wood-shield',
  'wood-shield',
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
