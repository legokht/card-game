import './choice.css';
import { Rng } from './engine/rng';
import { choose, createGame, pickElement, pushDraw, pushStop, useSynergy } from './choice/engine';
import { render } from './choice/render';
import type { GameState } from './choice/types';

const root = document.querySelector<HTMLDivElement>('#app')!;

let rng: Rng;
let state: GameState;

function start(seed = String(Date.now())): void {
  rng = new Rng(seed);
  state = createGame(rng);
  draw();
}

function draw(): void {
  render(root, state, {
    onChoose: (side) => {
      choose(state, side, rng);
      draw();
    },
    onPushDraw: () => {
      pushDraw(state, rng);
      draw();
    },
    onPushStop: () => {
      pushStop(state, rng);
      draw();
    },
    onPickElement: (element) => {
      pickElement(state, element, rng);
      draw();
    },
    onUseSynergy: (target) => {
      useSynergy(state, target);
      draw();
    },
    onRestart: () => start(),
  });
}

start();
