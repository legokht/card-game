/** 뽑기·셔플·필드·덱이 같이 쓰는 카드 그림. CSS와 인라인 SVG만 쓴다. */

const LABEL: Record<string, string> = {
  fire: '불',
  water: '물',
  dark: '어둠',
  light: '빛',
  doom: '파멸',
  rot: '부패',
  erode: '침식',
  shard: '파편',
};

function glyph(inner: string): string {
  return `<svg class="card-glyph" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${inner}</svg>`;
}

const BACK = `<svg class="card-glyph card-glyph--back" viewBox="0 0 64 88" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <rect x="6" y="6" width="52" height="76" rx="3" fill="none" stroke="#7a6240" stroke-width="1.1"/>
  <rect x="10" y="10" width="44" height="68" rx="2" fill="none" stroke="#c4a35a" stroke-width="0.7" opacity="0.55"/>
  <path d="M32 16 L48 32 L32 48 L16 32 Z" fill="none" stroke="#8a7048" stroke-width="1"/>
  <path d="M32 20 L44 32 L32 44 L20 32 Z" fill="#1a100c" stroke="#c4a35a" stroke-width="0.9"/>
  <ellipse cx="32" cy="32" rx="7" ry="4.2" fill="none" stroke="#e0c278" stroke-width="1.1"/>
  <circle cx="32" cy="32" r="2.1" fill="#e0c278"/>
  <path d="M26 32 h-4 M40 32 h4 M32 27.2 v-3.2 M32 36.8 v3.2" stroke="#8a7048" stroke-width="0.8"/>
  <path d="M18 58 h28 M22 62 h20" stroke="#6a5438" stroke-width="0.7" opacity="0.7"/>
  <circle cx="18" cy="18" r="1.2" fill="none" stroke="#8a7048" stroke-width="0.7"/>
  <circle cx="46" cy="18" r="1.2" fill="none" stroke="#8a7048" stroke-width="0.7"/>
  <circle cx="18" cy="70" r="1.2" fill="none" stroke="#8a7048" stroke-width="0.7"/>
  <circle cx="46" cy="70" r="1.2" fill="none" stroke="#8a7048" stroke-width="0.7"/>
</svg>`;

const FACES: Record<string, string> = {
  fire: glyph(`
    <path fill="currentColor" d="M33 4c-2 12-12 16-14 28-1 8 4 18 15 18 12 0 18-9 16-20-7 6-10 2-8-8 1-8-5-14-9-18z"/>
    <path fill="currentColor" opacity="0.45" d="M31 22c-1 8-6 12-5 20 6 1 11-4 11-12-3 3-5 0-4-6z"/>
    <circle cx="20" cy="48" r="1.3" fill="currentColor" opacity="0.65"/>
    <circle cx="46" cy="44" r="1" fill="currentColor" opacity="0.5"/>
  `),
  water: glyph(`
    <path fill="currentColor" d="M32 8c0 0 16 20 16 30 0 9-7 16-16 16s-16-7-16-16c0-10 16-30 16-30z"/>
    <path fill="#0b2430" opacity="0.35" d="M32 20c6 8 8 14 8 18 0 5-4 9-8 9 2-4 3-10 0-27z"/>
    <path fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" d="M14 56c6-4 10-4 16 0s12 4 20 0"/>
    <path fill="none" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" opacity="0.6" d="M16 50c5-3 9-3 15 1"/>
  `),
  dark: glyph(`
    <path fill="currentColor" d="M42 14a16 16 0 1 0 0 32 13 13 0 1 1 6-24 16 16 0 0 1-6-8z"/>
    <circle cx="18" cy="14" r="1.1" fill="currentColor" opacity="0.8"/>
    <circle cx="50" cy="18" r="0.8" fill="currentColor" opacity="0.55"/>
    <circle cx="12" cy="36" r="0.7" fill="currentColor" opacity="0.5"/>
    <circle cx="48" cy="48" r="1" fill="currentColor" opacity="0.4"/>
    <path fill="currentColor" opacity="0.75" d="M32 50 l1.6 4.2 h4.4 l-3.6 2.6 1.4 4.2L32 58.6 28.2 61l1.4-4.2-3.6-2.6h4.4z"/>
  `),
  light: glyph(`
    <circle cx="32" cy="32" r="9" fill="currentColor"/>
    <path fill="currentColor" d="M32 6l2.2 12h-4.4zm0 40l2.2 12h-4.4zM6 32l12 2.2v-4.4zm40 0l12 2.2v-4.4z"/>
    <path fill="currentColor" opacity="0.85" d="M14 14l9 7-2.2 2.2-7-9zm36 0l-9 7 2.2 2.2 7-9zM14 50l9-7-2.2-2.2-7 9zm36 0l-9-7 2.2-2.2 7 9z"/>
    <circle cx="32" cy="32" r="4" fill="#fff6d0" opacity="0.55"/>
  `),
  doom: glyph(`
    <path fill="currentColor" d="M32 2 L62 58 H2 Z"/>
    <path fill="#140000" d="M32 14 L52 54 H12 Z"/>
    <path fill="currentColor" d="M20 30 L26 54 H16 Z M31 22 L35 54 H27 Z M44 30 L48 54 H38 Z"/>
    <path fill="none" stroke="#ffd8d0" stroke-width="1.3" opacity="0.75" d="M32 8 L54 56 M32 8 L10 56"/>
    <circle cx="32" cy="40" r="3.4" fill="#ffd8d0"/>
  `),
  rot: glyph(`
    <path fill="currentColor" d="M22 20c8-12 20-8 22 0 8-4 18 2 16 14 2 10-4 18-14 20-8 4-18 2-24-6-8-6-8-16 0-28z"/>
    <ellipse cx="28" cy="30" rx="4" ry="3" fill="#1a1208" opacity="0.55"/>
    <ellipse cx="40" cy="36" rx="3.2" ry="2.4" fill="#1a1208" opacity="0.45"/>
    <ellipse cx="32" cy="44" rx="2.4" ry="1.8" fill="#1a1208" opacity="0.4"/>
    <path fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" d="M24 48 q2 10 3 14 M34 50 q1 8 0 14 M44 46 q-1 10 2 14"/>
  `),
  erode: glyph(`
    <rect x="14" y="14" width="36" height="36" rx="3" fill="currentColor"/>
    <path fill="#1a1018" d="M20 18 l10 8-4 10 12-6 8 12-16 4-6 10H16 V22z"/>
    <path fill="none" stroke="#1a1018" stroke-width="1.6" d="M18 40 l8-6 6 10 10-14 8 6"/>
    <path fill="none" stroke="currentColor" stroke-width="1.2" opacity="0.8" d="M10 28 h6 M48 22 h6 M28 10 v6 M40 48 v6"/>
  `),
  shard: glyph(`
    <path fill="currentColor" d="M32 6 L48 28 L32 58 L16 28 Z"/>
    <path fill="#fff4c0" opacity="0.55" d="M32 10 L40 28 L32 34 L24 28 Z"/>
    <path fill="#7a5410" opacity="0.45" d="M32 34 L48 28 L32 58 Z"/>
    <path fill="none" stroke="#fff8d8" stroke-width="1.1" d="M32 6 L32 58"/>
    <circle cx="14" cy="18" r="1.2" fill="currentColor"/>
    <circle cx="50" cy="22" r="0.9" fill="currentColor"/>
    <circle cx="52" cy="40" r="1.1" fill="currentColor"/>
    <path fill="currentColor" opacity="0.9" d="M32 2 l1.2 3.2 3.4.2-2.6 2.2.8 3.4L32 9.2 29.2 11l.8-3.4-2.6-2.2 3.4-.2z"/>
  `),
};

export function cardBackHtml(): string {
  return BACK;
}

export function cardFaceHtml(slug: string, name: string): string {
  const label = LABEL[slug] ?? name;
  const art = FACES[slug] ?? '';
  return `<span class="card-glyph-wrap">${art}</span><span class="card-label">${label}</span>`;
}

/** 앞면 껍질. 필드·연출이 같은 클래스를 쓴다. */
export function playingCardFrontClass(slug: string): string {
  return `playing-card playing-card--${slug}`;
}

/** 뒷면 껍질. 덱 더미·연출이 같은 클래스를 쓴다. */
export function playingCardBackClass(): string {
  return 'playing-card playing-card--back';
}
