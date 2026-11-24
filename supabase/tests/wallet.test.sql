-- 지갑 함수 테스트: 빈 DB에 마이그레이션을 적용한 뒤 실행해요. 마지막 줄이 "N passed, 0 failed"여야 해요.
\set ON_ERROR_STOP 1
\set QUIET 1
\pset tuples_only on
create temp table results (name text, ok boolean, info text default '');
grant all on results to anon;
create or replace function pg_temp.chk(n text, ok boolean, info text default '') returns void language sql as $$ insert into results values (n, ok, info) $$;
create or replace function pg_temp.w(u text) returns text language sql as $$
  select format('도키 %s · 입장권 %s(예치 %s) · 증표 %s', free_doki+paid_doki, tickets, (select count(*) from wallet_holds h where h.user_id=u and item='ticket'), badges) from wallets where user_id=u $$;

insert into users (id, code) values ('a','A2B3C'),('b','B2C3D'),('c','C2D3E'),('d','D2E3F'),('e','E2F3G');
insert into users (id, code, is_demo) values ('demo','D9X8Y', true);

-- 가입 선물
select wallet_ensure('a',5,1);
select pg_temp.chk('가입 선물 입장권5·증표1', (select tickets=5 and badges=1 from wallets where user_id='a'));
select pg_temp.chk('두 번 받지 않음', wallet_ensure('a',5,1) and (select tickets=5 from wallets where user_id='a') and (select count(*)=2 from ledger where user_id='a' and kind='starter'));
select pg_temp.chk('데모는 지갑 없음', not wallet_ensure('demo',5,1) and not exists(select 1 from wallets where user_id='demo'));

-- 바꾸기
select pg_temp.chk('도키 없이 바꾸기 거절', wallet_exchange('a','ticket',5,45) = '도키가 모자라요. (45도키 필요)');
select wallet_grant('a','doki',100,'테스트');
create temp table r1 as select wallet_exchange('a','ticket',5,45) as err;
select pg_temp.chk('5장 묶음 45도키', (select err is null from r1) and (select free_doki=55 and tickets=10 from wallets where user_id='a'), pg_temp.w('a'));

-- 예치 → 사용 / 돌려받기
create temp table r2 as select wallet_hold_many('a','ticket',array['group:g1:b','group:g1:c','group:g1:d'],'예치',10) as ok;
select pg_temp.chk('3장 예치', (select ok from r2) and wallet_available('a','ticket')=7, pg_temp.w('a'));
select pg_temp.chk('같은 ref 다시 예치해도 그대로', wallet_hold_many('a','ticket',array['group:g1:b'],'예치',10) and (select count(*)=3 from wallet_holds where user_id='a'));
create temp table r3 as select wallet_consume('a','group:g1:b','성사') as ok;
select pg_temp.chk('b와 대화 성사 → 1장 사용', (select ok from r3) and (select tickets=9 from wallets where user_id='a'), pg_temp.w('a'));
select pg_temp.chk('같은 몫 두 번 사용 안 됨', not wallet_consume('a','group:g1:b','성사') and (select tickets=9 from wallets where user_id='a'));
create temp table r4 as select wallet_release_prefix('a','group:g1','성사되지 않은 대화 %s번 몫') as n;
select pg_temp.chk('끝나면 남은 2장 돌려받음', (select n=2 from r4) and wallet_available('a','ticket')=9, pg_temp.w('a'));
select pg_temp.chk('돌려받은 내역 한 줄', (select note from ledger where user_id='a' and kind='release' order by id desc limit 1) = '성사되지 않은 대화 2번 몫');
select pg_temp.chk('prefix가 다른 그룹은 안 건드림', wallet_hold_many('a','ticket',array['group:g10:b'],'x',10) and wallet_release_prefix('a','group:g1','x')=0 and wallet_release_prefix('a','group:g10','x')=1);

-- 자동 교환: 입장권 1장 + 30도키, 3장 필요 → 모자란 2장만 (20도키)
select wallet_ensure('b',1,0); select wallet_grant('b','doki',30,'t');
create temp table r5 as select wallet_hold_many('b','ticket',array['group:g2:a','group:g2:c','group:g2:d'],'예치',10) as ok;
select pg_temp.chk('모자란 2장만 자동 교환', (select ok from r5) and (select free_doki=10 and tickets=3 from wallets where user_id='b'), pg_temp.w('b'));
-- 도키 모자람 → 실패, 아무것도 안 바뀜
select wallet_ensure('c',0,0); select wallet_grant('c','doki',15,'t');
select pg_temp.chk('도키 모자라면 실패·변화 없음', not wallet_hold_many('c','ticket',array['x:1','x:2'],'예치',10) and (select free_doki=15 and tickets=0 from wallets where user_id='c') and not exists(select 1 from wallet_holds where user_id='c'));
-- 자동 교환 끔
update wallets set auto_exchange=false where user_id='c';
select pg_temp.chk('자동 교환 끄면 실패', not wallet_hold_many('c','ticket',array['x:1'],'예치',10) and (select free_doki=15 from wallets where user_id='c'));
update wallets set auto_exchange=true where user_id='c';

-- 그룹 예치: 한 명이라도 실패하면 전부 취소
select wallet_ensure('d',5,0); select wallet_ensure('e',0,0);
do $$ begin
  perform wallet_hold_group('[{"user_id":"d","refs":["group:g3:e"]},{"user_id":"e","refs":["group:g3:d"]}]'::jsonb, '예치', 10);
  perform pg_temp.chk('그룹 예치 실패해야 함', false);
exception when others then
  perform pg_temp.chk('e가 못 내면 예외 insufficient:e', sqlerrm = 'insufficient:e', sqlerrm);
end $$;
select pg_temp.chk('d의 예치도 함께 취소됨', not exists(select 1 from wallet_holds where ref like 'group:g3%'));
select pg_temp.chk('데모는 예치 없이 통과', wallet_hold_many('demo','ticket',array['group:g4:a'],'x',10));

-- 음수 방지 제약
do $$ begin
  update wallets set tickets = -1 where user_id = 'd';
  perform pg_temp.chk('음수 막혀야 함', false);
exception when check_violation then perform pg_temp.chk('입장권 음수 불가 (DB 제약)', true); end $$;

-- 브라우저 역할(anon): Supabase처럼 표 권한은 있어도 RLS 때문에 한 줄도 안 보여야 하고, 지갑 함수는 못 불러야 해요.
set role anon;
select pg_temp.chk('anon에게 지갑이 한 줄도 안 보임 (RLS)', (select count(*) from wallets) = 0);
select pg_temp.chk('anon에게 사용자가 한 줄도 안 보임 (RLS)', (select count(*) from users) = 0);
do $$ begin perform wallet_grant('a','doki',999,'hack'); perform pg_temp.chk('anon 지급 막혀야 함', false);
exception when insufficient_privilege then perform pg_temp.chk('anon은 지갑 함수 호출 불가', true); end $$;
do $$ begin insert into wallets (user_id, free_doki) values ('a', 999); perform pg_temp.chk('anon 쓰기 막혀야 함', false);
exception when insufficient_privilege then perform pg_temp.chk('anon은 지갑 쓰기 불가 (RLS)', true); end $$;
reset role;
select pg_temp.chk('해킹 지급 안 됨', (select free_doki from wallets where user_id='a') = 55);

select (case when ok then '✅ ' else '❌ ' end) || name || case when info <> '' then '   ' || info else '' end from results;
select format(E'\n%s passed, %s failed', count(*) filter (where ok), count(*) filter (where not ok)) from results;
