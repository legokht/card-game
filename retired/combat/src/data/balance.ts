/**
 * 웨이브 시스템의 조정 가능한 수치를 전부 여기 모은다.
 * 밸런싱은 이 파일만 만지면 되도록 유지할 것.
 */

/**
 * 레인 수.
 *
 * 3인 이유: 2면 소거법이 너무 쉽고, 4 이상이면 경우의 수가 많아 추론을 포기하게
 * 된다. 바꾸려면 DISTRIBUTION_PATTERNS의 shares 길이도 같이 맞춰야 한다
 * (길이가 다르면 잘리거나 0으로 채워진다).
 */
export const LANE_COUNT = 3;

/** 이만큼의 웨이브를 버티면 승리. */
export const WAVE_COUNT = 8;

/**
 * 웨이브 n의 총 전력 = round(base + perWave * (n-1) ^ curve).
 * curve 1이면 직선, 1보다 크면 후반이 가팔라진다.
 */
export const TOTAL_POWER = {
  base: 3,
  perWave: 1.0,
  curve: 1.15,
};

export interface DistributionPattern {
  id: string;
  name: string;
  /** 레인별 비율. 합이 1이 아니어도 되며 내부에서 정규화한다. */
  shares: number[];
  /** 첫 웨이브에서의 출현 가중치. */
  weightEarly: number;
  /** 마지막 웨이브에서의 출현 가중치. 사이 웨이브는 선형 보간. */
  weightLate: number;
}

/**
 * 분배 패턴.
 *
 * 균등형만 나오면 추론이 무의미하고 몰빵형만 나오면 대응이 불가능하므로,
 * 초반에는 균등형 비중을 높이고 후반으로 갈수록 극단적 패턴을 띄운다.
 */
export const DISTRIBUTION_PATTERNS: DistributionPattern[] = [
  { id: 'even', name: '균등형', shares: [1, 1, 1], weightEarly: 6, weightLate: 1 },
  { id: 'skewed', name: '편중형', shares: [7, 3, 2], weightEarly: 3, weightLate: 3 },
  { id: 'split', name: '2분할형', shares: [1, 1, 0], weightEarly: 1.5, weightLate: 2.5 },
  { id: 'allin', name: '몰빵형', shares: [10, 1, 1], weightEarly: 0.5, weightLate: 4 },
];

/**
 * 적이 플레이어 배치에 반응하는 강도.
 *
 * 0 = 분배 순서가 완전 무작위, 1 = 가장 얇은 레인에 항상 가장 큰 몫.
 * 중간값이면 "얇은 곳을 노리는 경향 + 흔들림"이 되어, 일부러 한 곳을 비워
 * 유인하는 플레이가 성립하되 100% 읽히지는 않는다.
 */
export const REACTIVITY = 0.55;

/** 전투 기본값. */
export const PLAYER_MAX_HP = 12;
/*
 * 레인이 3개라 에너지 2로는 세 칸을 채울 수 없고, 빈 레인은 위협을 통째로
 * 맞는다 (자동 플레이 승률 18%). 3이어야 "세 칸을 얇게 vs 두 칸을 두껍게"가
 * 실제 선택지가 된다.
 */
export const MAX_ENERGY = 3;
export const STARTING_HAND = 4;

/**
 * 웨이브 n의 총 전력. 현재 값으로 3,4,5,7,8,9,11,12.
 *
 * 자동 플레이 400판 기준 승률 60%, 승리 시 잔여 HP 3.4/12. 곡선을 올리면
 * 플레이어 보드 전력(현실적으로 12~15 상한)을 후반에 추월해 승률이 0으로
 * 떨어지므로, 여기를 만질 때는 반드시 시뮬레이션으로 확인할 것.
 */
export function waveTotalPower(wave: number): number {
  const t = Math.max(0, wave - 1);
  return Math.round(TOTAL_POWER.base + TOTAL_POWER.perWave * Math.pow(t, TOTAL_POWER.curve));
}
