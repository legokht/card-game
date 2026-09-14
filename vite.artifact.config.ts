import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';

/**
 * 아티팩트 배포용 단일 파일 빌드.
 * 페이지 하나만 넣고 코드 분할을 끄면 청크가 하나로 떨어져 인라인할 수 있다.
 * 어느 페이지를 말지는 ARTIFACT_PAGE 환경변수로 고른다.
 */
const page = process.env.ARTIFACT_PAGE ?? 'choice';

function inlineCssJs(): Plugin {
  return {
    name: 'inline-css-js',
    apply: 'build',
    enforce: 'post',
    generateBundle(_, bundle) {
      const scripts: string[] = [];
      const styles: string[] = [];
      let htmlName = '';
      let html = '';

      for (const [fileName, item] of Object.entries(bundle)) {
        if (item.type === 'chunk') {
          scripts.push(item.code);
          delete bundle[fileName];
        } else if (item.type === 'asset' && fileName.endsWith('.css')) {
          styles.push(String(item.source));
          delete bundle[fileName];
        } else if (item.type === 'asset' && fileName.endsWith('.html')) {
          htmlName = fileName;
          html = String(item.source);
        }
      }

      if (!htmlName) return;

      html = html
        .replace(/<link\b[^>]*rel="stylesheet"[^>]*>/gi, '')
        .replace(/<link\b[^>]*rel="modulepreload"[^>]*>/gi, '')
        .replace(/<script\b[^>]*\bsrc=("[^"]*"|'[^']*')[^>]*><\/script>/gi, '');

      const css = styles.join('\n').replace(/<\/style>/gi, '<\\/style>');
      const js = scripts.join('\n').replace(/<\/script>/gi, '<\\/script>');
      if (css) {
        html = html.includes('</head>')
          ? html.replace('</head>', () => `<style>${css}</style></head>`)
          : `<style>${css}</style>${html}`;
      }
      if (js) {
        html = html.includes('</body>')
          ? html.replace('</body>', () => `<script>${js}</script></body>`)
          : `${html}<script>${js}</script>`;
      }

      const asset = bundle[htmlName];
      if (asset && asset.type === 'asset') asset.source = html;
    },
    closeBundle() {
      const built = resolve(__dirname, `dist-artifact/${page}/${page}.html`);
      try {
        const html = readFileSync(built, 'utf8');
        const outDir = resolve(__dirname, 'dist-artifact');
        mkdirSync(outDir, { recursive: true });
        writeFileSync(resolve(outDir, `${page}.html`), html);
      } catch {
        /* build 산출물이 없으면 건너뛴다 */
      }
    },
  };
}

export default defineConfig({
  base: './',
  build: {
    outDir: `dist-artifact/${page}`,
    emptyOutDir: true,
    cssCodeSplit: false,
    assetsInlineLimit: 100000000,
    modulePreload: false,
    rollupOptions: {
      input: resolve(__dirname, `${page}.html`),
      output: {
        format: 'iife',
        name: 'ChoiceGame',
        inlineDynamicImports: true,
        manualChunks: undefined,
      },
    },
  },
  plugins: [inlineCssJs()],
});
