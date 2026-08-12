import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        // 전투 프로토타입과 선택 프로토타입은 서로 독립적인 페이지다.
        combat: resolve(__dirname, 'index.html'),
        choice: resolve(__dirname, 'choice.html'),
      },
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
