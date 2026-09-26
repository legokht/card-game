import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // GitHub Pages 주소는 /card-game/ 이다. 로컬 개발은 루트 그대로.
  base: process.env.GITHUB_ACTIONS ? '/card-game/' : '/',
  build: {
    rollupOptions: {
      // 전투 프로토타입을 걷어내면서 페이지가 하나만 남았다.
      input: { game: resolve(__dirname, 'index.html') },
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
