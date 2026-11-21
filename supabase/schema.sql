-- Run this SQL once inside your Supabase Dashboard -> SQL Editor

create table if not exists public.creators (
  creator_id text primary key,
  email text not null,
  display_name text not null,
  site_credits integer not null default 1,
  published_count integer not null default 0,
  has_unlimited_pass boolean not null default false,
  last_utr_ref text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.gifts (
  slug text primary key,
  creator_id text not null references public.creators(creator_id) on delete cascade,
  tier text not null default 'free',
  theme text not null default 'midnight-polaroid',
  occasion text not null default 'birthday',
  recipient_name text not null,
  sender_name text not null,
  headline text not null,
  opening_letter text not null,
  special_date text not null default '',
  milestone_date_iso text not null default '',
  milestone_label text not null default '',
  song_title text not null default '',
  song_artist text not null default '',
  song_url text not null default '',
  memories jsonb not null default '[]'::jsonb,
  reasons jsonb not null default '[]'::jsonb,
  open_when_notes jsonb not null default '[]'::jsonb,
  enable_quiz boolean not null default true,
  quiz jsonb not null default '[]'::jsonb,
  scratch_label text not null default '',
  scratch_secret text not null default '',
  passcode_enabled boolean not null default false,
  passcode text not null default '',
  passcode_hint text not null default '',
  custom_slug text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists idx_gifts_creator_id on public.gifts(creator_id);
create index if not exists idx_gifts_created_at on public.gifts(created_at desc);
create index if not exists idx_creators_updated_at on public.creators(updated_at desc);

-- Enable Row Level Security (backend uses service_role key; public anon access locked down)
alter table public.creators enable row level security;
alter table public.gifts enable row level security;
