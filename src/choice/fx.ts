/** 한 장 연출 길이. 나타나서 덱에 닿을 때까지. */
export const FX_CARD_MS = 400;
/** 다음 장을 시작하기까지. 짧게 겹쳐야 여러 장이 답답하지 않다. */
export const FX_STAGGER_MS = 140;

type Tone = 'curse' | 'shard' | 'element';

export interface FxBeat {
  kind: 'insert' | 'remove' | 'draw';
  name: string;
  tone: Tone;
  slug: string;
}

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

    const burn = line.match(/^덱의\s+(.+)\s+1장을 소각했다/);
    if (burn) {
      const m = metaOf(burn[1]!);
      if (m) beats.push({ kind: 'remove', ...m });
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
      for (const n of splitNames(sub[1]!)) {
        const m = metaOf(n);
        if (m) beats.push({ kind: 'remove', ...m });
      }
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

function wait(ms: number, signal: AbortSignal): Promise<void> {
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

function makeCard(beat: FxBeat, faceDown: boolean): HTMLElement {
  const el = document.createElement('div');
  el.className = `fx-card fx-card--${beat.tone} fx-card--${beat.slug}${faceDown ? ' is-back' : ''}`;
  el.innerHTML = `
    <div class="fx-card__back"></div>
    <div class="fx-card__face">${beat.name}</div>`;
  return el;
}

let playing: AbortController | null = null;
let fxGen = 0;

function hideFxLayer(layer: HTMLElement): void {
  layer.replaceChildren();
  layer.hidden = true;
  layer.removeAttribute('tabindex');
}

export function skipDeckFx(): void {
  playing?.abort();
  playing = null;
  fxGen += 1;
  const layer = document.getElementById('fx-layer');
  if (layer instanceof HTMLElement) hideFxLayer(layer);
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
  playing?.abort();
  if (beats.length === 0) return;

  const my = ++fxGen;
  const ac = new AbortController();
  playing = ac;
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
  });

  const deck = root.querySelector('.deckstack');
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
    if (!deck) return;
    deck.classList.remove('is-thump');
    void (deck as HTMLElement).offsetWidth;
    deck.classList.add('is-thump');
  };

  const run = async (beat: FxBeat) => {
    if (signal.aborted) return;
    if (beat.kind === 'insert') await insertOne(beat);
    else if (beat.kind === 'remove') await removeOne(beat);
    else await drawOneFx(beat);
  };

  const insertOne = async (beat: FxBeat) => {
    const card = makeCard(beat, false);
    layer.append(card);
    const stage = centerOf(root.querySelector('.picks') ?? root.querySelector('.stage'));
    const dest = centerOf(deck);
    card.style.left = `${stage.x}px`;
    card.style.top = `${stage.y}px`;
    card.classList.add('is-show');
    if (beat.tone === 'curse') card.classList.add('is-hex');
    if (beat.tone === 'shard') card.classList.add('is-gilt');
    await wait(90, signal);
    if (signal.aborted) {
      card.remove();
      return;
    }
    const dx = dest.x - stage.x;
    const dy = dest.y - stage.y;
    const anim = card.animate(
      [
        { transform: 'translate(-50%, -50%) scale(1)', offset: 0 },
        { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(0.45)`, offset: 1 },
      ],
      { duration: FX_CARD_MS - 90, easing: 'cubic-bezier(0.4, 0, 0.2, 1)', fill: 'forwards' },
    );
    try {
      await Promise.race([anim.finished, wait(FX_CARD_MS, signal)]);
    } catch {
      /* skip */
    }
    if (signal.aborted) {
      card.remove();
      return;
    }
    thump();
    bumpCount(1);
    card.remove();
  };

  const removeOne = async (beat: FxBeat) => {
    const card = makeCard(beat, false);
    layer.append(card);
    const start = centerOf(deck);
    card.style.left = `${start.x}px`;
    card.style.top = `${start.y}px`;
    card.classList.add('is-show', 'is-pop');
    if (beat.tone === 'curse') card.classList.add('is-purge');
    await wait(Math.min(160, FX_CARD_MS * 0.4), signal);
    if (signal.aborted) {
      card.remove();
      return;
    }
    card.classList.add('is-break');
    await wait(FX_CARD_MS * 0.55, signal);
    bumpCount(-1);
    thump();
    card.remove();
  };

  const drawOneFx = async (beat: FxBeat) => {
    const card = makeCard(beat, true);
    layer.append(card);
    const start = centerOf(deck);
    const dest = centerOf(root.querySelector(`.stack--${beat.slug}`));
    card.style.left = `${start.x}px`;
    card.style.top = `${start.y}px`;
    card.classList.add('is-show', 'is-aura');
    bumpCount(-1);
    thump();
    const dx = dest.x - start.x;
    const dy = dest.y - start.y;
    const fly = card.animate(
      [
        { transform: 'translate(-50%, -50%) scale(0.7) rotateY(180deg)' },
        { transform: `translate(calc(-50% + ${dx * 0.55}px), calc(-50% + ${dy * 0.55}px)) scale(1) rotateY(180deg)` },
        { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(0.85) rotateY(0deg)` },
      ],
      { duration: FX_CARD_MS, easing: 'cubic-bezier(0.22, 0.8, 0.3, 1)', fill: 'forwards' },
    );
    await wait(FX_CARD_MS * 0.45, signal);
    card.classList.remove('is-back');
    try {
      await Promise.race([fly.finished, wait(FX_CARD_MS, signal)]);
    } catch {
      /* skip */
    }
    card.remove();
  };

    const jobs = beats.map((beat, i) =>
      wait(i * FX_STAGGER_MS, signal).then(() => run(beat)),
    );
    await Promise.all(jobs);
  } finally {
    layer.removeEventListener('click', skip);
    layer.removeEventListener('keydown', skip);
    if (fxGen === my) {
      hideFxLayer(layer);
      if (countEl) countEl.textContent = String(toCount);
      deck?.classList.remove('is-thump');
      if (playing === ac) playing = null;
    }
  }
}
