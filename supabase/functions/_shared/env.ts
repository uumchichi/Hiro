// Node(Next.js)와 Deno(Supabase Edge Functions) 양쪽에서 환경 변수를 읽어요.
export function env(key: string): string | undefined {
  const g = globalThis as unknown as {
    Deno?: { env: { get(k: string): string | undefined } };
    process?: { env: Record<string, string | undefined> };
  };
  try {
    if (g.Deno) return g.Deno.env.get(key);
  } catch {
    // 권한이 없으면 무시
  }
  return g.process?.env?.[key];
}
