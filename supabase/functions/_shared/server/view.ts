// 상태 화면(/state): 내 정보 + 지갑. 그룹·리포트 부분은 그룹 기능을 옮길 때 채워요.
import { normalizePrefs, normalizeTraits } from "../compat.ts";
import { env } from "../env.ts";
import type { User } from "../types.ts";
import type { Sql, Tx } from "./db.ts";
import { walletSummary } from "./wallet.ts";

export function livekitConfigured() {
  return Boolean(env("LIVEKIT_API_KEY") && env("LIVEKIT_API_SECRET") && env("LIVEKIT_URL"));
}

export async function viewState(q: Sql | Tx, user: User) {
  return {
    now: Date.now(),
    user: {
      id: user.id,
      code: user.code ?? "",
      status: user.status,
      profile: user.profile ?? null,
      analysis: user.analysis ?? null,
      matchTraits: user.matchTraits ? normalizeTraits(user.matchTraits) : null,
      partnerWants: user.partnerWants ?? null,
      availability: user.availability ?? [],
      prefs: user.prefs ? normalizePrefs(user.prefs) : null,
    },
    group: null,
    lastReportId: null as string | null,
    voice: { configured: livekitConfigured() },
    wallet: user.isDemo ? null : await walletSummary(q, user.id, user.groupId ?? null),
  };
}
