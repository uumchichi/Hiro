-- 히로 2단계: 서버 함수가 쓰는 보조 테이블·열

-- 주기 처리(초대장 만들기 등)의 마지막 실행 시각. 여러 서버 함수가 같은 간격을 지키도록 DB에 둬요.
create table if not exists ticks (
  key text primary key,
  at timestamptz not null
);
alter table ticks enable row level security;

-- 이벤트 세션: 그룹을 나누는 중일 때, 시작 시간에 대기실에 있던 사람
alter table slots add column if not exists forming_ids text[];
