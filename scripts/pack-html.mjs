/**
 * 분리된 소스를 공유용 단일 HTML로 합친다.
 *
 *   npm run pack
 *
 * 결과: dist-artifact/index.html , dist-artifact/choice.html
 * (같은 내용. 예전에 쓰던 이름도 유지한다.)
 *
 * 인라인 시 `$&` 같은 치환 패턴이 스크립트를 깨지 않도록
 * vite.artifact.config.ts 에서 함수 치환을 쓴다.
 */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const r = spawnSync('npx', ['vite', 'build', '--config', 'vite.artifact.config.ts'], {
  cwd: root,
  stdio: 'inherit',
  shell: true,
});
process.exit(r.status ?? 1);
