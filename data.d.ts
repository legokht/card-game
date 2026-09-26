import type { CardDef, CardKind, ChoicePair, CurseType, ElementType, Rarity } from './game';

export const ESCAPE_TARGET: number;
export const MAX_HP: number;
export const SHARD_CURSE_COST: number;
export const PAIR_RARITY_WEIGHT: Record<Rarity, number>;
export const RECENT_PAIRS: number;
export const DECK_THIN_AT: number;
export const DECK_THICK_AT: number;
export const DECK_WARN_AT: number;
export const PAIR_INSERT_WEIGHT_THIN: number;
export const PAIR_DRAW_WEIGHT_THIN: number;
export const PAIR_INSERT_WEIGHT_THICK: number;
export const PAIR_DRAW_WEIGHT_THICK: number;
export const PAIR_FLOW_WEIGHT_MID: number;
export const SEAL_TURNS: number;
export const SEAL_DAMAGE: number;
export const TAINT_LEVELS: readonly {
  readonly max: number;
  readonly label: string;
  readonly tone: 'clean' | 'murky' | 'tainted' | 'rotten';
}[];
export const CARD_POOL: CardDef[];
export const FIELD_START: number;
export const ELEMENT_SYNERGY_COUNT: number;
export const WATER_MAX_HP_GAIN: number;
export const DARK_HP_COST: number;
export const LIGHT_HP_GAIN: number;

export interface ElementRule {
  type: ElementType;
  name: string;
  threshold: number;
  target: string;
  description: string;
}

export const ELEMENT_RULES: Record<ElementType, ElementRule>;
export const ELEMENT_ORDER: ElementType[];
export const CURSE_BURN_ORDER: CurseType[];
export const DOOM_THRESHOLD: number;
export const ROT_THRESHOLD: number;
export const ROT_MAX_HP_LOSS: number;
export const MIN_MAX_HP: number;
export const ERODE_DAMAGE: number;

export interface CurseRule {
  type: CurseType;
  name: string;
  deckMax: number;
  weight: number;
  threshold: number | null;
  target: string;
  description: string;
}

export const CURSE_RULES: Record<CurseType, CurseRule>;
export const STARTING_DECK: string[];
export const PAIR_TABLE: ChoicePair[];

export function curseWeights(deckCounts: Record<CurseType, number>): CurseType[];
export function cardById(id: string): CardDef;
export function poolOf(kind: CardKind): CardDef[];
export function elementDef(element: ElementType): CardDef;
