import { resolve } from 'node:path';
import { defineConfig } from 'vite';

/**
 * 아티팩트 배포용 단일 파일 빌드.
 * 페이지 하나만 넣고 코드 분할을 끄면 청크가 하나로 떨어져 인라인할 수 있다.
 * 어느 페이지를 말지는 ARTIFACT_PAGE 환경변수로 고른다.
 */
const page = process.env.ARTIFACT_PAGE ?? 'choice';

export default defineConfig({
  build: {
    outDir: `dist-artifact/${page}`,
    emptyOutDir: true,
    rollupOptions: {
      input: resolve(__dirname, `${page}.html`),
      output: { manualChunks: undefined, inlineDynamicImports: true },
    },
  },
});
