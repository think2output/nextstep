import { loadEnv } from 'vite'
import { defineConfig } from 'vitest/config'

// DB 테스트는 실제 Supabase 프로젝트(.env.local)에 대고 실행한다.
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    env: loadEnv('', process.cwd(), ''),
    testTimeout: 30_000,
    hookTimeout: 60_000,
    // 같은 프로젝트를 공유하므로 파일 간 병렬 실행을 막는다 (익명 로그인 시도 제한)
    fileParallelism: false,
  },
})
