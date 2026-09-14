import type { CardInstance } from './types';

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

function wait(ms: number, alive: () => boolean, skipped?: () => boolean): Promise<void> {
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
  return wait(FATE_SWAP_MS, alive).then(() => {
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
    btn.className = `fate-card fate-card--${slugOf(card)}`;
    btn.dataset.uid = card.uid;
    btn.innerHTML = `
      <span class="fate-card__inner">
        <span class="fate-card__face">${card.name}</span>
        <span class="fate-card__back" aria-hidden="true"></span>
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

  await wait(FATE_REVEAL_MS, alive, () => skipReveal || gaveUp);
  if (!alive()) {
    teardown();
    return null;
  }

  if (!gaveUp) {
    head.textContent = '섞는다';
    for (const el of els) el.classList.add('is-back');
    await wait(FATE_FLIP_MS, alive, () => gaveUp);
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
    await wait(FATE_SHOW_MS, alive);
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
    await wait(FATE_SHOW_MS, alive);
    teardown();
    return alive() ? result : null;
  }

  await wait(FATE_SHOW_MS, alive);
  teardown();
  return alive() ? { uids: chosen.slice(0, keep), gaveUp: false } : null;
}
