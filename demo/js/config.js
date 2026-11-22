// 실시간 연결 설정 (README 2-8)
// 비워 두면 같은 브라우저(탭·iframe)끼리만 연결돼요. 휴대폰 ↔ 노트북 연결은 Supabase 값이 필요해요.
// publishable(anon) 키는 브라우저에 공개되는 용도의 키예요. secret/service_role 키는 절대 넣지 마세요.
export const SUPABASE_URL = ''; // 공개 저장소에서는 비움 → 같은 브라우저 통로(BroadcastChannel)로만 동작
export const SUPABASE_ANON_KEY = '';
