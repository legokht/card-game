import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
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
