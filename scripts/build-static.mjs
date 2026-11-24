// GitHub Pages용 정적 사이트를 out/ 에 만들어요.
// 정적 사이트에는 서버가 없어서, 서버 전용 파일(API, 쿠키 미들웨어, 저장소 시작 코드)을 빌드하는 동안만 치워 둬요.
// 끝나면(실패해도) 원래 자리로 되돌려요.
import { existsSync, mkdirSync, renameSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";

const moves = [
  ["src/app/api", ".static-build/api"],
  ["src/middleware.ts", ".static-build/middleware.ts"],
  ["src/instrumentation.ts", ".static-build/instrumentation.ts"],
];

for (const need of ["NEXT_PUBLIC_API_BASE", "NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"]) {
  if (!process.env[need]) {
    console.error(`${need} 가 비어 있어요. GitHub 저장소의 Variables에 넣어 주세요.`);
    process.exit(1);
  }
}

mkdirSync(".static-build", { recursive: true });
const moved = [];
let code = 1;
try {
  for (const [from, to] of moves) {
    if (existsSync(from)) {
      renameSync(from, to);
      moved.push([from, to]);
    }
  }
  rmSync(".next", { recursive: true, force: true });
  const r = spawnSync("npx", ["next", "build"], { stdio: "inherit", env: { ...process.env, HIRO_STATIC: "1" } });
  code = r.status ?? 1;
} finally {
  for (const [from, to] of moved.reverse()) renameSync(to, from);
  rmSync(".static-build", { recursive: true, force: true });
}
process.exit(code);
