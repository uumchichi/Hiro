// Supabase Edge Function 'api' 진입점
import { handle } from "./router.ts";

// Supabase에서는 포트를 정하지 않고 그대로 실행해요. 내 컴퓨터에서 직접 띄울 때만 PORT를 줘요.
const port = Deno.env.get("PORT");
if (port) Deno.serve({ port: Number(port) }, handle);
else Deno.serve(handle);
