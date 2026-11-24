// Supabase Edge Function 'api' 진입점
import { handle } from "./router.ts";

Deno.serve(handle);
