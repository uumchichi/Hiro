import { NextResponse, type NextRequest } from "next/server";

// 첫 방문 때 사용자 쿠키를 한 번만 정해요.
// 페이지가 여러 요청을 동시에 보내도(첫 컴파일이 느리거나 네트워크가 느릴 때) 모두 같은 사용자로 처리되게 하려고요.
// (예전에는 쿠키가 없는 요청마다 사용자를 새로 만들어서, 프로필 저장과 상태 조회가 서로 다른 사용자가 될 수 있었어요.)
const COOKIE = "hiro_uid";

export function middleware(req: NextRequest) {
  if (req.cookies.get(COOKIE)?.value) return NextResponse.next();
  const id = "u_" + crypto.randomUUID().replace(/-/g, "").slice(0, 12);
  // 이번 요청에서도 바로 쓰이도록 요청 쿠키에 넣고, 응답으로 브라우저에 저장해요.
  const headers = new Headers(req.headers);
  headers.set("cookie", [req.headers.get("cookie"), `${COOKIE}=${id}`].filter(Boolean).join("; "));
  const res = NextResponse.next({ request: { headers } });
  res.cookies.set(COOKIE, id, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 30 });
  return res;
}

export const config = {
  // 정적 파일은 빼고, 페이지와 API 모두
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
