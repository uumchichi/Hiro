import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
      // 서버 함수 전용(Deno) 코드는 deno lint로 검사해요. _shared의 공용 로직은 여기서도 검사해요.
      "supabase/functions/api/**",
      "supabase/functions/_shared/server/**",
      "supabase/functions/tests/**",
    ],
  },
];

export default eslintConfig;
