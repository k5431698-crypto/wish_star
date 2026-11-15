-- 2단계-2: 고민 + 답장 + 별
-- 답장한 사람을 번호표 해시로 기억(내 글에 내가 답하지 않게, 별을 받은 사람을 알 수 있게)
alter table replies add column if not exists token_hash text;
create index if not exists replies_token_idx on replies (token_hash);

-- 별: 고민을 쓴 사람이 마음에 든 답장에 주는 별 (답장 하나에 별 하나)
create table if not exists stars (
  id            uuid primary key default gen_random_uuid(),
  reply_id      uuid not null unique references replies(id) on delete cascade,
  giver_hash    text not null,      -- 별을 준 사람(고민 쓴 사람)의 번호표 해시
  receiver_hash text not null,      -- 별을 받은 사람(답장 쓴 사람)의 번호표 해시
  created_at    timestamptz not null default now()
);
create index if not exists stars_pair_idx on stars (giver_hash, receiver_hash);

-- 브라우저에서 직접 접근 못 하게 잠금 (서버 함수만 사용)
alter table stars enable row level security;
