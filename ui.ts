import {
  CURSE_RULES,
  DECK_WARN_AT,
  ELEMENT_ORDER,
  ELEMENT_RULES,
  ELEMENT_SYNERGY_COUNT,
  DARK_HP_COST,
  LIGHT_HP_GAIN,
  MAX_HP,
  PAIR_TABLE,
  TAINT_LEVELS,
  WATER_MAX_HP_GAIN,
} from './data.js';
import {
  Rng,
  canFireSingle,
  choose,
  countShards,
  createGame,
  deckCurseBreakdown,
  deckElementBreakdown,
  elementsOnEdge,
  fieldCurseBreakdown,
  fieldElementBreakdown,
  onEdge,
  pickElement,
  pushDraw,
  pushStop,
  resolveFate,
  useSynergy,
} from './game';
import type { CardInstance, CurseType, ElementType, GameState, PairSide, Rarity } from './game';
import { cardBackHtml, cardFaceHtml, playingCardBackClass, playingCardFrontClass } from './card-art';
import { mountTutorial, tutorialUnseen } from './tutorial';

/** 한 장 연출 길이. 나타나서 덱에 닿을 때까지. */
export const FX_CARD_MS = 400;
/** 다음 장을 시작하기까지. 짧게 겹쳐야 여러 장이 답답하지 않다. */
export const FX_STAGGER_MS = 140;

/**
 * 필드 착지. 숫자만 바꿔서 무게감을 조절한다.
 *
 * flyMs + bounceMs 가 대략 한 장의 전체 길이.
 * 연속 뽑기에서는 장마다 이 길이만 다르고, 다음 장은 STAGGER 뒤에 출발한다.
 */
export const LAND_FX = {
  /** 속성 4종. 가볍게 툭. */
  weak: {
    flyMs: 145,
    bounceMs: 50,
    bouncePx: 7,
    shakeMs: 0,
    shakePx: 0,
    flipAt: 0.38,
  },
  /** 침식. */
  mid: {
    flyMs: 250,
    bounceMs: 80,
    bouncePx: 5,
    shakeMs: 110,
    shakePx: 1.5,
    flipAt: 0.42,
  },
  /** 부패. */
  heavy: {
    flyMs: 390,
    bounceMs: 120,
    bouncePx: 4,
    shakeMs: 200,
    shakePx: 4.2,
    flipAt: 0.52,
  },
  /** 파멸. 가장 김. */
  doom: {
    flyMs: 520,
    bounceMs: 280,
    bouncePx: 2,
    shakeMs: 420,
    shakePx: 9,
    flipAt: 0.5,
  },
  /** 파편. 위협이 아니라 빛. */
  shard: {
    flyMs: 470,
    bounceMs: 210,
    bouncePx: 6,
    shakeMs: 0,
    shakePx: 0,
    flipAt: 0.2,
  },
} as const;

type LandGrade = keyof typeof LAND_FX;

function landGradeOf(slug: string): LandGrade {
  if (slug === 'doom') return 'doom';
  if (slug === 'rot') return 'heavy';
  if (slug === 'erode') return 'mid';
  if (slug === 'shard') return 'shard';
  return 'weak';
}

function flyEase(grade: LandGrade): string {
  if (grade === 'doom') return 'cubic-bezier(0.15, 0.02, 0.85, 0.12)';
  if (grade === 'heavy') return 'cubic-bezier(0.55, 0.02, 0.9, 0.35)';
  if (grade === 'shard') return 'cubic-bezier(0.16, 0.72, 0.22, 1)';
  if (grade === 'mid') return 'cubic-bezier(0.28, 0.55, 0.32, 1)';
  return 'cubic-bezier(0.22, 0.85, 0.32, 1)';
}

function clearLandScreen(root: HTMLElement): void {
  root.classList.remove('is-land-shake', 'is-land-flash', 'is-land-glow', 'is-land-slow');
  root.style.removeProperty('--land-shake');
  root.style.removeProperty('--land-shake-ms');
}

function punchScreen(root: HTMLElement, grade: LandGrade, signal: AbortSignal): void {
  const spec = LAND_FX[grade];
  if (grade === 'shard') {
    root.classList.add('is-land-glow');
    const t = window.setTimeout(() => root.classList.remove('is-land-glow'), spec.bounceMs + 80);
    signal.addEventListener('abort', () => window.clearTimeout(t), { once: true });
    return;
  }
  if (spec.shakeMs <= 0) return;
  root.style.setProperty('--land-shake', `${spec.shakePx}px`);
  root.style.setProperty('--land-shake-ms', `${spec.shakeMs}ms`);
  root.classList.remove('is-land-shake', 'is-land-flash');
  void root.offsetWidth;
  root.classList.add('is-land-shake');
  if (grade === 'doom') root.classList.add('is-land-flash');
  const t = window.setTimeout(() => {
    root.classList.remove('is-land-shake', 'is-land-flash');
  }, spec.shakeMs);
  signal.addEventListener(
    'abort',
    () => {
      window.clearTimeout(t);
      clearLandScreen(root);
    },
    { once: true },
  );
}

function spawnLandBurst(
  layer: HTMLElement,
  x: number,
  y: number,
  grade: LandGrade,
  signal: AbortSignal,
): void {
  const wrap = document.createElement('div');
  wrap.className = `land-fx land-fx--${grade}`;
  wrap.style.left = `${x}px`;
  wrap.style.top = `${y}px`;
  if (grade === 'weak') {
    wrap.innerHTML = '<i></i><i></i><i></i><i></i>';
  } else if (grade === 'mid') {
    wrap.innerHTML = '<span class="land-fx__ripple"></span>';
  } else if (grade === 'heavy') {
    wrap.innerHTML = '<span class="land-fx__miasma"></span>';
  } else if (grade === 'doom') {
    wrap.innerHTML = `
      <span class="land-fx__shock"></span>
      <svg class="land-fx__crack" viewBox="0 0 200 200" aria-hidden="true">
        <path d="M100 100 L38 28 M100 100 L168 36 M100 100 L22 128 M100 100 L178 142 M100 100 L86 188"/>
      </svg>`;
  } else {
    wrap.innerHTML = '<i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i>';
  }
  layer.append(wrap);
  const life =
    grade === 'doom' ? LAND_FX.doom.bounceMs : grade === 'shard' ? LAND_FX.shard.bounceMs : LAND_FX[grade].bounceMs + 80;
  if (grade === 'doom' || grade === 'shard') {
    const flash = document.createElement('div');
    flash.className = `land-fx land-fx--screen land-fx--screen-${grade}`;
    layer.append(flash);
    const ft = window.setTimeout(() => flash.remove(), life);
    signal.addEventListener(
      'abort',
      () => {
        window.clearTimeout(ft);
        flash.remove();
      },
      { once: true },
    );
  }
  const t = window.setTimeout(() => wrap.remove(), life);
  signal.addEventListener(
    'abort',
    () => {
      window.clearTimeout(t);
      wrap.remove();
    },
    { once: true },
  );
}

type Tone = 'curse' | 'shard' | 'element';

export interface FxBeat {
  kind: 'insert' | 'remove' | 'draw' | 'morph';
  name: string;
  tone: Tone;
  slug: string;
  /** 제거 연출. remove에만 있다. */
  vanish?: VanishKind;
  from?: 'deck' | 'field';
  /** 변환 후. morph에만 있다. */
  into?: { name: string; tone: Tone; slug: string };
}

type VanishKind = 'burn' | 'void' | 'fuse' | 'rotburst' | 'shatter';

/**
 * 제거 연출 시간. 선딜레이(hold) / 소멸(die) / 후딜레이(after)를 따로 조절한다.
 */
export const VANISH_FX = {
  fanMs: 110,
  holdMs: 300,
  dieMs: 200,
  afterMs: 400,
} as const;

/**
 * 변환 연출 시간. 선딜레이(hold) / 변환(flip) / 후딜레이(show)를 따로 조절한다.
 */
export const TRANSFORM_FX = {
  fanMs: 110,
  holdMs: 300,
  flipMs: 130,
  showMs: 500,
  returnMs: 50,
} as const;

/**
 * 덱 삽입 연출. 선딜레이(hold) / 이동(fly) / 후딜레이(after)를 따로 조절한다.
 * fan + hold + fly + after 합이 장수와 무관하게 1초 이하가 되게 맞춘다.
 */
export const INSERT_FX = {
  fanMs: 100,
  holdMs: 300,
  flyMs: 140,
  afterMs: 400,
} as const;

const CARD_META: Record<string, { tone: Tone; slug: string }> = {
  불: { tone: 'element', slug: 'fire' },
  물: { tone: 'element', slug: 'water' },
  어둠: { tone: 'element', slug: 'dark' },
  빛: { tone: 'element', slug: 'light' },
  파멸: { tone: 'curse', slug: 'doom' },
  부패: { tone: 'curse', slug: 'rot' },
  침식: { tone: 'curse', slug: 'erode' },
  파편: { tone: 'shard', slug: 'shard' },
  '탈출구 파편': { tone: 'shard', slug: 'shard' },
};

function metaOf(raw: string): { name: string; tone: Tone; slug: string } | null {
  const name = raw.replace(/\(.*?\)/g, '').trim();
  if (!name || name.includes('없어') || name.includes('비어') || name.includes('유예')) return null;
  const meta = CARD_META[name];
  if (!meta) return null;
  return { name, ...meta };
}

function splitNames(list: string): string[] {
  return list
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/** 선택 로그에서 덱에 넣고/빼고/꺼내는 장만 고른다. */
export function beatsFromChanges(changes: string[]): FxBeat[] {
  const beats: FxBeat[] = [];
  const synergy = changes
    .map((line) => line.match(/^(불|물|어둠|빛)\s+시너지\s+—\s+(\d+)장을 썼다/))
    .find((m) => m);

  if (synergy) {
    const meta = metaOf(synergy[1]!);
    const n = Number(synergy[2]);
    if (meta) {
      for (let i = 0; i < n; i++) {
        beats.push({ kind: 'remove', ...meta, vanish: 'fuse', from: 'field' });
      }
    }
  }

  for (const line of changes) {
    const draw = line.match(/^뽑음:\s*(.+)$/);
    if (draw) {
      for (const n of splitNames(draw[1]!)) {
        const m = metaOf(n);
        if (m) beats.push({ kind: 'draw', ...m });
      }
      continue;
    }

    const shard = line.match(/^\+\s*탈출구 파편\s*×(\d+)/);
    if (shard) {
      const n = Number(shard[1]);
      for (let i = 0; i < n; i++) beats.push({ kind: 'insert', name: '파편', tone: 'shard', slug: 'shard' });
      continue;
    }

    const keep = line.match(/^가져옴:\s*(.+)$/);
    if (keep) {
      if (keep[1] !== '없음') {
        for (const n of splitNames(keep[1]!)) {
          const m = metaOf(n);
          if (m) beats.push({ kind: 'draw', ...m });
        }
      }
      continue;
    }

    const put = line.match(/^덱에\s+(.+)\s+1장을 넣었다/);
    if (put) {
      const m = metaOf(put[1]!);
      if (m) beats.push({ kind: 'insert', ...m });
      continue;
    }

    const deckBurn = line.match(/^덱의\s+(.+)\s+1장을 소각했다/);
    if (deckBurn) {
      const m = metaOf(deckBurn[1]!);
      if (m) beats.push({ kind: 'remove', ...m, vanish: 'burn', from: 'deck' });
      continue;
    }

    const fieldBurn = line.match(/^필드의\s+(.+)\s+1장을 소각했다/);
    if (fieldBurn) {
      const m = metaOf(fieldBurn[1]!);
      if (m) beats.push({ kind: 'remove', ...m, vanish: 'void', from: 'field' });
      continue;
    }

    const rotGone = line.match(/^부패\s+(\d+)장이 소멸했다/);
    if (rotGone) {
      const n = Number(rotGone[1]);
      for (let i = 0; i < n; i++) {
        beats.push({
          kind: 'remove',
          name: '부패',
          tone: 'curse',
          slug: 'rot',
          vanish: 'rotburst',
          from: 'field',
        });
      }
      continue;
    }

    const fieldPurge = line.match(/^필드에서 없앰:\s*(.+)$/);
    if (fieldPurge) {
      for (const n of splitNames(fieldPurge[1]!)) {
        const m = metaOf(n);
        if (m) beats.push({ kind: 'remove', ...m, vanish: m.tone === 'curse' ? 'void' : 'shatter', from: 'field' });
      }
      continue;
    }

    const morph = line.match(/^(.+?)\s+→\s+(.+?)(?:\s*\([^)]*\))?$/);
    if (morph && !line.includes('최대 체력')) {
      const froms = splitNames(morph[1]!)
        .map(metaOf)
        .filter((m): m is { name: string; tone: Tone; slug: string } => m !== null);
      const tos = splitNames(morph[2]!)
        .map(metaOf)
        .filter((m): m is { name: string; tone: Tone; slug: string } => m !== null);
      const n = Math.min(froms.length, tos.length);
      for (let i = 0; i < n; i++) {
        const from = froms[i]!;
        const into = tos[i]!;
        beats.push({ kind: 'morph', ...from, into });
      }
      continue;
    }

    const add = line.match(/^\+\s*(.+)$/);
    if (add) {
      for (const n of splitNames(add[1]!)) {
        const m = metaOf(n);
        if (m) beats.push({ kind: 'insert', ...m });
      }
      continue;
    }

    const sub = line.match(/^-\s*(.+?)(?:\s*\([^)]*장\))?$/);
    if (sub) {
      const metas = splitNames(sub[1]!).map(metaOf).filter(Boolean) as { name: string; tone: Tone; slug: string }[];
      const allCurse = metas.length > 0 && metas.every((m) => m.tone === 'curse');
      const vanish: VanishKind = allCurse ? 'burn' : 'shatter';
      for (const m of metas) beats.push({ kind: 'remove', ...m, vanish, from: 'deck' });
    }
  }
  return beats;
}

export function beatFromPushLine(line: string): FxBeat | null {
  const m = line.match(/장째\s*—\s*(.+)$/);
  if (!m) return null;
  const meta = metaOf(m[1]!);
  return meta ? { kind: 'draw', ...meta } : null;
}

function centerOf(el: Element | null): { x: number; y: number } {
  if (!el) return { x: window.innerWidth * 0.38, y: window.innerHeight * 0.38 };
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

function fanSlots(n: number, cx: number, cy: number): { x: number; y: number }[] {
  const gap = n <= 1 ? 0 : Math.min(78, 520 / Math.max(1, n - 1));
  const width = (n - 1) * gap;
  return Array.from({ length: n }, (_, i) => ({
    x: cx - width / 2 + i * gap,
    y: cy + (i % 2 === 0 ? 0 : 10),
  }));
}

function spawnVanishBurst(
  layer: HTMLElement,
  x: number,
  y: number,
  kind: VanishKind,
  slug: string,
  signal: AbortSignal,
): void {
  const wrap = document.createElement('div');
  wrap.className = `vanish-burst vanish-burst--${kind} vanish-burst--${slug}`;
  wrap.style.left = `${x}px`;
  wrap.style.top = `${y}px`;
  wrap.innerHTML = '<i></i><i></i><i></i><i></i><i></i><i></i>';
  layer.append(wrap);
  const t = window.setTimeout(() => wrap.remove(), VANISH_FX.dieMs);
  signal.addEventListener(
    'abort',
    () => {
      window.clearTimeout(t);
      wrap.remove();
    },
    { once: true },
  );
}

function waitDeckFx(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve();
      return;
    }
    const t = window.setTimeout(resolve, ms);
    signal.addEventListener(
      'abort',
      () => {
        window.clearTimeout(t);
        resolve();
      },
      { once: true },
    );
  });
}

function paintCardFace(el: HTMLElement, slug: string, name: string, tone: Tone): void {
  el.classList.remove(
    'fx-card--curse',
    'fx-card--element',
    'fx-card--shard',
    'fx-card--fire',
    'fx-card--water',
    'fx-card--dark',
    'fx-card--light',
    'fx-card--doom',
    'fx-card--rot',
    'fx-card--erode',
  );
  el.classList.add(`fx-card--${tone}`, `fx-card--${slug}`);
  const face = el.querySelector('.fx-card__face');
  if (face instanceof HTMLElement) {
    face.className = `fx-card__face ${playingCardFrontClass(slug)}`;
    face.innerHTML = cardFaceHtml(slug, name);
  }
}

function morphMood(from: Tone, into: Tone): 'pure' | 'taint' | 'paint' {
  if (from === 'curse' && into === 'element') return 'pure';
  if (from === 'element' && into === 'curse') return 'taint';
  return 'paint';
}

function makeCard(beat: FxBeat, faceDown: boolean): HTMLElement {
  const el = document.createElement('div');
  el.className = `fx-card fx-card--${beat.tone} fx-card--${beat.slug}${faceDown ? ' is-back' : ''}`;
  el.innerHTML = `
    <div class="fx-card__glow" aria-hidden="true"></div>
    <div class="fx-card__back ${playingCardBackClass()}" aria-hidden="true">${cardBackHtml()}</div>
    <div class="fx-card__face ${playingCardFrontClass(beat.slug)}">${cardFaceHtml(beat.slug, beat.name)}</div>`;
  return el;
}

let deckFxPlaying: AbortController | null = null;
let fxGen = 0;

function hideFxLayer(layer: HTMLElement): void {
  layer.replaceChildren();
  layer.hidden = true;
  layer.classList.remove('fx-layer--curse', 'fx-layer--shard');
  layer.removeAttribute('tabindex');
}

export function skipDeckFx(): void {
  deckFxPlaying?.abort();
  deckFxPlaying = null;
  fxGen += 1;
  const layer = document.getElementById('fx-layer');
  if (layer instanceof HTMLElement) hideFxLayer(layer);
  const app = document.getElementById('app');
  if (app instanceof HTMLElement) clearLandScreen(app);
}

function nextPaint(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}

export async function playDeckFx(
  layer: HTMLElement,
  root: HTMLElement,
  beats: FxBeat[],
  fromCount: number,
  toCount: number,
): Promise<void> {
  deckFxPlaying?.abort();
  if (beats.length === 0) return;

  const my = ++fxGen;
  const ac = new AbortController();
  deckFxPlaying = ac;
  const { signal } = ac;

  layer.hidden = false;
  layer.replaceChildren();
  const skip = () => ac.abort();
  layer.addEventListener('click', skip);
  layer.addEventListener('keydown', skip);
  signal.addEventListener('abort', () => {
    layer.querySelectorAll('.fx-card').forEach((el) => {
      el.getAnimations().forEach((a) => a.cancel());
      el.remove();
    });
    layer.querySelectorAll('.land-fx, .vanish-burst').forEach((el) => el.remove());
    layer.classList.remove('fx-layer--curse', 'fx-layer--shard');
    clearLandScreen(root);
  });

  const deckNow = () => root.querySelector('.deckstack');
  const countEl = root.querySelector<HTMLElement>('.deck__size b');
  let shown = fromCount;

  try {
    await nextPaint();
    if (signal.aborted || fxGen !== my) return;
    if (countEl) countEl.textContent = String(shown);

  const bumpCount = (delta: number) => {
    shown += delta;
    if (!countEl) return;
    countEl.textContent = String(Math.max(0, shown));
    countEl.classList.remove('is-bump');
    void countEl.offsetWidth;
    countEl.classList.add('is-bump');
  };

  const thump = () => {
    const pile = deckNow();
    if (!pile) return;
    pile.classList.remove('is-thump');
    void (pile as HTMLElement).offsetWidth;
    pile.classList.add('is-thump');
  };

  const paintDeckPile = (count: number) => {
    const el = root.querySelector('.deckstack');
    if (!el) return;
    el.outerHTML = deckStack(count);
  };

  const vanishAll = async (gone: FxBeat[]) => {
    const stage = root.querySelector('.picks') ?? root.querySelector('.stage') ?? root;
    const mid = centerOf(stage);
    const slots = fanSlots(gone.length, mid.x, mid.y - 24);
    const items = gone.map((beat, i) => {
      const el = makeCard(beat, false);
      const origin =
        beat.from === 'field' ? centerOf(root.querySelector(`.stack--${beat.slug}`)) : centerOf(deckNow());
      el.style.left = `${origin.x}px`;
      el.style.top = `${origin.y}px`;
      el.classList.add('is-show');
      if (beat.slug === 'shard') el.classList.add('is-shard-lost');
      layer.append(el);
      return { el, beat, origin, slot: slots[i]! };
    });

    await nextPaint();
    if (signal.aborted) {
      items.forEach((it) => it.el.remove());
      return;
    }

    items.forEach((it) => {
      const dx = it.slot.x - it.origin.x;
      const dy = it.slot.y - it.origin.y;
      it.el.animate(
        [
          { transform: 'translate(-50%, -50%) scale(0.72)' },
          { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(1)` },
        ],
        { duration: VANISH_FX.fanMs, easing: 'cubic-bezier(0.16, 0.8, 0.24, 1)', fill: 'forwards' },
      );
    });

    await waitDeckFx(VANISH_FX.fanMs + VANISH_FX.holdMs, signal);
    if (signal.aborted) {
      items.forEach((it) => it.el.remove());
      return;
    }

    items.forEach((it) => {
      it.el.style.left = `${it.slot.x}px`;
      it.el.style.top = `${it.slot.y}px`;
      it.el.style.transform = 'translate(-50%, -50%)';
    });

    const fuse = items.filter((it) => (it.beat.vanish ?? 'shatter') === 'fuse');
    const fuseAt = fuse.length
      ? {
          x: fuse.reduce((s, it) => s + it.slot.x, 0) / fuse.length,
          y: fuse.reduce((s, it) => s + it.slot.y, 0) / fuse.length,
        }
      : mid;

    items.forEach((it) => {
      const kind = it.beat.vanish ?? 'shatter';
      it.el.classList.add(`is-die-${kind}`);
      const dx = fuseAt.x - it.slot.x;
      const dy = fuseAt.y - it.slot.y;
      const scatter = ((it.slot.x * 13) % 47) - 23;
      if (kind === 'fuse') {
        it.el.animate(
          [
            { transform: 'translate(-50%, -50%) scale(1)', offset: 0 },
            {
              transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy - 18}px)) scale(0.35)`,
              offset: 0.62,
            },
            { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(1.4)`, offset: 1 },
          ],
          { duration: VANISH_FX.dieMs, easing: 'cubic-bezier(0.4, 0, 0.2, 1)', fill: 'forwards' },
        );
      } else if (kind === 'burn') {
        it.el.animate(
          [
            { transform: 'translate(-50%, -50%) scale(1)', opacity: 1 },
            { transform: 'translate(-50%, calc(-50% - 36px)) scale(0.85) rotate(-8deg)', opacity: 0.7, offset: 0.45 },
            { transform: 'translate(-50%, calc(-50% - 70px)) scale(0.4) rotate(12deg)', opacity: 0 },
          ],
          { duration: VANISH_FX.dieMs, easing: 'ease-in', fill: 'forwards' },
        );
      } else if (kind === 'void') {
        it.el.animate(
          [
            { transform: 'translate(-50%, -50%) scale(1)', opacity: 1, filter: 'brightness(1)' },
            { transform: 'translate(-50%, -50%) scale(0.15)', opacity: 0, filter: 'brightness(0.2)' },
          ],
          { duration: VANISH_FX.dieMs, easing: 'cubic-bezier(0.55, 0, 1, 0.35)', fill: 'forwards' },
        );
      } else if (kind === 'rotburst') {
        it.el.animate(
          [
            { transform: 'translate(-50%, -50%) scale(1)', opacity: 1 },
            { transform: 'translate(-50%, -50%) scale(1.35)', opacity: 0.85, offset: 0.28 },
            { transform: 'translate(-50%, -50%) scale(0.2)', opacity: 0 },
          ],
          { duration: VANISH_FX.dieMs, easing: 'cubic-bezier(0.2, 0.8, 0.3, 1)', fill: 'forwards' },
        );
      } else {
        it.el.animate(
          [
            { transform: 'translate(-50%, -50%) scale(1) rotate(0deg)', opacity: 1 },
            {
              transform: `translate(calc(-50% + ${scatter}px), calc(-50% - 24px)) scale(0.7) rotate(${scatter}deg)`,
              opacity: 0,
            },
          ],
          { duration: VANISH_FX.dieMs, easing: 'ease-in', fill: 'forwards' },
        );
      }
      if (kind !== 'fuse') {
        spawnVanishBurst(layer, it.slot.x, it.slot.y, kind, it.beat.slug, signal);
      }
    });

    if (fuse.length) spawnVanishBurst(layer, fuseAt.x, fuseAt.y, 'fuse', fuse[0]!.beat.slug, signal);

    const deckGone = gone.filter((b) => b.from !== 'field').length;
    if (deckGone > 0) {
      bumpCount(-deckGone);
      thump();
      paintDeckPile(shown);
    }
    if (gone.some((b) => b.from === 'field')) {
      root.querySelectorAll('.stack__cards .playing-card').forEach((el) => {
        el.classList.remove('is-restack');
        void (el as HTMLElement).offsetWidth;
        el.classList.add('is-restack');
      });
    }

    await waitDeckFx(VANISH_FX.dieMs, signal);
    items.forEach((it) => it.el.remove());
    await waitDeckFx(VANISH_FX.afterMs, signal);
  };

  const morphAll = async (morphs: FxBeat[]) => {
    const stage = root.querySelector('.picks') ?? root.querySelector('.stage') ?? root;
    const mid = centerOf(stage);
    const origin = centerOf(deckNow());
    const slots = fanSlots(morphs.length, mid.x, mid.y - 24);
    const items = morphs.map((beat, i) => {
      const el = makeCard(beat, false);
      el.style.left = `${origin.x}px`;
      el.style.top = `${origin.y}px`;
      el.classList.add('is-show');
      layer.append(el);
      return { el, beat, slot: slots[i]! };
    });

    await nextPaint();
    if (signal.aborted) {
      items.forEach((it) => it.el.remove());
      return;
    }

    items.forEach((it) => {
      const dx = it.slot.x - origin.x;
      const dy = it.slot.y - origin.y;
      it.el.animate(
        [
          { transform: 'translate(-50%, -50%) scale(0.72)' },
          { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(1)` },
        ],
        { duration: TRANSFORM_FX.fanMs, easing: 'cubic-bezier(0.16, 0.8, 0.24, 1)', fill: 'forwards' },
      );
    });

    await waitDeckFx(TRANSFORM_FX.fanMs + TRANSFORM_FX.holdMs, signal);
    if (signal.aborted) {
      items.forEach((it) => it.el.remove());
      return;
    }

    items.forEach((it) => {
      it.el.style.left = `${it.slot.x}px`;
      it.el.style.top = `${it.slot.y}px`;
      it.el.getAnimations().forEach((a) => a.cancel());
      const mood = morphMood(it.beat.tone, it.beat.into?.tone ?? it.beat.tone);
      const intoSlug = it.beat.into?.slug ?? it.beat.slug;
      it.el.classList.add(`is-morph-${mood}`, `is-morph--${intoSlug}`);
      const half = TRANSFORM_FX.flipMs / 2;
      const flipOut = it.el.animate(
        [
          { transform: 'translate(-50%, -50%) rotateY(0deg) scale(1)', filter: 'brightness(1)' },
          {
            transform: 'translate(-50%, -50%) rotateY(90deg) scale(1.06)',
            filter: mood === 'taint' ? 'brightness(0.35)' : 'brightness(1.45)',
          },
        ],
        { duration: half, easing: 'ease-in', fill: 'forwards' },
      );
      void flipOut.finished
        .catch(() => undefined)
        .then(() => {
          if (signal.aborted) return;
          const into = it.beat.into;
          if (into) paintCardFace(it.el, into.slug, into.name, into.tone);
          it.el.animate(
            [
              { transform: 'translate(-50%, -50%) rotateY(-90deg) scale(1.06)' },
              { transform: 'translate(-50%, -50%) rotateY(0deg) scale(1)' },
            ],
            { duration: half, easing: 'ease-out', fill: 'forwards' },
          );
        });
    });

    await waitDeckFx(TRANSFORM_FX.flipMs, signal);
    if (signal.aborted) {
      items.forEach((it) => it.el.remove());
      return;
    }

    await waitDeckFx(TRANSFORM_FX.showMs, signal);
    if (signal.aborted) {
      items.forEach((it) => it.el.remove());
      return;
    }

    const dest = centerOf(deckNow());
    items.forEach((it) => {
      const dx = dest.x - it.slot.x;
      const dy = dest.y - it.slot.y;
      it.el.animate(
        [
          { transform: 'translate(-50%, -50%) scale(1)', opacity: 1 },
          { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(0.5)`, opacity: 0.35 },
        ],
        { duration: TRANSFORM_FX.returnMs, easing: 'cubic-bezier(0.4, 0, 0.2, 1)', fill: 'forwards' },
      );
    });
    thump();
    await waitDeckFx(TRANSFORM_FX.returnMs, signal);
    items.forEach((it) => it.el.remove());
  };

  const insertAll = async (puts: FxBeat[]) => {
    const stage = root.querySelector('.picks') ?? root.querySelector('.stage') ?? root;
    const origin = centerOf(stage);
    const slots = fanSlots(puts.length, origin.x, origin.y - 16);
    const hasCurse = puts.some((b) => b.tone === 'curse');
    const hasShard = puts.some((b) => b.tone === 'shard');
    if (hasCurse) layer.classList.add('fx-layer--curse');
    if (hasShard) layer.classList.add('fx-layer--shard');

    const items = puts.map((beat, i) => {
      const el = makeCard(beat, false);
      el.style.left = `${origin.x}px`;
      el.style.top = `${origin.y}px`;
      el.classList.add('is-show');
      if (beat.tone === 'curse') el.classList.add('is-hex', 'is-plant-curse');
      if (beat.tone === 'shard') el.classList.add('is-gilt', 'is-plant-shard');
      layer.append(el);
      return { el, beat, slot: slots[i]! };
    });

    await nextPaint();
    if (signal.aborted) {
      items.forEach((it) => it.el.remove());
      return;
    }

    items.forEach((it) => {
      const dx = it.slot.x - origin.x;
      const dy = it.slot.y - origin.y;
      it.el.animate(
        [
          { transform: 'translate(-50%, -50%) scale(0.72)' },
          { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(1)` },
        ],
        { duration: INSERT_FX.fanMs, easing: 'cubic-bezier(0.16, 0.8, 0.24, 1)', fill: 'forwards' },
      );
    });

    await waitDeckFx(INSERT_FX.fanMs + INSERT_FX.holdMs, signal);
    if (signal.aborted) {
      items.forEach((it) => it.el.remove());
      return;
    }

    const dest = centerOf(deckNow());
    items.forEach((it) => {
      it.el.style.left = `${it.slot.x}px`;
      it.el.style.top = `${it.slot.y}px`;
      it.el.getAnimations().forEach((a) => a.cancel());
      const dx = dest.x - it.slot.x;
      const dy = dest.y - it.slot.y;
      it.el.animate(
        [
          { transform: 'translate(-50%, -50%) scale(1)', opacity: 1 },
          { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(0.42)`, opacity: 0.35 },
        ],
        { duration: INSERT_FX.flyMs, easing: 'cubic-bezier(0.4, 0, 0.2, 1)', fill: 'forwards' },
      );
    });

    await waitDeckFx(INSERT_FX.flyMs, signal);
    if (signal.aborted) {
      items.forEach((it) => it.el.remove());
      return;
    }

    thump();
    bumpCount(puts.length);
    paintDeckPile(shown);
    items.forEach((it) => it.el.remove());
    await waitDeckFx(INSERT_FX.afterMs, signal);
    layer.classList.remove('fx-layer--curse', 'fx-layer--shard');
  };

  const run = async (beat: FxBeat) => {
    if (signal.aborted) return;
    await drawOneFx(beat);
  };

  const drawOneFx = async (beat: FxBeat) => {
    const grade = landGradeOf(beat.slug);
    const spec = LAND_FX[grade];
    const card = makeCard(beat, true);
    layer.append(card);
    const start = centerOf(deckNow());
    const dest = centerOf(root.querySelector(`.stack--${beat.slug}`));
    card.style.left = `${start.x}px`;
    card.style.top = `${start.y}px`;
    card.classList.add('is-show', 'is-aura');
    if (grade === 'shard') card.classList.add('is-gilt');
    if (grade === 'doom') {
      card.classList.add('is-hex');
      root.classList.add('is-land-slow');
    }
    bumpCount(-1);
    thump();
    const dx = dest.x - start.x;
    const dy = dest.y - start.y;
    const landed = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    const hangX = dx * (grade === 'doom' ? 0.42 : 0.55);
    const hangY = dy * (grade === 'doom' ? 0.38 : 0.55) - (grade === 'doom' ? 18 : 0);
    const fly = card.animate(
      [
        { transform: 'translate(-50%, -50%) scale(0.7) rotateY(180deg)', offset: 0 },
        {
          transform: `translate(calc(-50% + ${hangX}px), calc(-50% + ${hangY}px)) scale(${
            grade === 'doom' ? 1.12 : 1
          }) rotateY(180deg)`,
          offset: grade === 'doom' ? 0.48 : 0.45,
        },
        { transform: `${landed} scale(${grade === 'heavy' || grade === 'doom' ? 0.82 : 0.9}) rotateY(0deg)`, offset: 1 },
      ],
      { duration: spec.flyMs, easing: flyEase(grade), fill: 'forwards' },
    );
    await waitDeckFx(spec.flyMs * spec.flipAt, signal);
    card.classList.remove('is-back');
    if (grade === 'doom') root.classList.remove('is-land-slow');
    try {
      await Promise.race([fly.finished, waitDeckFx(spec.flyMs, signal)]);
    } catch {
      /* skip */
    }
    if (signal.aborted) {
      card.remove();
      return;
    }
    spawnLandBurst(layer, dest.x, dest.y, grade, signal);
    punchScreen(root, grade, signal);
    const bounce = spec.bouncePx;
    const land = card.animate(
      [
        { transform: `${landed} scale(0.86)` },
        { transform: `${landed} translateY(-${bounce}px) scale(1.04)` },
        { transform: `${landed} scale(0.85)` },
      ],
      { duration: spec.bounceMs, easing: 'cubic-bezier(0.2, 0.9, 0.35, 1)', fill: 'forwards' },
    );
    try {
      await Promise.race([land.finished, waitDeckFx(spec.bounceMs, signal)]);
    } catch {
      /* skip */
    }
    card.remove();
  };

    const gone = beats.filter((b) => b.kind === 'remove');
    const morphs = beats.filter((b) => b.kind === 'morph');
    const puts = beats.filter((b) => b.kind === 'insert');
    const rest = beats.filter((b) => b.kind === 'draw');
    if (gone.some((b) => b.from === 'deck') || morphs.length || puts.length) paintDeckPile(fromCount);
    if (gone.length) await vanishAll(gone);
    if (signal.aborted || fxGen !== my) return;
    if (morphs.length) await morphAll(morphs);
    if (signal.aborted || fxGen !== my) return;
    if (puts.length) await insertAll(puts);
    if (signal.aborted || fxGen !== my) return;
    const jobs = rest.map((beat, i) => waitDeckFx(i * FX_STAGGER_MS, signal).then(() => run(beat)));
    await Promise.all(jobs);
  } finally {
    layer.removeEventListener('click', skip);
    layer.removeEventListener('keydown', skip);
    if (fxGen === my) {
      hideFxLayer(layer);
      clearLandScreen(root);
      if (countEl) countEl.textContent = String(toCount);
      paintDeckPile(toCount);
      deckNow()?.classList.remove('is-thump');
      if (deckFxPlaying === ac) deckFxPlaying = null;
    }
  }
}


/** 한 번 체력 연출 길이. 연속 변화는 끊고 새 목표로 잇는다. */
export const HP_FX_MS = 420;
/** 이 비율 이하면 체력 바가 맥동한다. */
export const HP_DANGER_RATIO = 0.34;

export interface HpSnap {
  hp: number;
  maxHp: number;
}

export type HpBeatKind = 'hurt' | 'heal' | 'maxDown' | 'maxUp';

export interface HpBeat {
  kind: HpBeatKind;
  amount: number;
}

export function hpBeatsFromChanges(changes: string[], from: HpSnap, to: HpSnap): HpBeat[] {
  const beats: HpBeat[] = [];
  for (const line of changes) {
    const maxDown = line.match(/최대 체력\s+(\d+)\s*→\s*(\d+)/);
    if (maxDown) {
      const lost = Number(maxDown[1]) - Number(maxDown[2]);
      if (lost > 0) beats.push({ kind: 'maxDown', amount: lost });
      continue;
    }
    const maxUp = line.match(/최대 체력\s*\+(\d+)/);
    if (maxUp) {
      beats.push({ kind: 'maxUp', amount: Number(maxUp[1]) });
      continue;
    }
    const heal = line.match(/체력\s*\+(\d+)/);
    if (heal) {
      beats.push({ kind: 'heal', amount: Number(heal[1]) });
      continue;
    }
    const hurt = line.match(/체력\s*-(\d+)/);
    if (hurt) {
      beats.push({ kind: 'hurt', amount: Number(hurt[1]) });
      continue;
    }
    const set = line.match(/체력이\s+(\d+)/);
    if (set) {
      const delta = Number(set[1]) - from.hp;
      if (delta < 0) beats.push({ kind: 'hurt', amount: -delta });
      if (delta > 0) beats.push({ kind: 'heal', amount: delta });
    }
  }
  if (beats.length === 0) {
    const dMax = to.maxHp - from.maxHp;
    const dHp = to.hp - from.hp;
    if (dMax < 0) beats.push({ kind: 'maxDown', amount: -dMax });
    else if (dMax > 0) beats.push({ kind: 'maxUp', amount: dMax });
    else if (dHp < 0) beats.push({ kind: 'hurt', amount: -dHp });
    else if (dHp > 0) beats.push({ kind: 'heal', amount: dHp });
  }
  return beats;
}

export function visScale(maxHp: number): number {
  return Math.max(MAX_HP, maxHp);
}

let hpFxPlaying: AbortController | null = null;
let hpFxGen = 0;

function hideLayer(layer: HTMLElement): void {
  layer.className = '';
  layer.replaceChildren();
  layer.hidden = true;
}

export function skipHpFx(): void {
  hpFxPlaying?.abort();
  hpFxPlaying = null;
  hpFxGen += 1;
  const layer = document.getElementById('hp-fx');
  if (layer instanceof HTMLElement) hideLayer(layer);
  const app = document.getElementById('app');
  app?.classList.remove('is-hp-shake', 'is-hp-dead');
  snapBarToNow();
}

function snapBarToNow(): void {
  const bar = document.querySelector<HTMLElement>('.hpbar');
  if (!bar) return;
  bar.classList.remove('is-animating');
  const fill = bar.querySelector<HTMLElement>('.hpbar__fill');
  const lock = bar.querySelector<HTMLElement>('.hpbar__lock');
  if (fill) fill.style.transition = 'none';
  if (lock) lock.style.transition = 'none';
}

function waitHpFx(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve();
      return;
    }
    const t = window.setTimeout(resolve, ms);
    signal.addEventListener(
      'abort',
      () => {
        window.clearTimeout(t);
        resolve();
      },
      { once: true },
    );
  });
}

function applyBar(bar: HTMLElement, hp: number, maxHp: number, animate: boolean): void {
  const scale = visScale(maxHp);
  const fillPct = (Math.max(0, hp) / scale) * 100;
  const lockPct = Math.max(0, (scale - maxHp) / scale) * 100;
  bar.style.width = `${Math.round(148 * (scale / MAX_HP))}px`;
  const fill = bar.querySelector<HTMLElement>('.hpbar__fill');
  const lock = bar.querySelector<HTMLElement>('.hpbar__lock');
  const ms = animate ? `${HP_FX_MS}ms` : '0ms';
  if (fill) {
    fill.style.transition = `width ${ms} ease-out, background-color ${ms} ease`;
    fill.style.width = `${fillPct}%`;
  }
  if (lock) {
    lock.style.transition = `width ${ms} ease-out`;
    lock.style.width = `${lockPct}%`;
  }
}

function spawnPop(host: HTMLElement, beat: HpBeat): void {
  const el = document.createElement('span');
  el.className = `hp-pop hp-pop--${beat.kind}`;
  el.textContent = beat.kind === 'heal' || beat.kind === 'maxUp' ? `+${beat.amount}` : `-${beat.amount}`;
  if (beat.kind === 'maxDown') el.textContent = `최대 -${beat.amount}`;
  if (beat.kind === 'maxUp') el.textContent = `최대 +${beat.amount}`;
  host.append(el);
  const anim = el.animate(
    [
      { opacity: 0, transform: 'translate(-50%, 6px) scale(0.85)' },
      { opacity: 1, transform: 'translate(-50%, -8px) scale(1)', offset: 0.22 },
      { opacity: 0, transform: 'translate(-50%, -28px) scale(1)' },
    ],
    { duration: HP_FX_MS, easing: 'ease-out', fill: 'forwards' },
  );
  void anim.finished.then(() => el.remove()).catch(() => el.remove());
}

export async function playHpFx(
  layer: HTMLElement,
  root: HTMLElement,
  from: HpSnap,
  to: HpSnap,
  beats: HpBeat[],
  dead: boolean,
): Promise<void> {
  hpFxPlaying?.abort();
  if (!dead && beats.length === 0 && from.hp === to.hp && from.maxHp === to.maxHp) return;

  const my = ++hpFxGen;
  const ac = new AbortController();
  hpFxPlaying = ac;
  const { signal } = ac;

  const skip = () => {
    ac.abort();
    skipHpFx();
  };
  layer.hidden = false;
  layer.replaceChildren();
  layer.className = '';
  layer.addEventListener('click', skip);
  layer.addEventListener('keydown', skip);

  const vitals = root.querySelector<HTMLElement>('.vitals');
  const bar = root.querySelector<HTMLElement>('.hpbar');
  const app = root;

  if (bar) {
    applyBar(bar, from.hp, from.maxHp, false);
    void bar.offsetWidth;
    applyBar(bar, to.hp, to.maxHp, true);
  }

  const hurt = beats.filter((b) => b.kind === 'hurt').reduce((s, b) => s + b.amount, 0);
  const heal = beats.filter((b) => b.kind === 'heal').reduce((s, b) => s + b.amount, 0);
  const maxDown = beats.some((b) => b.kind === 'maxDown');
  const maxUp = beats.some((b) => b.kind === 'maxUp');

  if (dead) {
    layer.classList.add('is-dead');
    app.classList.add('is-hp-dead');
  } else if (maxDown) {
    layer.classList.add('is-rot');
    bar?.classList.add('is-seal');
  } else if (maxUp) {
    layer.classList.add('is-maxup');
    bar?.classList.add('is-grow');
  } else if (hurt > 0) {
    const intensity = Math.min(1, 0.28 + hurt / 10);
    layer.style.setProperty('--hp-hurt', String(intensity));
    layer.classList.add('is-hurt');
    app.style.setProperty('--hp-shake', `${1.2 + hurt * 0.7}px`);
    app.classList.add('is-hp-shake');
  } else if (heal > 0) {
    layer.classList.add('is-heal');
    bar?.classList.add('is-mend');
  }

  const popHost = root.querySelector<HTMLElement>('.vitals__row') ?? vitals ?? layer;
  beats.forEach((beat, i) => {
    window.setTimeout(() => {
      if (signal.aborted || hpFxGen !== my) return;
      spawnPop(popHost, beat);
    }, i * 70);
  });

  try {
    await waitHpFx(HP_FX_MS, signal);
  } finally {
    layer.removeEventListener('click', skip);
    layer.removeEventListener('keydown', skip);
    if (hpFxGen === my) {
      hideLayer(layer);
      app.classList.remove('is-hp-shake');
      bar?.classList.remove('is-seal', 'is-grow', 'is-mend');
      if (!dead) app.classList.remove('is-hp-dead');
      if (hpFxPlaying === ac) hpFxPlaying = null;
    }
  }
}


/** 앞면으로 공개해 두는 시간. 클릭하면 바로 섞기로 넘어간다. */
export const FATE_REVEAL_MS = 1500;
/** 자리 교환 횟수. 3장 기준 초기값. */
export const FATE_SWAP_COUNT = 4;
/** 자리 교환 한 번의 길이. */
export const FATE_SWAP_MS = 400;
/** 일제히 뒤집히는 길이. */
const FATE_FLIP_MS = 420;
/** 고른 장을 보여 주는 길이. */
const FATE_SHOW_MS = 700;
const CARD_W = 88;
const CARD_H = 118;
const CARD_GAP = 22;
const ARC = 36;

export interface FatePick {
  uids: string[];
  gaveUp: boolean;
}

let runId = 0;
let skipReveal = false;

export function skipFate(host?: HTMLElement): void {
  runId += 1;
  if (host) {
    host.hidden = true;
    host.innerHTML = '';
  }
}

function slugOf(card: CardInstance): string {
  return card.element ?? card.curseType ?? card.kind;
}

function slotX(slot: number, n: number): number {
  return (slot - (n - 1) / 2) * (CARD_W + CARD_GAP);
}

function waitFate(ms: number, alive: () => boolean, skipped?: () => boolean): Promise<void> {
  return new Promise((resolve) => {
    const t0 = performance.now();
    const tick = (): void => {
      if (!alive() || skipped?.() || performance.now() - t0 >= ms) {
        resolve();
        return;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

function pickSwap(n: number): [number, number] {
  if (n < 2) return [0, 0];
  const a = Math.floor(Math.random() * n);
  let b = Math.floor(Math.random() * (n - 1));
  if (b >= a) b += 1;
  return [a, b];
}

function visualShuffle<T>(items: T[]): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = out[i]!;
    out[i] = out[j]!;
    out[j] = tmp;
  }
  return out;
}

function moveCard(el: HTMLElement, from: number, to: number, n: number, lift: number, alive: () => boolean): Promise<void> {
  const x0 = slotX(from, n);
  const x1 = slotX(to, n);
  const mid = (x0 + x1) / 2;
  el.animate(
    [
      { transform: `translate(${x0}px, 0px)` },
      { transform: `translate(${mid}px, ${lift}px)` },
      { transform: `translate(${x1}px, 0px)` },
    ],
    { duration: FATE_SWAP_MS, easing: 'cubic-bezier(.4,.08,.55,1)', fill: 'forwards' },
  );
  return waitFate(FATE_SWAP_MS, alive).then(() => {
    el.style.transform = `translate(${x1}px, 0px)`;
  });
}

/**
 * 확인 → 뒤집기 → 자리 교환 → 고르기.
 *
 * 섞는 난수는 게임 시드와 분리한다. 어떤 장이 나왔는지만 이미 정해져 있다.
 */
export async function playFate(
  host: HTMLElement,
  cards: CardInstance[],
  keep: number,
): Promise<FatePick | null> {
  const my = ++runId;
  const alive = () => my === runId;
  skipReveal = false;

  host.hidden = false;
  host.innerHTML = '';
  host.className = '';

  const n = cards.length;
  const board = document.createElement('div');
  board.className = 'fate';
  board.innerHTML = `
    <p class="fate__head">카드를 확인한다</p>
    <div class="fate__row" style="height:${CARD_H + 48}px"></div>
    <button type="button" class="fate__give">추적 포기</button>
  `;
  host.append(board);

  const row = board.querySelector<HTMLElement>('.fate__row')!;
  const head = board.querySelector<HTMLElement>('.fate__head')!;
  const give = board.querySelector<HTMLButtonElement>('.fate__give')!;

  const holders: HTMLElement[] = [];
  const els: HTMLButtonElement[] = [];
  const slotOf: number[] = [];

  for (let i = 0; i < n; i++) {
    const card = cards[i]!;
    const holder = document.createElement('div');
    holder.className = 'fate-slot';
    holder.style.transform = `translate(${slotX(i, n)}px, 0px)`;
    const btn = document.createElement('button');
    btn.type = 'button';
    const slug = slugOf(card);
    btn.className = `fate-card fate-card--${slug}`;
    btn.dataset.uid = card.uid;
    btn.setAttribute('aria-label', card.name);
    btn.innerHTML = `
      <span class="fate-card__inner">
        <span class="fate-card__face ${playingCardFrontClass(slug)}">${cardFaceHtml(slug, card.name)}</span>
        <span class="fate-card__back ${playingCardBackClass()}" aria-hidden="true">${cardBackHtml()}</span>
      </span>
    `;
    holder.append(btn);
    row.append(holder);
    holders.push(holder);
    els.push(btn);
    slotOf.push(i);
  }

  let gaveUp = false;
  let pickable = false;
  const chosen: string[] = [];

  const finishGiveUp = (): FatePick => {
    const rest = visualShuffle(cards.filter((c) => !chosen.includes(c.uid)).map((c) => c.uid));
    while (chosen.length < keep && rest.length) chosen.push(rest.shift()!);
    return { uids: chosen.slice(0, keep), gaveUp: true };
  };

  const onHostClick = (e: MouseEvent): void => {
    if (give.contains(e.target as Node)) return;
    if (!pickable) skipReveal = true;
  };

  const teardown = (): void => {
    host.removeEventListener('click', onHostClick);
    if (my === runId) {
      host.hidden = true;
      host.innerHTML = '';
    }
  };

  give.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!alive() || gaveUp) return;
    gaveUp = true;
  });
  host.addEventListener('click', onHostClick);

  await waitFate(FATE_REVEAL_MS, alive, () => skipReveal || gaveUp);
  if (!alive()) {
    teardown();
    return null;
  }

  if (!gaveUp) {
    head.textContent = '섞는다';
    for (const el of els) el.classList.add('is-back');
    await waitFate(FATE_FLIP_MS, alive, () => gaveUp);
  }

  if (!alive()) {
    teardown();
    return null;
  }

  if (!gaveUp && n >= 2) {
    for (let s = 0; s < FATE_SWAP_COUNT; s++) {
      if (!alive() || gaveUp) break;
      const [a, b] = pickSwap(n);
      const ia = slotOf.indexOf(a);
      const ib = slotOf.indexOf(b);
      if (ia < 0 || ib < 0) continue;
      const elA = holders[ia]!;
      const elB = holders[ib]!;
      elA.style.zIndex = '3';
      elB.style.zIndex = '2';
      const go = (): boolean => alive() && !gaveUp;
      await Promise.all([moveCard(elA, a, b, n, -ARC, go), moveCard(elB, b, a, n, ARC, go)]);
      slotOf[ia] = b;
      slotOf[ib] = a;
      elA.style.zIndex = '1';
      elB.style.zIndex = '1';
    }
  }

  if (!alive()) {
    teardown();
    return null;
  }

  if (gaveUp) {
    const result = finishGiveUp();
    for (const el of els) {
      if (result.uids.includes(el.dataset.uid ?? '')) el.classList.remove('is-back');
    }
    head.textContent = '추적 포기';
    await waitFate(FATE_SHOW_MS, alive);
    teardown();
    return alive() ? result : null;
  }

  pickable = true;
  head.textContent = keep === 1 ? '한 장을 고른다' : `${keep}장을 고른다`;
  for (const el of els) el.classList.add('is-pickable');

  await new Promise<void>((resolve) => {
    const onPick = (el: HTMLButtonElement): void => {
      if (!alive() || gaveUp) {
        resolve();
        return;
      }
      const uid = el.dataset.uid;
      if (!uid || chosen.includes(uid) || !el.classList.contains('is-pickable')) return;
      chosen.push(uid);
      el.classList.remove('is-back', 'is-pickable');
      el.classList.add('is-picked');
      if (chosen.length >= keep) resolve();
    };

    for (const el of els) {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        onPick(el);
      });
    }

    const poll = (): void => {
      if (!alive() || gaveUp || chosen.length >= keep) {
        resolve();
        return;
      }
      requestAnimationFrame(poll);
    };
    requestAnimationFrame(poll);
  });

  if (!alive()) {
    teardown();
    return null;
  }

  if (gaveUp) {
    const result = finishGiveUp();
    for (const el of els) {
      if (result.uids.includes(el.dataset.uid ?? '')) el.classList.remove('is-back');
    }
    await waitFate(FATE_SHOW_MS, alive);
    teardown();
    return alive() ? result : null;
  }

  await waitFate(FATE_SHOW_MS, alive);
  teardown();
  return alive() ? { uids: chosen.slice(0, keep), gaveUp: false } : null;
}


/**
 * 상태를 읽어 DOM을 다시 그리기만 한다.
 *
 * 화면의 일은 두 가지다. 선택지 둘을 감정으로 읽히게 세우는 것, 그리고 그 선택이
 * 덱을 어떻게 바꿨는지 바로 보이게 하는 것.
 */

export interface Handlers {
  onChoose: (side: 'red' | 'blue') => void;
  onPushDraw: () => void;
  onPushStop: () => void;
  onPickElement: (element: ElementType) => void;
  onUseSynergy: (target: ElementType) => void;
  onRestart: () => void;
  onHelp: () => void;
}

function fateView(): string {
  return `
    <div class="fate-wait" aria-live="polite">
      <p class="fate-wait__head">카드를 확인한다</p>
    </div>`;
}

/**
 * 희소도는 화면에 뜬다 — 자주 오지 않는 짝이라는 것을 알아야
 * "이번에 안 고르면 다음이 언제일지 모른다"가 성립한다.
 */
const RARITY_LABEL: Record<Rarity, string> = {
  common: '흔함',
  uncommon: '보통',
  rare: '희귀',
  ultra: '매우 희귀',
};

/**
 * 시너지를 쓰면 무슨 일이 일어나는지 한 줄로.
 *
 * 규칙 설명(ELEMENT_RULES.description)은 "5장 모이면 ~"이라 조건을 말한다.
 * 버튼 위에는 조건이 아니라 **결과**가 떠야 한다 — 이미 조건은 찼으니까.
 *
 */
const SYNERGY_EFFECT: Record<ElementType, string> = {
  fire: '덱의 저주 1장 소각',
  water: `최대 체력 +${WATER_MAX_HP_GAIN}`,
  dark: `체력 -${DARK_HP_COST}, 필드의 저주 1장 소각`,
  light: `체력 +${LIGHT_HP_GAIN}, 덱에 저주 1장`,
};

/**
 * 필드에 모인 것 하나를 "이름 N/문턱"으로 보여주는 태그.
 *
 * **저주와 속성이 같은 형식을 쓴다.** 규칙이 같으니 표시도 같아야 한다 —
 * 좋은 것과 나쁜 것을 색으로만 구분하면 플레이어가 배울 것이 하나로 준다.
 */
function kindTag(
  slug: string,
  name: string,
  count: number,
  threshold: number | null,
  near: boolean,
  title: string,
): string {
  const meter = threshold === null ? `${count}` : `${count}/${threshold}`;
  return `<span class="kindtag kindtag--${slug}${near ? ' is-near' : ''}" title="${title}"
    >${name} <b>${meter}</b></span>`;
}

/**
 * 봉인된 색이면 버튼에 경고를 붙인다.
 *
 * 남은 횟수가 화면에 떠 있어도, 누르는 순간에 그 버튼 위에서 보이지 않으면
 * 실수한다. 제약을 잊고 누르면 딜레마가 아니라 사고가 된다.
 */
function optionButton(side: 'red' | 'blue', option: PairSide, state: GameState): string {
  const sealed = state.lasting.filter((l) => l.side === undefined || l.side === side);
  const bite = sealed.reduce((sum, l) => sum + l.damage, 0);
  return `
    <button class="pick pick--${side}${bite > 0 ? ' pick--sealed' : ''}" data-side="${side}">
      ${bite > 0 ? `<span class="pick__seal">누르면 체력 -${bite}</span>` : ''}
      <span class="pick__text">${option.text}</span>
    </button>`;
}

/**
 * 지금 걸려 있는 지속 효과. 남은 횟수를 항상 띄운다.
 *
 * 여러 개가 동시에 걸릴 수 있으므로 줄로 쌓는다.
 */
function lastingPanel(state: GameState): string {
  if (state.lasting.length === 0) return '';
  const rows = state.lasting
    .map((l) => {
      const left = l.onExpire
        ? `<b>${l.remaining}</b>회`
        : `남은 <b>${l.remaining}</b>회`;
      return `
      <li class="lasting__row${l.side ? ` lasting__row--${l.side}` : ''}">
        <span class="lasting__label">${l.label}</span>
        <span class="lasting__left">${left}</span>
      </li>`;
    })
    .join('');
  return `
    <section class="lasting" aria-label="걸려 있는 효과">
      <p class="lasting__head">걸려 있는 효과</p>
      <ul class="lasting__list">${rows}</ul>
    </section>`;
}

/**
 * 필드의 스택 하나. 카드가 아니라 **종류가 단위다.**
 *
 * 낱장으로 흩어 놓으면 장수가 늘수록 무엇이 몇 장인지 세어야 한다. 종류별로
 * 묶어 쌓으면 세지 않아도 보인다 — 진행도가 곧 스택의 높이다.
 */
interface FieldStack {
  slug: string;
  name: string;
  threshold: number | null;
  /** 한 장만 더 모으면 쓸 수 있게 되는 상태. */
  near: boolean;
  /** 지금 눌러서 쓸 수 있는 상태. 속성에만 있다 — 저주는 저절로 터진다. */
  ready: boolean;
  /** 눌렀을 때 무슨 일이 일어나는지. 준비된 스택에만 보인다. */
  effect: string | null;
  title: string;
  cards: CardInstance[];
}

/** 필드 스택의 고정 순서. 속성 넷, 저주 셋, 파편. */
function fieldStacks(state: GameState): FieldStack[] {
  const edged = onEdge(state.field);
  const elemEdged = elementsOnEdge(state.field);

  const elementStacks: FieldStack[] = ELEMENT_ORDER.map((t) => {
    const rule = ELEMENT_RULES[t];
    const ready = canFireSingle(state.field, t);
    return {
      slug: t,
      name: rule.name,
      threshold: rule.threshold,
      near: elemEdged.includes(t),
      ready,
      effect: ready ? SYNERGY_EFFECT[t] : null,
      title: `${rule.name} — ${rule.target}에 작용한다. ${rule.description}`,
      cards: state.field.filter((c) => c.element === t),
    };
  });

  const curseStacks: FieldStack[] = (Object.keys(CURSE_RULES) as CurseType[]).map((t) => {
    const rule = CURSE_RULES[t];
    return {
      slug: t,
      name: rule.name,
      threshold: rule.threshold,
      near: edged.includes(t),
      // 저주는 손댈 수 없다. 조건이 차면 저절로 터진다.
      ready: false,
      effect: null,
      title: `${rule.name} — ${rule.target}을(를) 노린다. ${rule.description}`,
      cards: state.field.filter((c) => c.curseType === t),
    };
  });

  const shards = state.field.filter((c) => c.kind === 'shard');
  const shardStack: FieldStack = {
    slug: 'shard',
    name: '파편',
    // 파편의 문턱은 곧 승리 조건이다. 다른 스택과 같은 형식으로 읽힌다.
    threshold: state.escapeTarget,
    near: shards.length === state.escapeTarget - 1,
    ready: false,
    effect: null,
    title: `탈출구 파편 — 필드에 ${state.escapeTarget}장 모이면 탈출한다`,
    cards: shards,
  };

  return [...elementStacks, ...curseStacks, shardStack];
}

/**
 * 필드.
 *
 * 종류별로 묶어 스파이더 솔리테어처럼 세로로 겹쳐 쌓는다. 장수가 아무리
 * 늘어도 **무엇이 몇 장인지가 한눈에** 보여야 하기 때문이다. 스택 머리에
 * 붙는 배지는 저주와 속성이 같은 형식을 쓰고, 문턱에 닿기 직전인 스택은
 * 스택째로 살아난다 — 계산 없이 그 상태가 보이는 것이 이 화면의 일이다.
 *
 * 빈 종류도 자리를 지킨다. "파멸 0/3"이 사라지면 지금 안전한 것인지 아직
 * 안 본 것인지 구분할 수 없다.
 */
function fieldPanel(state: GameState): string {
  const edged = onEdge(state.field);
  const elemEdged = elementsOnEdge(state.field);
  const onField = fieldCurseBreakdown(state);

  const all = fieldStacks(state);
  const curseN = (Object.keys(CURSE_RULES) as CurseType[]).length;
  const elementStacks = all.slice(0, ELEMENT_ORDER.length);
  const curseStacks = all.slice(ELEMENT_ORDER.length, ELEMENT_ORDER.length + curseN);
  const rest = all.slice(ELEMENT_ORDER.length + curseN);

  const renderStack = (stack: FieldStack): string => {
    const pile = stack.cards
      .map((card: CardInstance) => {
        const slug = card.element ?? card.curseType ?? card.kind;
        return `<div class="${playingCardFrontClass(slug)}">${cardFaceHtml(slug, card.name)}</div>`;
      })
      .join('');

    const badge = kindTag(
      stack.slug,
      stack.name,
      stack.cards.length,
      stack.threshold,
      stack.near || stack.ready,
      stack.title,
    );
    const body = `
        ${badge}
        <div class="stack__cards">${pile || '<span class="stack__empty">·</span>'}</div>
        ${stack.effect ? `<span class="stack__use">${stack.effect}</span>` : ''}`;

    return stack.ready
      ? `<button class="stack stack--${stack.slug} is-ready" data-synergy="${stack.slug}"
             title="${stack.title}\n누르면 ${ELEMENT_SYNERGY_COUNT}장을 써서 발동한다">${body}</button>`
      : `<div class="stack stack--${stack.slug}${stack.near ? ' is-near' : ''}">${body}</div>`;
  };

  const warnings = [
    // 속성은 닥치는 것이 아니라 쓰는 것이라 경고가 아니라 예고다.
    // 쓸 수 있게 된 뒤에는 스택 자체가 버튼이 되므로 여기서는 빠진다.
    ...elemEdged.map(
      (t) =>
        `<span class="edgewarn edgewarn--${t}">${ELEMENT_RULES[t].name} 한 장만 더면 쓸 수 있다 — ${
          SYNERGY_EFFECT[t]
        }</span>`,
    ),
    ...edged.map((t) => {
      const rule = CURSE_RULES[t];
      const left = (rule.threshold ?? 0) - onField[t];
      const head = left <= 1 ? `${rule.name} 한 장만 더면` : `${rule.name} ${left}장 더면`;
      return `<span class="edgewarn edgewarn--${t}">${head} — ${rule.description}</span>`;
    }),
  ].join('');

  return `
    <section class="field" aria-label="필드">
      <div class="field__head">
        <span class="field__label">필드 <b>${state.field.length}</b>장</span>
      </div>
      ${warnings ? `<div class="edgewarns">${warnings}</div>` : ''}
      <div class="stacks">
        <div class="field__elements">${elementStacks.map(renderStack).join('')}</div>
        <div class="field__curses">${curseStacks.map(renderStack).join('')}</div>
        ${rest.map(renderStack).join('')}
      </div>
      ${
        state.field.length === 0
          ? '<p class="fcards__empty">아직 아무것도 펼치지 않았다</p>'
          : ''
      }
    </section>`;
}

/** 속성 지정 화면. 네 속성 중 하나를 골라 덱에 넣는다. */
function pickView(state: GameState): string {
  const pick = state.pick!;
  const elems = fieldElementBreakdown(state);
  const inDeck = deckElementBreakdown(state);

  const buttons = ELEMENT_ORDER.map((t) => {
    const rule = ELEMENT_RULES[t];
    return `
      <button class="ebtn ebtn--${t}" data-element="${t}">
        <span class="ebtn__name">${rule.name}</span>
        <span class="ebtn__state">필드 ${elems[t]}/${ELEMENT_SYNERGY_COUNT} · 덱 ${inDeck[t]}</span>
        <span class="ebtn__desc">${rule.description}</span>
      </button>`;
  }).join('');

  return `
    <div class="epick">
      <p class="epick__head">
        어느 속성을 덱에 넣을까 — <b>${pick.count - pick.remaining + 1}</b>/${pick.count}장째
      </p>
      <div class="ebtns">${buttons}</div>
      <section class="blog">${
        pick.log.map((l) => `<p>${l}</p>`).join('') || '<p>고르면 덱으로 들어간다.</p>'
      }</section>
    </div>`;
}

/** 푸시 유어 럭 화면. 한 장씩 뽑으며 멈출지 정한다. */
function pushView(state: GameState): string {
  const push = state.push!;
  const edged = onEdge(state.field);

  return `
    <div class="push">
      <p class="push__head">
        ${push.drawn}장 뽑았다.
        ${
          push.stopped
            ? '<b class="push__stop">겹쳐서 끝났다</b>'
            : edged.length > 0
              ? `<b class="push__risk">${edged.map((t) => CURSE_RULES[t].name).join(', ')} 1장 — 한 장 더면 발동</b>`
              : '아직 겹친 것은 없다.'
        }
      </p>
      <div class="push__controls">
        ${
          push.stopped
            ? `<button id="push-stop" class="btn">계속</button>`
            : `<button id="push-draw" class="btn">한 장 더</button>
               <button id="push-stop" class="btn btn--flee">여기서 멈춘다</button>`
        }
      </div>
      <section class="blog">${push.log.map((l) => `<p>${l}</p>`).join('') || '<p>덱에 손을 넣는다…</p>'}</section>
    </div>`;
}

/** 체력. 저주 피해를 받는 대상이라 항상 보여야 한다. */
function vitals(state: GameState): string {
  const scale = Math.max(MAX_HP, state.maxHp);
  const fillPct = (Math.max(0, state.hp) / scale) * 100;
  const lockPct = Math.max(0, (scale - state.maxHp) / scale) * 100;
  const low = state.maxHp > 0 && state.hp <= state.maxHp * HP_DANGER_RATIO;
  const barW = Math.round(148 * (scale / MAX_HP));
  // 부패로 깎인 최대 체력은 회복으로 돌아오지 않는다. 검은 잠금 구간이
  // 그 자리를 대신 차지한다.
  const lost = Math.max(0, MAX_HP - state.maxHp);
  return `
    <div class="vitals">
      <span class="top__label">체력</span>
      <div class="vitals__row">
        <b class="${low ? 'is-low' : ''}">${state.hp}<span class="of">/${state.maxHp}</span></b>
        <div class="hpbar${low ? ' is-danger' : ''}" style="width:${barW}px">
          <i class="hpbar__fill${low ? ' is-low' : ''}" style="width:${fillPct}%"></i>
          <i class="hpbar__lock" style="width:${lockPct}%" title="부패로 깎여 되돌릴 수 없다"></i>
        </div>
        ${lost > 0 ? `<span class="vitals__lost" title="부패로 깎여 되돌릴 수 없다">최대 ${MAX_HP} → ${state.maxHp}</span>` : ''}
      </div>
    </div>`;
}

/**
 * 탈출 진척.
 *
 * **필드에 나온 파편만 센다.** 덱에 넣는 것은 시작일 뿐이고 꺼내는 것이
 * 과제이므로, 두 수를 나란히 보여주되 승리 조건인 필드 쪽을 크게 둔다.
 */
function shardTrack(state: GameState): string {
  const onField = countShards(state.field);
  const inDeck = countShards(state.deck);
  const pips = Array.from(
    { length: state.escapeTarget },
    (_, i) => `<i class="${i < onField ? 'is-lit' : ''}"></i>`,
  ).join('');
  return `
    <div class="escape">
      <span class="escape__label">탈출구 파편</span>
      <span class="escape__pips">${pips}</span>
      <span class="escape__count">필드 <b>${onField}</b>/${state.escapeTarget}</span>
      <span class="escape__deck">덱에 ${inDeck}</span>
    </div>`;
}

function deckStack(count: number): string {
  if (count <= 0) {
    return `<div class="deckstack is-empty" aria-hidden="true"><i class="deckstack__ghost"></i></div>`;
  }
  const layers = Math.max(1, Math.min(12, Math.ceil(count / 2)));
  const cards = Array.from(
    { length: layers },
    (_, i) =>
      `<div class="${playingCardBackClass()} deckstack__card" style="--i:${i}">${cardBackHtml()}</div>`,
  ).join('');
  return `<div class="deckstack" style="--n:${layers}" aria-hidden="true">${cards}</div>`;
}

function deckPanel(state: GameState): string {
  const total = state.deck.length;
  const curse = state.deck.filter((c) => c.kind === 'curse').length;
  const shard = countShards(state.deck);
  const taint = total === 0 ? 0 : curse / total;
  const level = TAINT_LEVELS.find((l) => taint < l.max) ?? TAINT_LEVELS[TAINT_LEVELS.length - 1]!;
  const elems = deckElementBreakdown(state);
  const curses = deckCurseBreakdown(state);

  return `
    <aside class="deck" aria-label="현재 덱">
      ${deckStack(total)}
      <div class="deck__top">
        <span class="deck__size${total <= DECK_WARN_AT ? ' is-warn' : ''}"><b>${total}</b>장</span>
        <span class="taint taint--${level.tone}">${level.label}</span>
      </div>
      ${
        total <= DECK_WARN_AT
          ? `<p class="deck__warn" role="status">덱이 마른다 — ${total}장</p>`
          : ''
      }
      <div class="curseratio">
        저주 <b>${curse}</b> / 전체 <b>${total}</b>
        <span class="curseratio__pct">${Math.round(taint * 100)}%</span>
      </div>
      <p class="cursekinds__label">덱 구성</p>
      <div class="cursekinds">${ELEMENT_ORDER.map(
        (t) =>
          `<span class="kindtag kindtag--${t}">${ELEMENT_RULES[t].name} <b>${elems[t]}</b></span>`,
      ).join('')}</div>
      <div class="cursekinds">${(Object.keys(CURSE_RULES) as CurseType[])
        .map(
          (t) =>
            `<span class="kindtag kindtag--${t}">${CURSE_RULES[t].name} <b>${curses[t]}</b></span>`,
        )
        .join('')}<span class="kindtag kindtag--shard">파편 <b>${shard}</b></span></div>
    </aside>`;
}

function recentChanges(state: GameState): string {
  const last = state.records[state.records.length - 1];
  if (!last) return `<p class="delta delta--idle">첫 선택을 기다린다</p>`;

  return `
    <div class="delta">
      <span class="delta__side delta__side--${last.side}">${last.side === 'red' ? '빨강' : '파랑'}</span>
      <span class="delta__lines">${last.changes
        .map((c) => `<span class="delta__line">${c}</span>`)
        .join('')}</span>
    </div>`;
}

export function render(root: HTMLElement, state: GameState, handlers: Handlers): void {
  const event = state.current;

  root.innerHTML = `
    <header class="top">
      <div class="top__step"><span class="top__label">선택</span><b>${
        state.step - (state.escaped || state.dead ? 1 : 0)
      }</b></div>
      ${vitals(state)}
      ${shardTrack(state)}
      <div class="top__actions">
        <button id="help" class="ghost" type="button">도움말</button>
        <button id="restart" class="ghost" type="button">처음부터</button>
      </div>
    </header>

    <main class="stage">
      ${
        state.push
          ? pushView(state)
          : state.pick
          ? pickView(state)
          : state.fate
          ? fateView()
          : state.dead || state.escaped
          ? ''
          : `
            <p class="prompt">
              <span class="prompt__rarity prompt__rarity--${event!.rarity}">${
                RARITY_LABEL[event!.rarity]
              }</span>
            </p>
            <div class="picks">
              ${optionButton('red', event!.red, state)}
              ${optionButton('blue', event!.blue, state)}
            </div>
          `
      }
      ${state.push || state.pick || state.fate ? '' : recentChanges(state)}
    </main>

    ${lastingPanel(state)}

    ${fieldPanel(state)}

    ${deckPanel(state)}
  `;

  root.querySelectorAll<HTMLButtonElement>('.pick').forEach((el) => {
    el.addEventListener('click', () => handlers.onChoose(el.dataset.side as 'red' | 'blue'));
  });
  root.querySelectorAll<HTMLButtonElement>('[data-synergy]').forEach((el) => {
    el.addEventListener('click', () =>
      handlers.onUseSynergy(el.dataset.synergy as ElementType),
    );
  });
  root.querySelectorAll<HTMLButtonElement>('.ebtn').forEach((el) => {
    el.addEventListener('click', () =>
      handlers.onPickElement(el.dataset.element as ElementType),
    );
  });
  root.querySelector('#push-draw')?.addEventListener('click', handlers.onPushDraw);
  root.querySelector('#push-stop')?.addEventListener('click', handlers.onPushStop);
  root.querySelector('#help')?.addEventListener('click', handlers.onHelp);
  root.querySelector('#restart')?.addEventListener('click', handlers.onRestart);

  const blog = root.querySelector('.blog');
  if (blog) blog.scrollTop = blog.scrollHeight;
}

function synergyCounts(state: GameState): Record<ElementType, number> {
  const counts: Record<ElementType, number> = { fire: 0, water: 0, dark: 0, light: 0 };
  for (const rec of state.records) {
    const hit = /^synergy:(fire|water|dark|light)$/.exec(rec.pairId);
    if (hit) counts[hit[1] as ElementType] += 1;
  }
  return counts;
}

function deathCause(state: GameState): '파멸 중첩' | '부패 중첩' | '체력 소진' {
  const tail = state.log.slice(-8).join('\n');
  if (tail.includes('즉사') || (state.causeOfDeath ?? '').includes('파멸')) return '파멸 중첩';
  if (/부패[^\n]*최대 체력[^\n]*→\s*0/.test(tail) || state.log.slice(-8).some((l) => l.includes('부패') && /\(0\//.test(l))) {
    return '부패 중첩';
  }
  return '체력 소진';
}

function countLine(parts: { name: string; n: number }[]): string {
  return parts.map((p) => `${p.name} ${p.n}`).join(' · ');
}

function deckLines(state: GameState): { element: string; curse: string } {
  const elems = deckElementBreakdown(state);
  const curses = deckCurseBreakdown(state);
  return {
    element: countLine(ELEMENT_ORDER.map((t) => ({ name: ELEMENT_RULES[t].name, n: elems[t] }))),
    curse: countLine([
      ...(Object.keys(CURSE_RULES) as CurseType[]).map((t) => ({
        name: CURSE_RULES[t].name,
        n: curses[t],
      })),
      { name: '파편', n: countShards(state.deck) },
    ]),
  };
}

function shareLine(state: GameState): string {
  const curses = state.triggers.doom + state.triggers.rot + state.triggers.erode;
  if (state.escaped) {
    const syn = state.records.filter((r) => r.pairId.startsWith('synergy:')).length;
    return `탈출 성공 / ${state.step}번째 선택 / 시너지 ${syn}회 / 저주 ${curses}회 발동`;
  }
  const shards = countShards(state.field);
  return `탈출 실패 / ${state.step}번째 선택 / ${deathCause(state)} / 파편 ${shards}/${state.escapeTarget} / 저주 ${curses}회 발동`;
}

function resultRows(state: GameState): string {
  const deck = deckLines(state);
  const curses = countLine(
    (Object.keys(CURSE_RULES) as CurseType[]).map((t) => ({
      name: CURSE_RULES[t].name,
      n: state.triggers[t],
    })),
  );
  const row = (k: string, v: string) =>
    `<div class="result__row"><span class="result__k">${k}</span><span class="result__v">${v}</span></div>`;

  if (state.escaped) {
    const syn = synergyCounts(state);
    const synLine = countLine(ELEMENT_ORDER.map((t) => ({ name: ELEMENT_RULES[t].name, n: syn[t] })));
    return [
      row('선택', `${state.step}회`),
      row('시너지', synLine),
      row('저주', curses),
      row('최대 체력', `${state.maxHp} / ${MAX_HP}`),
      row('덱 · 속성', deck.element),
      row('덱 · 저주', deck.curse),
    ].join('');
  }

  return [
    row('선택', `${state.step}번째`),
    row('원인', deathCause(state)),
    row('파편', `${countShards(state.field)}/${state.escapeTarget}`),
    row('저주', curses),
    row('덱 · 속성', deck.element),
    row('덱 · 저주', deck.curse),
  ].join('');
}

async function copyShare(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.left = '-999px';
    document.body.append(area);
    area.select();
    const ok = document.execCommand('copy');
    area.remove();
    return ok;
  }
}

function paintResult(host: HTMLElement, state: GameState, onRestart: () => void): void {
  if (!state.dead && !state.escaped) {
    host.hidden = true;
    host.className = '';
    host.innerHTML = '';
    return;
  }

  const clear = state.escaped;
  host.hidden = false;
  host.className = clear ? 'is-clear' : 'is-dead';
  host.innerHTML = `
    <div class="result result--${clear ? 'clear' : 'dead'}" role="dialog" aria-modal="true" aria-labelledby="result-title">
      <h1 class="result__title" id="result-title">${clear ? '탈출 성공' : '탈출 실패'}</h1>
      <div class="result__rows">${resultRows(state)}</div>
      <div class="result__actions">
        <button type="button" class="result__btn result__btn--again">다시 시작</button>
        <button type="button" class="result__btn result__btn--share">결과 공유</button>
      </div>
    </div>`;

  host.querySelector('.result__btn--again')?.addEventListener('click', onRestart);
  const share = host.querySelector<HTMLButtonElement>('.result__btn--share');
  const line = shareLine(state);
  share?.addEventListener('click', () => {
    void copyShare(line).then((ok) => {
      if (!share) return;
      share.textContent = ok ? '복사됨' : '복사 실패';
    });
  });
}


const root = document.querySelector<HTMLDivElement>('#app')!;
const tutHost = document.createElement('div');
tutHost.id = 'tutorial';
tutHost.hidden = true;
document.body.append(tutHost);
const tutorial = mountTutorial(tutHost);

const fxLayer = document.createElement('div');
fxLayer.id = 'fx-layer';
fxLayer.hidden = true;
fxLayer.tabIndex = -1;
document.body.append(fxLayer);

const hpLayer = document.createElement('div');
hpLayer.id = 'hp-fx';
hpLayer.hidden = true;
hpLayer.tabIndex = -1;
document.body.append(hpLayer);

const fateLayer = document.createElement('div');
fateLayer.id = 'fate-layer';
fateLayer.hidden = true;
document.body.append(fateLayer);

const resultHost = document.createElement('div');
resultHost.id = 'result';
resultHost.hidden = true;
document.body.append(resultHost);

let rng: Rng;
let state: GameState;

function snapHp(): HpSnap {
  return { hp: state.hp, maxHp: state.maxHp };
}

function playAftermath(fromDeck: number, fromHp: HpSnap, extraChanges: string[] = []): void {
  const last = state.records[state.records.length - 1];
  const changes = extraChanges.length ? extraChanges : (last?.changes ?? []);
  const deckBeats = beatsFromChanges(changes);
  const hpBeats = hpBeatsFromChanges(changes, fromHp, snapHp());
  draw();
  void playDeckFx(fxLayer, root, deckBeats, fromDeck, state.deck.length);
  const rotWait = deckBeats.some((b) => b.vanish === 'rotburst') ? VANISH_FX.fanMs + VANISH_FX.holdMs : 0;
  if (rotWait > 0) {
    window.setTimeout(() => {
      void playHpFx(hpLayer, root, fromHp, snapHp(), hpBeats, state.dead);
    }, rotWait);
  } else {
    void playHpFx(hpLayer, root, fromHp, snapHp(), hpBeats, state.dead);
  }
}

function start(seed = String(Date.now())): void {
  skipDeckFx();
  skipHpFx();
  skipFate(fateLayer);
  rng = new Rng(seed);
  state = createGame(rng);
  const params = new URLSearchParams(location.search);
  const want = params.get('pair');
  if (want) {
    const pair = PAIR_TABLE.find((p) => p.id === want);
    if (pair) {
      state.current = pair;
      if (!state.recent.includes(pair.id)) state.recent.push(pair.id);
    }
  }
  draw();
}

async function runFate(): Promise<void> {
  const fate = state.fate;
  if (!fate) return;
  const fromDeck = state.deck.length;
  const fromHp = snapHp();
  const result = await playFate(fateLayer, fate.cards, fate.keep);
  if (!result || !state.fate) return;
  resolveFate(state, result.uids, rng);
  playAftermath(fromDeck, fromHp);
}

function draw(): void {
  render(root, state, {
    onChoose: (side) => {
      const fromDeck = state.deck.length;
      const fromHp = snapHp();
      choose(state, side, rng);
      if (state.fate) {
        draw();
        void runFate();
        return;
      }
      playAftermath(fromDeck, fromHp);
    },
    onPushDraw: () => {
      const fromDeck = state.deck.length;
      const fromHp = snapHp();
      const logFrom = state.push?.log.length ?? 0;
      pushDraw(state, rng);
      const line = state.push?.log[state.push.log.length - 1] ?? '';
      const beat = beatFromPushLine(line);
      const added = (state.push?.log ?? []).slice(logFrom);
      const hpBeats = hpBeatsFromChanges(added, fromHp, snapHp());
      draw();
      void playHpFx(hpLayer, root, fromHp, snapHp(), hpBeats, state.dead);
      void playDeckFx(fxLayer, root, beat ? [beat] : [], fromDeck, state.deck.length);
    },
    onPushStop: () => {
      skipDeckFx();
      skipHpFx();
      pushStop(state, rng);
      draw();
    },
    onPickElement: (element) => {
      const fromDeck = state.deck.length;
      const fromHp = snapHp();
      pickElement(state, element, rng);
      const name = ELEMENT_RULES[element].name;
      draw();
      void playHpFx(hpLayer, root, fromHp, snapHp(), hpBeatsFromChanges([], fromHp, snapHp()), state.dead);
      void playDeckFx(
        fxLayer,
        root,
        [{ kind: 'insert', name, tone: 'element', slug: element }],
        fromDeck,
        state.deck.length,
      );
    },
    onUseSynergy: (target) => {
      const fromDeck = state.deck.length;
      const fromHp = snapHp();
      useSynergy(state, target, rng);
      playAftermath(fromDeck, fromHp);
    },
    onHelp: () => tutorial.open(),
    onRestart: () => start(),
  });
  paintResult(resultHost, state, () => start());
}

start();
if (tutorialUnseen()) tutorial.open();

