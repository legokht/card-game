const SEEN_KEY = 'card-game.tutorial-seen';

interface Step {
  sel: string;
  fallback?: string;
  lines: string[];
}

const STEPS: Step[] = [
  {
    sel: '.escape',
    lines: ['탈출구 파편 3개를 필드에 모으면 탈출한다. 그것이 목표다.'],
  },
  {
    sel: '.picks',
    fallback: '.stage',
    lines: [
      '매번 두 개의 선택지가 주어진다. 반드시 하나를 골라야 한다.',
      '선택지 중에는 파편을 주는 것도 있다.',
    ],
  },
  {
    sel: '.deck',
    lines: [
      '당신의 덱이다. 선택에 따라 카드가 들어오고 나간다.',
      '얻은 파편도 일단 이 덱 안으로 들어간다.',
    ],
  },
  {
    sel: '.field',
    lines: [
      '덱에서 꺼낸 카드가 놓이는 곳이다.',
      '덱에 있는 파편을 여기로 꺼내야 한다. 3장을 꺼내면 탈출이다.',
    ],
  },
  {
    sel: '.field__curses',
    fallback: '.field',
    lines: [
      '덱에는 저주가 섞여 있다. 필드에 쌓이면 터진다.',
      '각 저주 위에 마우스를 올리면 효과를 볼 수 있다.',
    ],
  },
  {
    sel: '.field__elements',
    fallback: '.field',
    lines: ['같은 속성 5장을 모으면 힘을 쓸 수 있다.'],
  },
];

export function tutorialUnseen(): boolean {
  try {
    return localStorage.getItem(SEEN_KEY) !== '1';
  } catch {
    return true;
  }
}

function markSeen(): void {
  try {
    localStorage.setItem(SEEN_KEY, '1');
  } catch {
    /* 저장이 막혀도 이번 세션에서는 닫힌다 */
  }
}

function targetOf(step: Step): HTMLElement | null {
  const root = document.querySelector('#app');
  if (!root) return null;
  return (
    root.querySelector<HTMLElement>(step.sel) ??
    (step.fallback ? root.querySelector<HTMLElement>(step.fallback) : null)
  );
}

function padRect(r: DOMRect, pad: number): DOMRect {
  const x = Math.max(8, r.left - pad);
  const y = Math.max(8, r.top - pad);
  const right = Math.min(window.innerWidth - 8, r.right + pad);
  const bottom = Math.min(window.innerHeight - 8, r.bottom + pad);
  return new DOMRect(x, y, Math.max(24, right - x), Math.max(24, bottom - y));
}

function overlapArea(a: DOMRect, b: DOMRect): number {
  const x = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
  const y = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
  return x * y;
}

function placeTip(hole: DOMRect, tip: HTMLElement): void {
  const gap = 16;
  const tw = tip.offsetWidth;
  const th = tip.offsetHeight;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

  const candidates = [
    { left: hole.left + hole.width / 2 - tw / 2, top: hole.bottom + gap },
    { left: hole.left + hole.width / 2 - tw / 2, top: hole.top - th - gap },
    { left: hole.right + gap, top: hole.top + hole.height / 2 - th / 2 },
    { left: hole.left - tw - gap, top: hole.top + hole.height / 2 - th / 2 },
    { left: hole.left, top: hole.bottom + gap },
    { left: 16, top: vh - th - 16 },
  ];

  let best = candidates[0]!;
  let bestScore = Number.POSITIVE_INFINITY;
  for (const c of candidates) {
    const left = clamp(c.left, 12, Math.max(12, vw - tw - 12));
    const top = clamp(c.top, 12, Math.max(12, vh - th - 12));
    const box = new DOMRect(left, top, tw, th);
    const overlap = overlapArea(box, hole);
    const score = overlap * 8 + Math.abs(left - c.left) + Math.abs(top - c.top);
    if (score < bestScore) {
      bestScore = score;
      best = { left, top };
    }
  }

  tip.style.left = `${best.left}px`;
  tip.style.top = `${best.top}px`;
}

export function mountTutorial(host: HTMLElement): { open: () => void } {
  let page = 0;

  function close(): void {
    markSeen();
    window.removeEventListener('resize', layout);
    host.hidden = true;
    host.replaceChildren();
  }

  function layout(): void {
    const step = STEPS[page];
    if (!step) return;
    const el = targetOf(step);
    const hole = padRect(el?.getBoundingClientRect() ?? new DOMRect(40, 40, 200, 80), 8);
    const cut = host.querySelector<SVGRectElement>('.tut__cut');
    const ring = host.querySelector<HTMLElement>('.tut__ring');
    const shade = host.querySelector<SVGRectElement>('.tut__shade');
    const svg = host.querySelector<SVGSVGElement>('.tut__mask');
    const tip = host.querySelector<HTMLElement>('.tut__tip');
    const w = window.innerWidth;
    const h = window.innerHeight;
    if (svg) {
      svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
      svg.setAttribute('width', String(w));
      svg.setAttribute('height', String(h));
    }
    if (shade) {
      shade.setAttribute('width', String(w));
      shade.setAttribute('height', String(h));
    }
    const cover = host.querySelector<SVGRectElement>('.tut__cover');
    if (cover) {
      cover.setAttribute('width', String(w));
      cover.setAttribute('height', String(h));
    }
    if (cut) {
      cut.setAttribute('x', String(hole.x));
      cut.setAttribute('y', String(hole.y));
      cut.setAttribute('width', String(hole.width));
      cut.setAttribute('height', String(hole.height));
    }
    if (ring) {
      ring.style.left = `${hole.x}px`;
      ring.style.top = `${hole.y}px`;
      ring.style.width = `${hole.width}px`;
      ring.style.height = `${hole.height}px`;
    }
    if (tip) placeTip(hole, tip);
  }

  function paint(): void {
    const step = STEPS[page]!;
    const last = page >= STEPS.length - 1;
    const lines = step.lines.map((line) => `<p class="tut__line">${line}</p>`).join('');
    host.hidden = false;
    host.innerHTML = `
      <svg class="tut__mask" aria-hidden="true">
        <defs>
          <mask id="tut-cut" maskUnits="userSpaceOnUse">
            <rect class="tut__cover" x="0" y="0" fill="white"></rect>
            <rect class="tut__cut" fill="black" rx="8" ry="8"></rect>
          </mask>
        </defs>
        <rect class="tut__shade" x="0" y="0" fill="rgba(8,6,4,0.78)" mask="url(#tut-cut)"></rect>
      </svg>
      <div class="tut__ring" aria-hidden="true"></div>
      <div class="tut__tip" role="dialog" aria-modal="true" aria-labelledby="tut-page">
        <p class="tut__meter" id="tut-page">${page + 1}/${STEPS.length}</p>
        ${lines}
        <div class="tut__foot">
          <button class="tut__skip" type="button">건너뛰기</button>
          <button class="tut__go" type="button">다음</button>
        </div>
      </div>`;

    host.querySelector('.tut__skip')?.addEventListener('click', close);
    host.querySelector('.tut__go')?.addEventListener('click', () => {
      if (last) close();
      else {
        page += 1;
        paint();
      }
    });
    requestAnimationFrame(() => {
      layout();
      requestAnimationFrame(layout);
    });
  }

  return {
    open: () => {
      page = 0;
      window.removeEventListener('resize', layout);
      window.addEventListener('resize', layout);
      paint();
    },
  };
}
