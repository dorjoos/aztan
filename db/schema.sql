-- Sugalaa schema (Postgres)
create table if not exists admins (
  id bigserial primary key,
  username text not null unique,
  password_hash text not null,
  created_at timestamptz not null default now()
);

create table if not exists lotteries (
  id text primary key,
  name text not null,
  fee integer not null,
  bank_account text null,
  iban text null,
  bank_holder text null,
  status text not null default 'open',
  joined integer not null default 0,
  total integer not null default 0,
  sort_order integer null,
  created_at timestamptz not null default now()
);

-- Backfill for existing DBs
alter table lotteries add column if not exists bank_account text;
alter table lotteries add column if not exists iban text;
alter table lotteries add column if not exists bank_holder text;

create table if not exists transactions (
  id bigserial primary key,
  tx_id text unique,
  occurred_at timestamptz null,
  amount numeric(14,2) null,
  phone text null,
  description text null,
  lottery_id text null references lotteries(id) on delete set null,
  raw jsonb not null default '[]'::jsonb,
  imported_at timestamptz not null default now()
);

create index if not exists idx_transactions_phone on transactions(phone);
create index if not exists idx_transactions_occurred_at on transactions(occurred_at);

