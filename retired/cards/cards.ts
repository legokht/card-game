// 폐기된 개별 카드 정의. 참고용이며 어디에서도 import하지 않는다.
// 자세한 사정은 같은 폴더의 README.md 참조.

/**
 * 카드 풀.
 *
 * `value`는 "가장 값나가는 것을 버린다" 같은 선택지가 무엇을 집을지 정했다.
 */
export const OLD_CARD_POOL: CardDef[] = [
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
export const OLD_STARTING_DECK: string[] = [
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
