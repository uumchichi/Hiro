// 히로 API 라우터: /functions/v1/api/<경로> 로 들어온 요청을 처리해요.
import { authId } from "../_shared/server/auth.ts";
import { db } from "../_shared/server/db.ts";
import { CORS_HEADERS, HttpError, json, readJson } from "../_shared/server/http.ts";
import { ensureUser } from "../_shared/server/users.ts";
import type { User } from "../_shared/types.ts";
import { getState, postProfile, postQuiz } from "./routes/me.ts";
import { getLobby, postInviteRespond, postLobby } from "./routes/lobby.ts";
import { getWallet, postWallet } from "./routes/wallet.ts";

export interface Ctx {
  req: Request;
  url: URL;
  params: Record<string, string>;
  body: unknown;
  user: User;
}

type Handler = (ctx: Ctx) => Promise<unknown>;

// "GET /state", "POST /chat/:id" 처럼 적어요.
const ROUTES: [string, Handler][] = [
  ["GET /state", getState],
  ["POST /profile", postProfile],
  ["POST /quiz", postQuiz],
  ["GET /wallet", getWallet],
  ["POST /wallet", postWallet],
  ["GET /lobby", getLobby],
  ["POST /lobby", postLobby],
  ["POST /invites/respond", postInviteRespond],
];

const compiled = ROUTES.map(([spec, handler]) => {
  const [method, path] = spec.split(" ");
  const names: string[] = [];
  const re = new RegExp("^" + path.replace(/:(\w+)/g, (_, n) => (names.push(n), "([^/]+)")) + "/?$");
  return { method, re, names, handler };
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
      const user = await ensureUser(db(), await authId(req));
      return json(await r.handler({ req, url, params, body, user }));
    }
    return json({ error: "없는 주소예요." }, 404);
  } catch (err) {
    if (err instanceof HttpError) return json({ error: err.message, ...err.extra }, err.status);
    console.error("[api]", req.method, path, err);
    return json({ error: "서버에서 문제가 생겼어요. 잠시 후 다시 시도해 주세요." }, 500);
  }
}
