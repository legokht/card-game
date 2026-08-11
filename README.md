# card-game

덱빌딩 로그라이크. 현재 프로젝트 뼈대만 있는 상태이고, 게임 컨셉은 확정 대기 중이다.

## 스택

- TypeScript (strict) + Vite
- Vitest — 규칙 엔진은 DOM 없이 테스트 가능하도록 UI와 분리한다

## 실행

```bash
npm install
npm run dev        # 개발 서버
npm run typecheck  # 타입 검사
npm test           # 테스트
npm run build      # 프로덕션 빌드
```

## 구조

```
src/engine/   순수 게임 규칙 (DOM 의존 없음, 전부 테스트 대상)
src/data/     카드·적·유물 등 데이터 정의
src/ui/       렌더링과 입력 처리
tests/        Vitest 테스트
```

## 결정 사항

- **결정론적 RNG**: 같은 시드는 같은 런을 재현해야 한다. `Math.random`을 직접
  쓰지 않고 항상 `src/engine/rng.ts`의 `Rng`를 사용한다. 저장/복원을 위해
  내부 상태를 노출한다.
- **엔진과 UI 분리**: 전투 규칙은 순수 함수/데이터로 두고, 렌더링은 그 상태를
  읽기만 한다.
