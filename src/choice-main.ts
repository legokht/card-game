import './choice.css';
import { Rng } from './engine/rng';
import { choose, createGame, pickElement, pushDraw, pushStop, resolveFate, useSynergy } from './choice/engine';
import { render } from './choice/render';
import { mountTutorial, tutorialUnseen } from './choice/tutorial';
import { playFate, skipFate } from './choice/fate';
import { beatFromPushLine, beatsFromChanges, playDeckFx, skipDeckFx } from './choice/fx';
import { hpBeatsFromChanges, playHpFx, skipHpFx, type HpSnap } from './choice/hp-fx';
import { ELEMENT_RULES } from './choice/balance';
import { PAIR_TABLE } from './choice/pairs';
import type { GameState } from './choice/types';

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
  void playHpFx(hpLayer, root, fromHp, snapHp(), hpBeats, state.dead);
  void playDeckFx(fxLayer, root, deckBeats, fromDeck, state.deck.length);
}

function start(seed = String(Date.now())): void {
  skipDeckFx();
  skipHpFx();
  skipFate(fateLayer);
  rng = new Rng(seed);
  state = createGame(rng);
  const want = new URLSearchParams(location.search).get('pair');
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
}

start();
if (tutorialUnseen()) tutorial.open();
