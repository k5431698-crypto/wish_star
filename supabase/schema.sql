-- 소원 별 우체국 2단계: Supabase 표 설계 (SQL Editor에 붙여넣어 실행)
-- 원칙: 브라우저(anon 키)는 표에 직접 접근하지 못하고, 서버 함수(Edge Function)만 읽고 쓴다.
--       그래야 서버에서 글을 한 번 더 걸러내고, 번호표 해시가 밖으로 새지 않는다.

create table if not exists wishes (
  id          uuid primary key default gen_random_uuid(),
  body        text not null check (char_length(body) between 1 and 200),
  token_hash  text not null,                 -- 내 소원 번호표의 해시(원본은 저장하지 않음)
  status      text not null default 'visible' check (status in ('visible','hidden')),
  created_at  timestamptz not null default now()
);

create table if not exists replies (
  id          uuid primary key default gen_random_uuid(),
  wish_id     uuid not null references wishes(id) on delete cascade,
  body        text not null check (char_length(body) between 1 and 200),
  status      text not null default 'visible' check (status in ('visible','hidden')),
  created_at  timestamptz not null default now()
);

create table if not exists reports (
  id          uuid primary key default gen_random_uuid(),
  target_type text not null check (target_type in ('wish','reply')),
  target_id   uuid not null,
  reason      text check (char_length(reason) <= 100),
  created_at  timestamptz not null default now()
);

create index if not exists replies_wish_idx on replies (wish_id, created_at);
create index if not exists wishes_token_idx on wishes (token_hash);

-- 표 잠그기: 정책을 하나도 만들지 않으므로 anon 키로는 아무것도 읽거나 쓸 수 없다.
alter table wishes  enable row level security;
alter table replies enable row level security;
alter table reports enable row level security;
