-- 히로 (Hiro) 1단계: 테이블과 입장권·지갑 함수
-- 모든 테이블은 RLS(행 단위 보안)를 켜고 공개 정책을 두지 않아요.
-- → 브라우저(anon 키)로는 읽고 쓸 수 없고, 서버 함수(service_role)만 접근해요.

-- ───────────── 사용자 ─────────────
create table if not exists users (
  id text primary key,                         -- 예: u_1a2b3c4d5e6f
  auth_id uuid unique,                         -- Supabase 로그인과 연결 (익명 로그인 등)
  code text unique not null,                   -- 공개 ID 5글자 (신고용)
  created_at timestamptz not null default now(),
  is_demo boolean not null default false,
  status text not null default 'new' check (status in ('new', 'profiled', 'analyzed', 'grouped')),
  profile jsonb,
  match_traits jsonb,                          -- 머리 길이, 히로 컬러(tg), 공개 여부, 문담피
  prefs jsonb,                                 -- 원하는 상대 조건
  answers jsonb,
  partner_wants jsonb,
  availability text[] not null default '{}',
  analysis jsonb,
  group_id text
);

-- ───────────── 도키 지갑 ─────────────
create table if not exists wallets (
  user_id text primary key references users (id) on delete cascade,
  free_doki int not null default 0 check (free_doki >= 0),
  paid_doki int not null default 0 check (paid_doki >= 0),
  tickets int not null default 0 check (tickets >= 0),
  badges int not null default 0 check (badges >= 0),
  auto_exchange boolean not null default true
);

-- 예치(맡아 둔) 아이템: 아직 차감 전. ref 예: group:g_abc:u_xyz (그룹 g_abc에서 u_xyz와의 대화 몫)
create table if not exists wallet_holds (
  user_id text not null references users (id) on delete cascade,
  ref text not null,
  item text not null check (item in ('ticket', 'badge')),
  at timestamptz not null default now(),
  primary key (user_id, ref)
);

create table if not exists ledger (
  id bigserial primary key,
  user_id text not null references users (id) on delete cascade,
  at timestamptz not null default now(),
  kind text not null check (kind in ('starter', 'grant', 'charge', 'exchange', 'hold', 'use', 'release')),
  item text not null check (item in ('doki', 'ticket', 'badge')),
  amount int not null,
  note text not null default '',
  ref text
);
create index if not exists ledger_user_at on ledger (user_id, at desc);

-- ───────────── 대기실 · 초대장 ─────────────
create table if not exists lobby (
  user_id text primary key references users (id) on delete cascade,
  joined_at timestamptz not null default now(),
  last_seen timestamptz,
  interests text[] not null default '{}',
  priority int not null default 0,
  note text
);

create table if not exists invites (
  id text primary key,
  kind text not null check (kind in ('now', 'scheduled')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  starts_at timestamptz,
  theme jsonb not null,
  invitees text[] not null,
  accepted text[] not null default '{}',
  declined text[] not null default '{}',
  status text not null default 'open' check (status in ('open', 'started', 'confirmed', 'expired')),
  group_id text,
  slot_id text,
  source text not null default 'rule',
  demo_plan jsonb
);
create index if not exists invites_open on invites (status) where status = 'open';

-- ───────────── 이벤트 세션 ─────────────
create table if not exists slots (
  id text primary key,
  created_at timestamptz not null default now(),
  theme jsonb not null,
  starts_at timestamptz not null,
  status text not null default 'open' check (status in ('open', 'forming', 'started', 'cancelled')),
  group_ids text[] not null default '{}',
  missed text[] not null default '{}',
  note text,
  round_seconds int,
  invite_only boolean not null default false,
  curated boolean not null default false,
  capacity int
);

create table if not exists slot_applicants (
  slot_id text not null references slots (id) on delete cascade,
  user_id text not null references users (id) on delete cascade,
  applied_at timestamptz not null default now(),
  checkin_at timestamptz,
  primary key (slot_id, user_id)
);

create table if not exists theme_catalog (
  id int primary key default 1 check (id = 1),
  created_at timestamptz not null default now(),
  source text not null,
  note text not null default '',
  themes jsonb not null,
  cursor int not null default 0
);

-- ───────────── 로테이션 그룹 ─────────────
create table if not exists groups (
  id text primary key,
  created_at timestamptz not null default now(),
  theme jsonb not null,
  member_ids text[] not null,
  reason text not null default '',
  icebreakers text[] not null default '{}',
  status text not null default 'live' check (status in ('ready', 'live', 'done')),
  rounds jsonb not null,                       -- [{pairs:[{a,b}], resting:[...]}]
  round_seconds int not null,
  break_seconds int not null,
  started_at timestamptz,
  finished_at timestamptz
);

-- 라운드별 대화방 접속 기록 (입장권 차감 기준)
create table if not exists presence (
  group_id text not null references groups (id) on delete cascade,
  round int not null,
  user_id text not null,
  first_at timestamptz not null default now(),
  last_at timestamptz not null default now(),
  primary key (group_id, round, user_id)
);

create table if not exists letters (
  group_id text not null references groups (id) on delete cascade,
  from_id text not null,
  to_id text not null,
  text text not null check (char_length(text) <= 300),
  primary key (group_id, from_id, to_id)
);

create table if not exists memos (
  group_id text not null references groups (id) on delete cascade,
  from_id text not null,
  to_id text not null,
  text text not null check (char_length(text) <= 500),
  primary key (group_id, from_id, to_id)
);

-- 쪽지의 주인 찾기: 한 사람당 한 번 (primary key가 보장)
create table if not exists reveals (
  group_id text not null references groups (id) on delete cascade,
  user_id text not null,
  from_id text not null,
  primary key (group_id, user_id)
);

-- 직진하기: 로테이션마다 한 번 (primary key가 보장)
create table if not exists straights (
  group_id text not null references groups (id) on delete cascade,
  from_id text not null,
  to_id text not null,
  message text not null default '',
  at timestamptz not null default now(),
  expires_at timestamptz not null,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'expired')),
  chat_id text,
  demo_reply jsonb,
  primary key (group_id, from_id)
);

-- ───────────── 24시간 채팅 ─────────────
create table if not exists chats (
  id text primary key,
  group_id text not null,
  members text[] not null check (cardinality(members) = 2),
  origin text not null default 'mutual' check (origin in ('mutual', 'straight')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create table if not exists chat_messages (
  id text primary key,
  chat_id text not null references chats (id) on delete cascade,
  from_id text not null,
  text text not null check (char_length(text) <= 1000),
  at timestamptz not null default now()
);
create index if not exists chat_messages_chat_at on chat_messages (chat_id, at);

-- ───────────── 신고 ─────────────
create table if not exists reports (
  id text primary key,
  at timestamptz not null default now(),
  reporter_id text not null,
  target_code text not null,
  target_id text,
  reason text not null,
  detail text not null default '',
  context text not null default '',
  status text not null default 'new' check (status in ('new', 'reviewed'))
);

-- ───────────── 보안: 모든 테이블 RLS 켜기 (공개 정책 없음) ─────────────
do $$
declare t text;
begin
  foreach t in array array['users', 'wallets', 'wallet_holds', 'ledger', 'lobby', 'invites', 'slots', 'slot_applicants',
    'theme_catalog', 'groups', 'presence', 'letters', 'memos', 'reveals', 'straights', 'chats', 'chat_messages', 'reports']
  loop
    execute format('alter table %I enable row level security', t);
  end loop;
end $$;

-- ═════════════ 지갑 함수 ═════════════
-- 모두 한 트랜잭션 안에서 지갑 행을 잠그고(FOR UPDATE) 처리해서, 동시에 요청이 와도 어긋나지 않아요.

create or replace function wallet_log(p_user text, p_kind text, p_item text, p_amount int, p_note text, p_ref text default null)
returns void language sql as $$
  insert into ledger (user_id, kind, item, amount, note, ref) values (p_user, p_kind, p_item, p_amount, p_note, p_ref);
$$;

-- 지갑이 없으면 만들고 가입 선물을 줘요. 데모 참가자는 지갑을 쓰지 않아요.
create or replace function wallet_ensure(p_user text, p_starter_tickets int, p_starter_badges int)
returns boolean language plpgsql as $$
begin
  if (select is_demo from users where id = p_user) then return false; end if;
  insert into wallets (user_id, tickets, badges) values (p_user, p_starter_tickets, p_starter_badges)
  on conflict (user_id) do nothing;
  if found then
    if p_starter_tickets > 0 then perform wallet_log(p_user, 'starter', 'ticket', p_starter_tickets, '가입 선물'); end if;
    if p_starter_badges > 0 then perform wallet_log(p_user, 'starter', 'badge', p_starter_badges, '가입 선물'); end if;
  end if;
  return true;
end $$;

-- 지금 쓸 수 있는 개수 (예치한 것 제외)
create or replace function wallet_available(p_user text, p_item text)
returns int language sql stable as $$
  select (case when p_item = 'ticket' then w.tickets else w.badges end)
         - (select count(*) from wallet_holds h where h.user_id = p_user and h.item = p_item)::int
  from wallets w where w.user_id = p_user;
$$;

-- 도키 쓰기 (무료 도키부터). 잠근 지갑 행 안에서만 호출하세요.
create or replace function wallet_spend_doki(p_user text, p_item text, p_count int, p_cost int, p_note text)
returns boolean language plpgsql as $$
declare w wallets;
declare from_free int;
declare item_name text := case when p_item = 'ticket' then '입장권' else '직진러의 증표' end;
begin
  select * into w from wallets where user_id = p_user for update;
  if w.free_doki + w.paid_doki < p_cost then return false; end if;
  from_free := least(w.free_doki, p_cost);
  update wallets set
    free_doki = free_doki - from_free,
    paid_doki = paid_doki - (p_cost - from_free),
    tickets = tickets + case when p_item = 'ticket' then p_count else 0 end,
    badges = badges + case when p_item = 'badge' then p_count else 0 end
  where user_id = p_user;
  perform wallet_log(p_user, 'exchange', 'doki', -p_cost, format('%s %s개로 바꿈%s', item_name, p_count, p_note));
  perform wallet_log(p_user, 'exchange', p_item, p_count, format('%s도키로 바꿈%s', p_cost, p_note));
  return true;
end $$;

-- 미리 바꾸기 (정해진 묶음 가격은 서버가 정해서 넘겨요)
create or replace function wallet_exchange(p_user text, p_item text, p_count int, p_cost int)
returns text language plpgsql as $$
begin
  perform 1 from wallets where user_id = p_user for update;
  if not found then return '지갑을 쓸 수 없어요.'; end if;
  if not wallet_spend_doki(p_user, p_item, p_count, p_cost, '') then
    return format('도키가 모자라요. (%s도키 필요)', p_cost);
  end if;
  return null;
end $$;

-- 여러 개를 한꺼번에 예치 (전부 아니면 전무). 모자란 만큼은 자동 교환으로 한 번에 바꿔요.
create or replace function wallet_hold_many(p_user text, p_item text, p_refs text[], p_note text, p_unit_price int)
returns boolean language plpgsql as $$
declare w wallets;
declare todo text[];
declare short int;
begin
  if (select is_demo from users where id = p_user) then return true; end if;
  select * into w from wallets where user_id = p_user for update;
  if not found then return false; end if;
  select coalesce(array_agg(r), '{}') into todo
  from unnest(p_refs) r where not exists (select 1 from wallet_holds h where h.user_id = p_user and h.ref = r);
  if cardinality(todo) = 0 then return true; end if;
  short := cardinality(todo) - wallet_available(p_user, p_item);
  if short > 0 then
    if not w.auto_exchange then return false; end if;
    if not wallet_spend_doki(p_user, p_item, short, short * p_unit_price, ' (자동 교환)') then return false; end if;
  end if;
  insert into wallet_holds (user_id, ref, item) select p_user, r, p_item from unnest(todo) r;
  perform wallet_log(p_user, 'hold', p_item, 0, format('%s (%s개)', p_note, cardinality(todo)));
  return true;
end $$;

-- 예치한 아이템을 실제로 써요.
create or replace function wallet_consume(p_user text, p_ref text, p_note text)
returns boolean language plpgsql as $$
declare v_item text;
begin
  perform 1 from wallets where user_id = p_user for update;
  delete from wallet_holds where user_id = p_user and ref = p_ref returning item into v_item;
  if v_item is null then return false; end if;
  update wallets set
    tickets = tickets - case when v_item = 'ticket' then 1 else 0 end,
    badges = badges - case when v_item = 'badge' then 1 else 0 end
  where user_id = p_user;
  perform wallet_log(p_user, 'use', v_item, -1, p_note, p_ref);
  return true;
end $$;

-- ref가 prefix(또는 prefix:…)인 예치를 모두 돌려줘요. %s 자리에 돌려준 개수가 들어가요.
create or replace function wallet_release_prefix(p_user text, p_prefix text, p_note_template text)
returns int language plpgsql as $$
declare n int;
declare v_item text;
begin
  perform 1 from wallets where user_id = p_user for update;
  with gone as (
    delete from wallet_holds where user_id = p_user and (ref = p_prefix or ref like p_prefix || ':%') returning item
  ) select count(*), min(item) into n, v_item from gone;
  if n > 0 then perform wallet_log(p_user, 'release', v_item, 0, format(p_note_template, n), p_prefix); end if;
  return n;
end $$;

-- 운영자 지급
create or replace function wallet_grant(p_user text, p_item text, p_amount int, p_note text)
returns void language plpgsql as $$
begin
  update wallets set
    free_doki = free_doki + case when p_item = 'doki' then p_amount else 0 end,
    tickets = tickets + case when p_item = 'ticket' then p_amount else 0 end,
    badges = badges + case when p_item = 'badge' then p_amount else 0 end
  where user_id = p_user;
  if not found then raise exception 'no wallet for %', p_user; end if;
  perform wallet_log(p_user, 'grant', p_item, p_amount, p_note);
end $$;

-- 그룹 만들기용: 여러 사람의 대화 몫 입장권을 한꺼번에 예치 (한 명이라도 실패하면 전부 취소)
-- p_deposits: [{"user_id": "...", "refs": ["group:g:u1", ...]}, ...]
-- 실패하면 예외 'insufficient:<user_id>'를 던져요. 호출한 쪽은 그 사람을 빼고 다시 계산해요.
create or replace function wallet_hold_group(p_deposits jsonb, p_note text, p_unit_price int)
returns void language plpgsql as $$
declare d jsonb;
begin
  for d in select * from jsonb_array_elements(p_deposits) loop
    if not wallet_hold_many(d ->> 'user_id', 'ticket', array(select jsonb_array_elements_text(d -> 'refs')), p_note, p_unit_price) then
      raise exception 'insufficient:%', d ->> 'user_id';
    end if;
  end loop;
end $$;

-- 서버 함수 외에는 호출할 수 없게 해요.
do $$
declare f text;
begin
  foreach f in array array['wallet_log(text,text,text,int,text,text)', 'wallet_ensure(text,int,int)', 'wallet_available(text,text)',
    'wallet_spend_doki(text,text,int,int,text)', 'wallet_exchange(text,text,int,int)', 'wallet_hold_many(text,text,text[],text,int)',
    'wallet_consume(text,text,text)', 'wallet_release_prefix(text,text,text)', 'wallet_grant(text,text,int,text)',
    'wallet_hold_group(jsonb,text,int)']
  loop
    execute format('revoke all on function %s from public', f);
    if exists (select 1 from pg_roles where rolname = 'anon') then execute format('revoke all on function %s from anon', f); end if;
    if exists (select 1 from pg_roles where rolname = 'authenticated') then execute format('revoke all on function %s from authenticated', f); end if;
  end loop;
end $$;
