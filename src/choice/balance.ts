import type { CardDef, CurseType, OptionValue, PairType, Rarity } from './types';

/**
 * 선택 화면의 조정 가능한 수치를 전부 여기 모은다.
 */

/**
 * 파편 몇 개를 모으면 탈출.
 *
 * 5에서 3으로 내렸다. 파편이 희소도 체계에 흡수되면서 파편 선택지가 뜨는
 * 비율이 22%에서 7%로 떨어졌고, 5개를 모으려면 한 판이 너무 길어져
 * 탈출률이 1~2%까지 내려갔다.
 */
export const ESCAPE_TARGET = 3;

/**
 * 시작 체력. 0이 되면 사망.
 *
 * 짝 규칙으로 옮기면서 20에서 32로 올렸다. 파편이 드물어져 한 판이
 * 길어졌고, 부패의 지속 피해가 그 길이만큼 더 쌓이기 때문이다.
 *
 * 자동 플레이 300판 기준: 무지성 탈출 28%, 파편을 챙기는 플레이 42%.
 */
export const MAX_HP = 32;


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

/** 최근 이 개수만큼의 선택지는 다시 뽑지 않는다. */
export const RECENT_WINDOW = 7;

/* ---------- 짝 규칙 ---------- */

/**
 * 짝 유형의 목표 비율.
 *
 * 플레이어가 마주하는 것은 낱개 선택지가 아니라 한 화면에 뜬 두 개이고,
 * 그 둘의 관계가 판단의 성격을 정한다. 같은 덱 조작이라도 덱 조작끼리
 * 붙으면 취향 선택이지만 필드 정리와 붙으면 미래 vs 현재의 딜레마가 된다.
 *
 * 위기 비율은 여기 적힌 값이 아니라 CRISIS_AT_START~CRISIS_AT_ESCAPE가
 * 정하고(탈출이 가까울수록 오른다), 남은 몫을 대립과 동류가 아래 비율대로
 * 나눈다. crisis 값은 그 곡선이 맞춰야 할 판 전체 평균 목표다.
 */
export const PAIR_MIX: Record<PairType, number> = {
  clash: 55,
  kin: 30,
  crisis: 15,
};

/**
 * 위기 짝 확률(%)의 양 끝. 탈출 진척(파편/목표)에 따라 사이를 직선으로 잇는다.
 *
 * 탈출이 가까워질수록 판이 조여든다 — 마지막 파편을 앞두고 가장 험하다.
 *
 * 파편 개수가 아니라 진척률로 재는 이유는 ESCAPE_TARGET이 바뀌어도 곡선이
 * 그대로 성립해야 하기 때문이다. 개수로 재면 목표를 5에서 3으로 내리는
 * 순간 표의 뒤쪽 절반이 영영 닿지 않는 값이 된다.
 *
 * 낮은 진척 구간에 머무는 시간이 훨씬 길어서, 시작값을 목표(15%)보다 한참
 * 낮게 두어야 판 전체 평균이 15%에 맞는다.
 */
export const CRISIS_AT_START = 9;
export const CRISIS_AT_ESCAPE = 34;

/**
 * 희소도별 추첨 가중치.
 *
 * 매우 희귀(파편 획득, 필드 전체 정리, 덱의 저주 일괄 제거)가 흔하면
 * 그것들이 판을 지배한다. 등장 비율은 이 가중치와 풀에 든 장수의 곱이다.
 */
export const RARITY_WEIGHT: Record<Rarity, number> = {
  common: 100,
  uncommon: 55,
  rare: 18,
  // 35에서 파편이 든 짝 7.0%, 대형 정리가 든 짝 5.9%로 떨어진다.
  // 둘은 같은 등급이라 따로 조절할 수 없고, 이 값이 양쪽 목표에 가장 가깝다.
  ultra: 35,
};

/**
 * 고밸류 선택지의 반대편에 허용되는 밸류.
 *
 * 저주를 통째로 지우는 선택지 맞은편에 시시한 것이 놓이면 그건 딜레마가
 * 아니라 무료 보상이다. 고밸류는 저밸류와 짝지어지지 않는다.
 */
export const HIGH_VALUE_PARTNER: OptionValue[] = ['mid', 'high'];

/** 매우 희귀 등급은 한 단계 더 엄격하다 — 같은 고밸류만 마주 세운다. */
export const ULTRA_PARTNER: OptionValue[] = ['high'];

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
