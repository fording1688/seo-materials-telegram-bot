create extension if not exists pgcrypto;

create table if not exists public.seo_sources (
  id uuid primary key default gen_random_uuid(),
  telegram_message_id text unique,
  telegram_chat_id text,
  source_type text,
  target_site text,
  original_text text,
  original_url text,
  storage_bucket text,
  storage_path text,
  file_name text,
  mime_type text,
  ai_summary text,
  suggested_topics jsonb,
  status text default 'new',
  error_message text,
  created_at timestamptz default now(),
  processed_at timestamptz,
  constraint seo_sources_source_type_check check (source_type in ('text', 'link', 'image', 'file', 'video')),
  constraint seo_sources_target_site_check check (target_site in ('toolsfinderhub', 'abrasive')),
  constraint seo_sources_status_check check (status in ('new', 'processing', 'processed', 'error'))
);

create table if not exists public.seo_articles (
  id uuid primary key default gen_random_uuid(),
  source_id uuid references public.seo_sources(id) on delete set null,
  target_site text not null,
  title text not null,
  slug text not null,
  meta_description text,
  keywords jsonb,
  outline jsonb,
  markdown_content text,
  status text default 'draft',
  github_owner text,
  github_repo text,
  github_path text,
  created_at timestamptz default now(),
  published_at timestamptz,
  constraint seo_articles_target_site_check check (target_site in ('toolsfinderhub', 'abrasive')),
  constraint seo_articles_status_check check (status in ('draft', 'published', 'error'))
);

create index if not exists seo_sources_status_created_at_idx
  on public.seo_sources (status, created_at);

create index if not exists seo_articles_status_created_at_idx
  on public.seo_articles (status, created_at desc);

create unique index if not exists seo_articles_target_site_slug_idx
  on public.seo_articles (target_site, slug);

alter table public.seo_sources enable row level security;
alter table public.seo_articles enable row level security;

insert into storage.buckets (id, name, public)
values ('seo-materials', 'seo-materials', true)
on conflict (id) do nothing;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'seo_materials_public_read'
  ) then
    create policy "seo_materials_public_read"
    on storage.objects for select
    using (bucket_id = 'seo-materials');
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'seo_materials_service_role_all'
  ) then
    create policy "seo_materials_service_role_all"
    on storage.objects for all
    using (bucket_id = 'seo-materials' and auth.role() = 'service_role')
    with check (bucket_id = 'seo-materials' and auth.role() = 'service_role');
  end if;
end $$;
