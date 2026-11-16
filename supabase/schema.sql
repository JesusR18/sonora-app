-- ============================================================================
-- Sonora · Blog de música — esquema de base de datos para Supabase
-- Cómo usarlo: Supabase → SQL Editor → New query → pega todo este archivo → Run.
-- Se puede volver a correr sin romper nada (usa IF NOT EXISTS / OR REPLACE).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Perfiles: uno por cada cuenta de Supabase Auth
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  username     text unique check (username ~ '^[a-z0-9_]{3,24}$'),
  display_name text not null default 'Oyente' check (char_length(display_name) between 1 and 40),
  avatar_url   text,
  bio          text check (char_length(bio) <= 280),
  role         text not null default 'user' check (role in ('user', 'admin')),
  created_at   timestamptz not null default now()
);

-- Crea el perfil automáticamente al registrarse
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), nullif(new.raw_user_meta_data ->> 'name', ''), split_part(new.email, '@', 1), 'Oyente'),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ¿La persona actual es administradora?
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

-- Nadie puede ascenderse a sí mismo a admin
create or replace function public.protect_role()
returns trigger language plpgsql as $$
begin
  if new.role is distinct from old.role and not public.is_admin() and auth.role() <> 'service_role' then
    new.role := old.role;
  end if;
  return new;
end $$;

drop trigger if exists profiles_protect_role on public.profiles;
create trigger profiles_protect_role before update on public.profiles
  for each row execute function public.protect_role();

-- ---------------------------------------------------------------------------
-- Entradas del blog: artículos propios y noticias importadas por RSS
-- ---------------------------------------------------------------------------
create table if not exists public.posts (
  id           uuid primary key default gen_random_uuid(),
  slug         text not null unique,
  kind         text not null default 'article' check (kind in ('article', 'news')),
  status       text not null default 'published' check (status in ('draft', 'published')),
  title        text not null check (char_length(title) between 3 and 200),
  excerpt      text check (char_length(excerpt) <= 600),
  body         text,                          -- Markdown (artículos propios)
  cover_url    text,
  source_name  text,                          -- noticias: medio de origen
  source_url   text unique,                   -- noticias: enlace original (evita duplicados)
  author_id    uuid references public.profiles (id) on delete set null,
  album_id     text,                          -- disco del catálogo relacionado (opcional)
  artist_id    text,                          -- artista del catálogo relacionado (opcional)
  tags         text[] not null default '{}',
  featured     boolean not null default false,
  published_at timestamptz not null default now(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists posts_feed_idx on public.posts (status, published_at desc);
create index if not exists posts_kind_idx on public.posts (kind, published_at desc);
create index if not exists posts_tags_idx on public.posts using gin (tags);

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$ begin new.updated_at := now(); return new; end $$;
drop trigger if exists posts_touch on public.posts;
create trigger posts_touch before update on public.posts for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Comentarios (con respuestas) y likes de comentarios
-- ---------------------------------------------------------------------------
create table if not exists public.comments (
  id         uuid primary key default gen_random_uuid(),
  post_id    uuid not null references public.posts (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade default auth.uid(),
  parent_id  uuid references public.comments (id) on delete cascade,
  body       text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now(),
  edited_at  timestamptz
);
create index if not exists comments_post_idx on public.comments (post_id, created_at);

create table if not exists public.comment_likes (
  comment_id uuid not null references public.comments (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade default auth.uid(),
  created_at timestamptz not null default now(),
  primary key (comment_id, user_id)
);

-- ---------------------------------------------------------------------------
-- Reacciones a entradas (varias por persona, una de cada tipo)
-- ---------------------------------------------------------------------------
create table if not exists public.post_reactions (
  post_id    uuid not null references public.posts (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade default auth.uid(),
  emoji      text not null check (emoji in ('fire', 'heart', 'vinyl', 'mind', 'sad')),
  created_at timestamptz not null default now(),
  primary key (post_id, user_id, emoji)
);

-- ---------------------------------------------------------------------------
-- Encuestas
-- ---------------------------------------------------------------------------
create table if not exists public.polls (
  id         uuid primary key default gen_random_uuid(),
  question   text not null check (char_length(question) between 3 and 200),
  post_id    uuid references public.posts (id) on delete cascade,  -- opcional: encuesta dentro de una entrada
  closes_at  timestamptz,
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);

create table if not exists public.poll_options (
  id       uuid primary key default gen_random_uuid(),
  poll_id  uuid not null references public.polls (id) on delete cascade,
  label    text not null check (char_length(label) between 1 and 120),
  album_id text,
  position int not null default 0
);

create table if not exists public.poll_votes (
  poll_id    uuid not null references public.polls (id) on delete cascade,
  option_id  uuid not null references public.poll_options (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade default auth.uid(),
  created_at timestamptz not null default now(),
  primary key (poll_id, user_id)               -- un voto por persona (se puede cambiar)
);

-- ---------------------------------------------------------------------------
-- Reseñas de discos del catálogo (1 a 5 estrellas, una por persona y disco)
-- ---------------------------------------------------------------------------
create table if not exists public.album_reviews (
  album_id   text not null,
  user_id    uuid not null references public.profiles (id) on delete cascade default auth.uid(),
  rating     smallint not null check (rating between 1 and 5),
  body       text check (char_length(body) <= 3000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (album_id, user_id)
);
drop trigger if exists reviews_touch on public.album_reviews;
create trigger reviews_touch before update on public.album_reviews for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Favoritos y reproducciones de discos (sustituyen al archivo storage/sonora-db.json)
-- ---------------------------------------------------------------------------
create table if not exists public.album_likes (
  album_id   text not null,
  user_id    uuid not null references public.profiles (id) on delete cascade default auth.uid(),
  created_at timestamptz not null default now(),
  primary key (album_id, user_id)
);

create table if not exists public.album_plays (
  album_id text primary key,
  plays    bigint not null default 0
);

-- Solo el servidor (service_role) suma reproducciones, así nadie infla los números desde el navegador
create or replace function public.add_play(p_album text)
returns bigint language sql security definer set search_path = public as $$
  insert into public.album_plays (album_id, plays) values (p_album, 1)
  on conflict (album_id) do update set plays = album_plays.plays + 1
  returning plays;
$$;
revoke execute on function public.add_play(text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Chat en vivo
-- ---------------------------------------------------------------------------
create table if not exists public.chat_messages (
  id         bigint generated always as identity primary key,
  room       text not null default 'general' check (room ~ '^[a-z0-9-]{1,60}$'),
  user_id    uuid not null references public.profiles (id) on delete cascade default auth.uid(),
  body       text not null check (char_length(body) between 1 and 500),
  created_at timestamptz not null default now()
);
create index if not exists chat_room_idx on public.chat_messages (room, created_at desc);

-- Máximo 1 mensaje cada 2 segundos por persona
create or replace function public.chat_throttle()
returns trigger language plpgsql as $$
begin
  if exists (select 1 from public.chat_messages where user_id = new.user_id and created_at > now() - interval '2 seconds') then
    raise exception 'Espera un momento antes de enviar otro mensaje';
  end if;
  return new;
end $$;
drop trigger if exists chat_throttle on public.chat_messages;
create trigger chat_throttle before insert on public.chat_messages for each row execute function public.chat_throttle();

-- ---------------------------------------------------------------------------
-- Vistas con contadores (respetan RLS de las tablas base)
-- ---------------------------------------------------------------------------
create or replace view public.post_stats with (security_invoker = true) as
  select p.id as post_id,
         (select count(*) from public.comments c where c.post_id = p.id) as comments,
         (select count(*) from public.post_reactions r where r.post_id = p.id) as reactions
  from public.posts p;

create or replace view public.album_stats with (security_invoker = true) as
  select ids.album_id,
         coalesce((select plays from public.album_plays ap where ap.album_id = ids.album_id), 0) as plays,
         (select count(*) from public.album_likes l where l.album_id = ids.album_id) as likes,
         (select count(*) from public.album_reviews r where r.album_id = ids.album_id) as reviews,
         (select round(avg(rating)::numeric, 2) from public.album_reviews r where r.album_id = ids.album_id) as rating
  from (select album_id from public.album_plays
        union select album_id from public.album_likes
        union select album_id from public.album_reviews) ids;

create or replace view public.poll_results with (security_invoker = true) as
  select o.poll_id, o.id as option_id, o.label, o.album_id, o.position, count(v.user_id) as votes
  from public.poll_options o
  left join public.poll_votes v on v.option_id = o.id
  group by o.id;

-- ---------------------------------------------------------------------------
-- Seguridad a nivel de fila (RLS)
-- ---------------------------------------------------------------------------
alter table public.profiles       enable row level security;
alter table public.posts          enable row level security;
alter table public.comments       enable row level security;
alter table public.comment_likes  enable row level security;
alter table public.post_reactions enable row level security;
alter table public.polls          enable row level security;
alter table public.poll_options   enable row level security;
alter table public.poll_votes     enable row level security;
alter table public.album_reviews  enable row level security;
alter table public.album_likes    enable row level security;
alter table public.album_plays    enable row level security;
alter table public.chat_messages  enable row level security;

do $$
declare t text;
begin
  -- Borra las políticas anteriores para poder volver a correr el archivo
  for t in select format('drop policy if exists %I on %I.%I', policyname, schemaname, tablename)
           from pg_policies where schemaname = 'public' loop
    execute t;
  end loop;
end $$;

-- Perfiles: todos los ven; cada quien edita el suyo
create policy "perfiles visibles"      on public.profiles for select using (true);
create policy "editar mi perfil"       on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());

-- Entradas: se ven las publicadas (admins ven todo); solo admins escriben
create policy "entradas publicadas"    on public.posts for select using (status = 'published' or public.is_admin());
create policy "admins crean entradas"  on public.posts for insert with check (public.is_admin());
create policy "admins editan entradas" on public.posts for update using (public.is_admin());
create policy "admins borran entradas" on public.posts for delete using (public.is_admin());

-- Comentarios: todos leen; con cuenta comentan; cada quien edita/borra lo suyo (admins moderan)
create policy "comentarios visibles"   on public.comments for select using (true);
create policy "comentar"               on public.comments for insert to authenticated with check (user_id = auth.uid());
create policy "editar mi comentario"   on public.comments for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "borrar comentario"      on public.comments for delete using (user_id = auth.uid() or public.is_admin());

-- Likes, reacciones, votos, favoritos: todos leen; cada quien maneja los suyos
create policy "likes visibles"         on public.comment_likes  for select using (true);
create policy "dar like"               on public.comment_likes  for insert to authenticated with check (user_id = auth.uid());
create policy "quitar like"            on public.comment_likes  for delete using (user_id = auth.uid());

create policy "reacciones visibles"    on public.post_reactions for select using (true);
create policy "reaccionar"             on public.post_reactions for insert to authenticated with check (user_id = auth.uid());
create policy "quitar reaccion"        on public.post_reactions for delete using (user_id = auth.uid());

create policy "favoritos visibles"     on public.album_likes for select using (true);
create policy "marcar favorito"        on public.album_likes for insert to authenticated with check (user_id = auth.uid());
create policy "quitar favorito"        on public.album_likes for delete using (user_id = auth.uid());

create policy "reproducciones visibles" on public.album_plays for select using (true);

-- Encuestas: todos ven; admins crean; con cuenta votan mientras esté abierta
create policy "encuestas visibles"     on public.polls        for select using (true);
create policy "admins crean encuestas" on public.polls        for all    using (public.is_admin()) with check (public.is_admin());
create policy "opciones visibles"      on public.poll_options for select using (true);
create policy "admins crean opciones"  on public.poll_options for all    using (public.is_admin()) with check (public.is_admin());
create policy "votos visibles"         on public.poll_votes   for select using (true);
create policy "votar"                  on public.poll_votes   for insert to authenticated with check (
  user_id = auth.uid()
  and exists (select 1 from public.polls p where p.id = poll_id and (p.closes_at is null or p.closes_at > now()))
  and exists (select 1 from public.poll_options o where o.id = option_id and o.poll_id = poll_votes.poll_id));
create policy "cambiar voto"           on public.poll_votes   for delete using (user_id = auth.uid());

-- Reseñas: todos leen; una por persona y disco
create policy "resenas visibles"       on public.album_reviews for select using (true);
create policy "resenar"                on public.album_reviews for insert to authenticated with check (user_id = auth.uid());
create policy "editar mi resena"       on public.album_reviews for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "borrar resena"          on public.album_reviews for delete using (user_id = auth.uid() or public.is_admin());

-- Chat: todos leen; con cuenta escriben; admins moderan
create policy "chat visible"           on public.chat_messages for select using (true);
create policy "escribir en el chat"    on public.chat_messages for insert to authenticated with check (user_id = auth.uid());
create policy "borrar mensaje"         on public.chat_messages for delete using (user_id = auth.uid() or public.is_admin());

-- ---------------------------------------------------------------------------
-- Tiempo real: estas tablas avisan al instante a la página cuando cambian
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['posts', 'comments', 'comment_likes', 'post_reactions', 'poll_votes', 'album_reviews', 'album_likes', 'album_plays', 'chat_messages'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- Para que los borrados en tiempo real incluyan la fila completa
alter table public.comments       replica identity full;
alter table public.comment_likes  replica identity full;
alter table public.post_reactions replica identity full;
alter table public.poll_votes     replica identity full;
alter table public.album_likes    replica identity full;
alter table public.chat_messages  replica identity full;

-- ============================================================================
-- Después de registrarte en la página, hazte admin con (cambia el correo):
--   update public.profiles set role = 'admin'
--   where id = (select id from auth.users where email = 'tu-correo@ejemplo.com');
-- ============================================================================
