// 서버가 켜질 때 한 번 실행돼요: 저장소(파일 또는 Supabase)를 불러온 뒤 요청을 받아요.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { initStore } = await import("./lib/store");
    await initStore();
  }
}
