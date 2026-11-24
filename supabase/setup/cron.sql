-- 히로: 1분마다 서버 함수의 주기 처리(/tick)를 불러요.
-- 화면이 열려 있지 않아도 로테이션 마무리, 이벤트 세션 시작, 예약 초대장, 직진 만료가 제때 처리돼요.
--
-- Supabase SQL Editor에서 한 번만 실행하세요. (CI의 일반 Postgres에는 pg_cron이 없어서 마이그레이션에 넣지 않았어요)
-- 실행 전에 준비할 것:
--   1) 서버 함수 'api'가 배포돼 있어야 해요.
--   2) 서버 함수 비밀값 HIRO_CRON_KEY를 정해 두세요 (Edge Functions → Secrets).
--   3) 아래 vault.create_secret 두 줄의 값을 바꿔서 먼저 한 번 실행하세요. 비밀값은 Vault에 암호화돼 저장돼요.
--        select vault.create_secret('https://<프로젝트 ref>.supabase.co/functions/v1/api', 'hiro_api_url');
--        select vault.create_secret('<HIRO_CRON_KEY와 같은 값>', 'hiro_cron_key');

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'hiro-tick',
  '* * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'hiro_api_url') || '/tick',
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-cron-key', (select decrypted_secret from vault.decrypted_secrets where name = 'hiro_cron_key')
    ),
    body := '{}'::jsonb
  );
  $$
);

-- 확인: select * from cron.job;  최근 실행: select * from cron.job_run_details order by start_time desc limit 5;
-- 멈추기: select cron.unschedule('hiro-tick');
