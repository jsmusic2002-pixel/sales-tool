-- Supabase > SQL Editor 에서 한 번 실행. 모든 프로그램의 매핑 데이터를 이 테이블 하나에 저장합니다.
create table if not exists public.lookup (
  ns text not null,            -- '프로그램id/테이블' 예: emp-ecount/products
  k  text not null,            -- 첫 번째 열(검색 키)
  v  jsonb not null default '[]',  -- 나머지 열 값 배열
  updated_at timestamptz default now(),
  primary key (ns, k)
);
alter table public.lookup enable row level security;
drop policy if exists "staff all" on public.lookup;
create policy "staff all" on public.lookup for all to authenticated using (true) with check (true);
-- 로그인하지 않은 사용자(anon)에게는 정책이 없으므로 아무것도 읽거나 쓸 수 없습니다.
