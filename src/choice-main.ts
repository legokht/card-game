import './choice.css';
import { Rng } from './engine/rng';
import { choose, createGame } from './choice/engine';
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
    onRestart: () => start(),
  });
}

start();
