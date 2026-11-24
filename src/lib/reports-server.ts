// 서버 전용: 신고 접수 (화면 컴포넌트는 reports.ts의 사유 목록만 써요)
import "./store"; // Next 앱의 저장소를 연결해요
export * from "../../supabase/functions/_shared/reports.ts";
