// 히로 API 라우터: /functions/v1/api/<경로> 로 들어온 요청을 처리해요.
import { env } from "../_shared/env.ts";
import { authId, requireAdmin } from "../_shared/server/auth.ts";
import { describeError } from "../_shared/server/diag.ts";
import { db } from "../_shared/server/db.ts";
import { CORS_HEADERS, HttpError, json, readJson } from "../_shared/server/http.ts";
import { ensureUser } from "../_shared/server/users.ts";
import type { User } from "../_shared/types.ts";
import { getState, postProfile, postQuiz } from "./routes/me.ts";
import {
  getOverview,
  postAdminLobby,
  postAdminSlot,
  postAdminWallet,
  getDiag,
  postCatalog,
  postEvent,
  postReset,
  postSeed,
  postTick,
} from "./routes/admin.ts";
import { getLobby, postInviteRespond, postLobby } from "./routes/lobby.ts";
import {
  getChat,
  getRecords,
  getReport,
  postChat,
  postNote,
  postReveal,
  postStraight,
  postUserReport,
  postVoiceToken,
} from "./routes/rotation.ts";
import { getSlots, postApply, postCheckin } from "./routes/slots.ts";
import { getWallet, postWallet } from "./routes/wallet.ts";

export interface Ctx {
  req: Request;
  url: URL;
  params: Record<string, string>;
  body: unknown;
  /** 로그인한 사용자. 운영자·예약 작업 주소에서는 없어요. */
  user: User;
}

type Access = "user" | "admin" | "cron";

type Handler = (ctx: Ctx) => Promise<unknown>;

// "GET /state", "POST /chat/:id" 처럼 적어요. 세 번째 값이 없으면 로그인한 사용자용이에요.
const ROUTES: [string, Handler, Access?][] = [
  ["GET /state", getState],
  ["POST /profile", postProfile],
  ["POST /quiz", postQuiz],
  ["GET /wallet", getWallet],
  ["POST /wallet", postWallet],
  ["GET /lobby", getLobby],
  ["POST /lobby", postLobby],
  ["POST /invites/respond", postInviteRespond],
  ["GET /slots", getSlots],
  ["POST /slots/apply", postApply],
  ["POST /slots/checkin", postCheckin],
  ["POST /notes", postNote],
  ["GET /report/:id", getReport],
  ["POST /report/:id/reveal", postReveal],
  ["POST /report/:id/straight", postStraight],
  ["GET /records", getRecords],
  ["GET /chat/:id", getChat],
  ["POST /chat/:id", postChat],
  ["POST /reports", postUserReport],
  ["POST /voice/token", postVoiceToken],
  ["GET /admin/overview", getOverview, "admin"],
  ["GET /admin/diag", getDiag, "admin"],
  ["POST /admin/seed", postSeed, "admin"],
  ["POST /admin/lobby", postAdminLobby, "admin"],
  ["POST /admin/slot", postAdminSlot, "admin"],
  ["POST /admin/event", postEvent, "admin"],
  ["POST /admin/wallet", postAdminWallet, "admin"],
  ["POST /admin/catalog", postCatalog, "admin"],
  ["POST /admin/reset", postReset, "admin"],
  ["POST /tick", postTick, "cron"],
];

const compiled = ROUTES.map(([spec, handler, access = "user"]) => {
  const [method, path] = spec.split(" ");
  const names: string[] = [];
  const re = new RegExp("^" + path.replace(/:(\w+)/g, (_, n) => (names.push(n), "([^/]+)")) + "/?$");
  return { method, re, names, handler, access };
});

/** /functions/v1/api/state → /state (로컬 실행 /api/state 도 같아요) */
function routePath(url: URL) {
  const m = url.pathname.match(/\/api(\/.*)?$/);
  return m ? m[1] || "/" : url.pathname;
}

export async function handle(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  const url = new URL(req.url);
  const path = routePath(url);
  try {
    if (req.method === "GET" && path === "/health") {
      await db()`select 1`;
      return json({ ok: true });
    }
    for (const r of compiled) {
      if (r.method !== req.method) continue;
      const m = path.match(r.re);
      if (!m) continue;
      const params = Object.fromEntries(r.names.map((n, i) => [n, decodeURIComponent(m[i + 1])]));
      const body = req.method === "POST" ? await readJson(req) : null;
      if (r.access === "admin") requireAdmin(req);
      const user = r.access === "user" ? await ensureUser(db(), await authId(req)) : (null as unknown as User);
      return json(await r.handler({ req, url, params, body, user }));
    }
    return json({ error: "없는 주소예요." }, 404);
  } catch (err) {
    if (err instanceof HttpError) return json({ error: err.message, ...err.extra }, err.status);
    console.error("[api]", req.method, path, err);
    const body: Record<string, unknown> = { error: "서버에서 문제가 생겼어요. 잠시 후 다시 시도해 주세요." };
    // 운영자 키가 함께 온 요청에만 오류의 정확한 이유를 알려줘요 (일반 사용자에게는 내부 정보를 숨겨요).
    const adminKey = env("HIRO_ADMIN_KEY");
    if (adminKey && req.headers.get("x-admin-key") === adminKey) body.detail = describeError(err);
    return json(body, 500);
  }
}
