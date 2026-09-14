import { MAX_HP } from './balance';
import { skipDeckFx } from './fx';

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

let playing: AbortController | null = null;
let gen = 0;

function hideLayer(layer: HTMLElement): void {
  layer.className = '';
  layer.replaceChildren();
  layer.hidden = true;
}

export function skipHpFx(): void {
  playing?.abort();
  playing = null;
  gen += 1;
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
  playing?.abort();
  if (!dead && beats.length === 0 && from.hp === to.hp && from.maxHp === to.maxHp) return;

  const my = ++gen;
  const ac = new AbortController();
  playing = ac;
  const { signal } = ac;

  const skip = () => {
    ac.abort();
    skipDeckFx();
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
      if (signal.aborted || gen !== my) return;
      spawnPop(popHost, beat);
    }, i * 70);
  });

  try {
    await wait(HP_FX_MS, signal);
  } finally {
    layer.removeEventListener('click', skip);
    layer.removeEventListener('keydown', skip);
    if (gen === my) {
      hideLayer(layer);
      app.classList.remove('is-hp-shake');
      bar?.classList.remove('is-seal', 'is-grow', 'is-mend');
      if (!dead) app.classList.remove('is-hp-dead');
      if (playing === ac) playing = null;
    }
  }
}
