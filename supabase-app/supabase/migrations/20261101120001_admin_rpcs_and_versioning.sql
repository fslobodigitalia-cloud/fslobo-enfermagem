-- =============================================================================
-- 0007 (PROPOSTA — NÃO APLICADA): administração do conteúdo, versionamento e auditoria
--
-- O que esta migration faz (tudo aditivo; nenhum dado existente é apagado ou reescrito):
--  1. study_questions ganha external_key (chave estável da questão) e version (versão).
--     Só as 25 questões do lote 01 são preenchidas (a chave sai do prefixo FSLOBO-L01-Qnn de source_note);
--     as demais ficam com external_key NULL e version 1. updated_at NÃO é alterado pelo preenchimento.
--     Duas chaves únicas: (external_key, version) e "no máximo um rascunho aberto por external_key".
--  2. O guard de imutabilidade passa a travar external_key e version de questão publicada/arquivada.
--  3. study_question_meta: referências técnicas, ORIGEM da questão (separada da referência), notas editoriais.
--  4. study_admin_audit: trilha append-only de ações administrativas (quem, quando, o quê).
--  5. RPCs study_admin_* (SECURITY DEFINER, search_path fixo). Toda autorização é validada NO SERVIDOR:
--       - is_study_admin() (administrador ativo em study_admins) em todas;
--       - escrita exige também JWT com aal = 'aal2' (MFA verificado); leitura exige só administrador;
--       - nenhuma RPC concede ou altera papel de administrador: a concessão continua só por SQL direto.
--  6. study_admin_publish_question(uuid, boolean) (já existente) passa a delegar para a nova publicação em lote,
--     para não deixar um caminho de publicação sem MFA. Assinatura e permissões preservadas.
--
-- O que NÃO faz: não toca nas tabelas de aluno, nas RPCs de aluno, em GRANT/POLICY existentes, nem reimporta o lote 01.
-- Nenhum acesso direto às tabelas é concedido a anon/authenticated: o CRM só chama as RPCs abaixo.
-- =============================================================================

-- ── 1. identificação por versão ───────────────────────────────────────────────
alter table public.study_questions
  add column external_key text,
  add column version integer not null default 1;
alter table public.study_questions
  add constraint study_questions_external_key_format
    check (external_key is null or external_key ~ '^[A-Za-z0-9][A-Za-z0-9._-]{2,63}$'),
  add constraint study_questions_version_positive check (version >= 1);
comment on column public.study_questions.external_key is
  'Chave estável da questão entre versões (ex.: FSLOBO-L01-Q03). NULL em questões antigas. Imutável após publicar.';
comment on column public.study_questions.version is
  'Versão da questão para a mesma external_key. Correção de questão publicada = nova versão (supersedes_id aponta para a anterior).';

-- preenchimento do lote 01 (a chave já estava no começo de source_note); o touch é desligado só aqui,
-- para não mexer em updated_at das questões já publicadas
alter table public.study_questions disable trigger study_questions_touch;
update public.study_questions
   set external_key = split_part(source_note, ' |', 1)
 where external_key is null and source_note ~ '^FSLOBO-L01-Q[0-9]{2} \|';
alter table public.study_questions enable trigger study_questions_touch;

create unique index study_questions_key_version_uq
  on public.study_questions (external_key, version) where external_key is not null;
create unique index study_questions_one_open_draft_uq
  on public.study_questions (external_key) where external_key is not null and status in ('draft', 'in_review');

-- ── 2. guard: external_key e version imutáveis depois de publicar ─────────────────
create or replace function public.study_guard_published_question()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  v_n integer;
begin
  if tg_op = 'INSERT' then
    if new.status <> 'draft' then
      raise exception 'study: questão nova deve nascer como rascunho (status=draft).' using errcode = '23514';
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    if old.status in ('published', 'archived') then
      raise exception 'study: questão % já foi publicada e não pode ser apagada (arquive-a).', old.id
        using errcode = '23514';
    end if;
    return old;
  end if;

  -- UPDATE
  if old.status in ('published', 'archived') then
    if new.id is distinct from old.id
       or new.subject_id is distinct from old.subject_id
       or new.stem is distinct from old.stem
       or new.difficulty is distinct from old.difficulty
       or new.supersedes_id is distinct from old.supersedes_id
       or new.external_key is distinct from old.external_key
       or new.version is distinct from old.version
       or new.created_at is distinct from old.created_at
       or new.no_real_patient_data_confirmed is distinct from old.no_real_patient_data_confirmed
       or new.reviewed_at is distinct from old.reviewed_at
       or new.published_at is distinct from old.published_at
       or new.created_by_ref is distinct from old.created_by_ref
       or new.reviewed_by_ref is distinct from old.reviewed_by_ref then
      raise exception 'study: conteúdo e auditoria de questão publicada são imutáveis (arquive e crie nova versão).'
        using errcode = '23514';
    end if;
    -- autoria e revisão: só viram NULL, e só por ação de FK (apagar a conta do usuário)
    if (new.created_by is distinct from old.created_by and not (new.created_by is null and pg_trigger_depth() > 1))
       or (new.reviewed_by is distinct from old.reviewed_by and not (new.reviewed_by is null and pg_trigger_depth() > 1)) then
      raise exception 'study: autoria e revisão de questão publicada são imutáveis (só são anuladas ao apagar a conta).'
        using errcode = '23514';
    end if;
    if not (new.status = old.status or (old.status = 'published' and new.status = 'archived')) then
      raise exception 'study: transição de status inválida (% -> %).', old.status, new.status
        using errcode = '23514';
    end if;
    return new;
  end if;

  -- rascunho / em revisão
  if new.status = 'published' then
    select count(*) into v_n from public.study_question_options o where o.question_id = new.id;
    if v_n not between 2 and 5 then
      raise exception 'study: publicar exige de 2 a 5 alternativas (há %).', v_n using errcode = '23514';
    end if;
    if not exists (select 1 from public.study_answer_keys k where k.question_id = new.id) then
      raise exception 'study: publicar exige gabarito.' using errcode = '23514';
    end if;
    if not exists (select 1 from public.study_explanations e where e.question_id = new.id) then
      raise exception 'study: publicar exige explicação.' using errcode = '23514';
    end if;
    if new.reviewed_by is null then
      raise exception 'study: publicar exige reviewed_by (quem revisou).' using errcode = '23514';
    end if;
  elsif new.status = 'archived' then
    raise exception 'study: só questão publicada pode ser arquivada.' using errcode = '23514';
  end if;
  return new;
end;
$$;

-- ── 3. metadados administrativos (nunca retornados ao aluno) ──────────────────────
-- Referência técnica (fonte do CONTEÚDO) e origem da questão (de onde veio) são coisas diferentes:
-- origin_status começa em 'not_proven' e nunca é exibida ao aluno nem atribuída a banca.
create table public.study_question_meta (
  question_id          uuid primary key references public.study_questions (id) on delete cascade,
  technical_references jsonb not null default '[]'::jsonb
    check (jsonb_typeof(technical_references) = 'array' and jsonb_array_length(technical_references) <= 20
           and octet_length(technical_references::text) <= 12000),
  origin_status        text not null default 'not_proven'
    check (origin_status in ('not_proven', 'author_original', 'licensed', 'public_domain')),
  origin_note          text check (origin_note is null or char_length(origin_note) <= 500),
  editorial_note       text check (editorial_note is null or char_length(editorial_note) <= 2000),
  import_batch         text check (import_batch is null or char_length(import_batch) <= 60),
  updated_at           timestamptz not null default now()
);
comment on table public.study_question_meta is
  'Metadados administrativos da questão: referências técnicas, origem, notas editoriais. Sem GRANT para anon/authenticated.';
create trigger study_question_meta_touch before update on public.study_question_meta
  for each row execute function public.study_touch_updated_at();
create trigger study_question_meta_no_truncate before truncate on public.study_question_meta
  for each statement execute function public.study_block_truncate();
alter table public.study_question_meta enable row level security;
revoke all on public.study_question_meta from public, anon, authenticated, service_role;
grant select, insert, update, delete on public.study_question_meta to service_role;

-- ── 4. trilha de auditoria append-only ──────────────────────────────────────────────
create table public.study_admin_audit (
  id           bigint generated always as identity primary key,
  at           timestamptz not null default now(),
  actor_ref    uuid not null,                       -- UUID opaco, sem FK: sobrevive à exclusão da conta
  action       text not null check (action in (
                 'create_draft', 'update_draft', 'delete_draft', 'import', 'publish', 'archive',
                 'new_version', 'save_meta', 'create_subject', 'update_subject')),
  question_id  uuid,
  subject_id   uuid,
  external_key text,
  version      integer,
  detail       jsonb not null default '{}'::jsonb check (octet_length(detail::text) <= 20000)
);
comment on table public.study_admin_audit is
  'Ações administrativas do app (append-only). Sem GRANT para anon/authenticated; leitura só pela RPC study_admin_list_audit.';
create index study_admin_audit_question_idx on public.study_admin_audit (question_id, id desc) where question_id is not null;
create index study_admin_audit_at_idx on public.study_admin_audit (at desc);
create trigger study_admin_audit_append_only before update or delete on public.study_admin_audit
  for each row execute function public.study_guard_append_only();
create trigger study_admin_audit_no_truncate before truncate on public.study_admin_audit
  for each statement execute function public.study_block_truncate();
alter table public.study_admin_audit enable row level security;
revoke all on public.study_admin_audit from public, anon, authenticated, service_role;
grant select, insert, update, delete on public.study_admin_audit to service_role;

-- ── 5. funções internas ──────────────────────────────────────────────────────────────
-- Porta de entrada de TODA RPC administrativa. p_write = true exige MFA verificado (aal2).
create or replace function public.study__admin_guard(p_write boolean)
returns uuid
language plpgsql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null or not public.is_study_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_write and coalesce(auth.jwt() ->> 'aal', '') <> 'aal2' then
    raise exception 'mfa_required' using errcode = '42501';
  end if;
  return v_uid;
end;
$$;

create or replace function public.study__admin_audit(
  p_action text, p_question_id uuid, p_subject_id uuid, p_key text, p_version integer, p_detail jsonb
) returns void
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
  insert into public.study_admin_audit (actor_ref, action, question_id, subject_id, external_key, version, detail)
  values (auth.uid(), p_action, p_question_id, p_subject_id, p_key, p_version, coalesce(p_detail, '{}'::jsonb));
end;
$$;

-- Valida o CONTEÚDO de uma questão (enunciado, dificuldade, 5 alternativas, gabarito, explicação, meta).
-- Devolve um array de problemas [{field, message}]; vazio = válido. Não grava nada.
create or replace function public.study__admin_validate_content(p_q jsonb)
returns jsonb
language plpgsql
stable
set search_path = pg_catalog, public
as $$
declare
  v_p     jsonb := '[]'::jsonb;
  v_opts  jsonb;
  v_l     text;
  v_seen  text[] := '{}';
  v_meta  jsonb;
  v_ref   jsonb;
  v_k     text;
  v_i     integer;
begin
  if jsonb_typeof(p_q -> 'stem') is distinct from 'string' or char_length(btrim(p_q ->> 'stem')) not between 10 and 2000 then
    v_p := v_p || jsonb_build_object('field', 'stem', 'message', 'texto de 10 a 2000 caracteres');
  end if;

  if p_q ? 'difficulty' and jsonb_typeof(p_q -> 'difficulty') <> 'null' then
    if jsonb_typeof(p_q -> 'difficulty') <> 'number' or (p_q ->> 'difficulty') !~ '^[1-3]$' then
      v_p := v_p || jsonb_build_object('field', 'difficulty', 'message', 'inteiro de 1 a 3');
    end if;
  end if;

  v_opts := p_q -> 'options';
  if jsonb_typeof(v_opts) is distinct from 'object' then
    v_p := v_p || jsonb_build_object('field', 'options', 'message', 'objeto com exatamente as chaves A, B, C, D e E');
  else
    if (select array_agg(k order by k) from jsonb_object_keys(v_opts) k) is distinct from array['A', 'B', 'C', 'D', 'E'] then
      v_p := v_p || jsonb_build_object('field', 'options', 'message', 'deve ter exatamente as chaves A, B, C, D e E');
    end if;
    foreach v_l in array array['A', 'B', 'C', 'D', 'E'] loop
      if jsonb_typeof(v_opts -> v_l) is distinct from 'string' or char_length(btrim(v_opts ->> v_l)) not between 1 and 600 then
        v_p := v_p || jsonb_build_object('field', 'options.' || v_l, 'message', 'texto de 1 a 600 caracteres');
      else
        if lower(btrim(v_opts ->> v_l)) = any (v_seen) then
          v_p := v_p || jsonb_build_object('field', 'options.' || v_l, 'message', 'alternativa repetida');
        end if;
        v_seen := v_seen || lower(btrim(v_opts ->> v_l));
      end if;
    end loop;
  end if;

  if jsonb_typeof(p_q -> 'correct') is distinct from 'string' or (p_q ->> 'correct') !~ '^[A-E]$' then
    v_p := v_p || jsonb_build_object('field', 'correct', 'message', 'letra A, B, C, D ou E');
  end if;

  if jsonb_typeof(p_q -> 'explanation') is distinct from 'string' or char_length(btrim(p_q ->> 'explanation')) not between 10 and 4000 then
    v_p := v_p || jsonb_build_object('field', 'explanation', 'message', 'texto de 10 a 4000 caracteres');
  end if;

  v_meta := p_q -> 'meta';
  if v_meta is not null and jsonb_typeof(v_meta) <> 'null' then
    if jsonb_typeof(v_meta) <> 'object' then
      v_p := v_p || jsonb_build_object('field', 'meta', 'message', 'deve ser um objeto');
    else
      for v_k in select jsonb_object_keys(v_meta) loop
        if v_k not in ('technical_references', 'origin_status', 'origin_note', 'editorial_note') then
          v_p := v_p || jsonb_build_object('field', 'meta.' || v_k, 'message', 'campo desconhecido');
        end if;
      end loop;
      if v_meta ? 'technical_references' then
        if jsonb_typeof(v_meta -> 'technical_references') <> 'array' or jsonb_array_length(v_meta -> 'technical_references') > 20 then
          v_p := v_p || jsonb_build_object('field', 'meta.technical_references', 'message', 'lista de até 20 referências');
        else
          for v_i in 0 .. jsonb_array_length(v_meta -> 'technical_references') - 1 loop
            v_ref := (v_meta -> 'technical_references') -> v_i;
            if jsonb_typeof(v_ref) <> 'object'
               or jsonb_typeof(v_ref -> 'title') is distinct from 'string'
               or char_length(btrim(v_ref ->> 'title')) not between 1 and 200 then
              v_p := v_p || jsonb_build_object('field', 'meta.technical_references[' || v_i || ']', 'message', 'objeto com title de 1 a 200 caracteres');
            else
              for v_k in select jsonb_object_keys(v_ref) loop
                if v_k not in ('title', 'url', 'note', 'verified') then
                  v_p := v_p || jsonb_build_object('field', 'meta.technical_references[' || v_i || '].' || v_k, 'message', 'campo desconhecido');
                end if;
              end loop;
              if v_ref ? 'url' and (jsonb_typeof(v_ref -> 'url') <> 'string' or (v_ref ->> 'url') !~ '^https?://[^[:space:]]+$'
                                    or char_length(v_ref ->> 'url') > 500) then
                v_p := v_p || jsonb_build_object('field', 'meta.technical_references[' || v_i || '].url', 'message', 'URL http(s) de até 500 caracteres');
              end if;
              if v_ref ? 'note' and (jsonb_typeof(v_ref -> 'note') <> 'string' or char_length(v_ref ->> 'note') > 500) then
                v_p := v_p || jsonb_build_object('field', 'meta.technical_references[' || v_i || '].note', 'message', 'texto de até 500 caracteres');
              end if;
              if v_ref ? 'verified' and jsonb_typeof(v_ref -> 'verified') <> 'boolean' then
                v_p := v_p || jsonb_build_object('field', 'meta.technical_references[' || v_i || '].verified', 'message', 'true ou false');
              end if;
            end if;
          end loop;
          -- mesmo cálculo da constraint de study_question_meta: octet_length do JSONB convertido em texto (bytes, não caracteres)
          if octet_length((v_meta -> 'technical_references')::text) > 12000 then
            v_p := v_p || jsonb_build_object('field', 'meta.technical_references',
              'message', 'tamanho máximo de 12000 bytes (tem ' || octet_length((v_meta -> 'technical_references')::text) || ')');
          end if;
        end if;
      end if;
      if v_meta ? 'origin_status' and (jsonb_typeof(v_meta -> 'origin_status') <> 'string'
         or (v_meta ->> 'origin_status') not in ('not_proven', 'author_original', 'licensed', 'public_domain')) then
        v_p := v_p || jsonb_build_object('field', 'meta.origin_status', 'message', 'not_proven, author_original, licensed ou public_domain');
      end if;
      if v_meta ? 'origin_note' and jsonb_typeof(v_meta -> 'origin_note') not in ('string', 'null') then
        v_p := v_p || jsonb_build_object('field', 'meta.origin_note', 'message', 'texto de até 500 caracteres');
      elsif jsonb_typeof(v_meta -> 'origin_note') = 'string' and char_length(v_meta ->> 'origin_note') > 500 then
        v_p := v_p || jsonb_build_object('field', 'meta.origin_note', 'message', 'texto de até 500 caracteres');
      end if;
      if v_meta ? 'editorial_note' and jsonb_typeof(v_meta -> 'editorial_note') not in ('string', 'null') then
        v_p := v_p || jsonb_build_object('field', 'meta.editorial_note', 'message', 'texto de até 2000 caracteres');
      elsif jsonb_typeof(v_meta -> 'editorial_note') = 'string' and char_length(v_meta ->> 'editorial_note') > 2000 then
        v_p := v_p || jsonb_build_object('field', 'meta.editorial_note', 'message', 'texto de até 2000 caracteres');
      end if;
    end if;
  end if;
  return v_p;
end;
$$;

-- Insere questão + 5 alternativas + gabarito + explicação + meta, sempre como RASCUNHO (nunca publica).
create or replace function public.study__admin_create_question(
  p_uid uuid, p_key text, p_version integer, p_subject_id uuid, p_q jsonb, p_batch text, p_supersedes uuid
) returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_id      uuid;
  v_l       text;
  v_opt     uuid;
  v_correct uuid;
  v_meta    jsonb := case when jsonb_typeof(p_q -> 'meta') = 'object' then p_q -> 'meta' else '{}'::jsonb end;
begin
  insert into public.study_questions (subject_id, stem, difficulty, status, external_key, version, supersedes_id, created_by)
  values (p_subject_id, btrim(p_q ->> 'stem'), coalesce(nullif(p_q ->> 'difficulty', '')::integer, 2), 'draft',
          p_key, p_version, p_supersedes, p_uid)
  returning id into v_id;
  foreach v_l in array array['A', 'B', 'C', 'D', 'E'] loop
    insert into public.study_question_options (question_id, label, body)
    values (v_id, v_l, btrim(p_q -> 'options' ->> v_l)) returning id into v_opt;
    if v_l = p_q ->> 'correct' then v_correct := v_opt; end if;
  end loop;
  insert into public.study_answer_keys (question_id, option_id) values (v_id, v_correct);
  insert into public.study_explanations (question_id, body) values (v_id, btrim(p_q ->> 'explanation'));
  insert into public.study_question_meta (question_id, technical_references, origin_status, origin_note, editorial_note, import_batch)
  values (v_id,
          coalesce(v_meta -> 'technical_references', '[]'::jsonb),
          coalesce(v_meta ->> 'origin_status', 'not_proven'),
          nullif(v_meta ->> 'origin_note', ''),
          nullif(v_meta ->> 'editorial_note', ''),
          p_batch);
  return v_id;
end;
$$;

-- Lista os campos em que a questão existente DIFERE do conteúdo recebido (vazio = igual).
create or replace function public.study__admin_diff_question(p_id uuid, p_q jsonb, p_subject_id uuid)
returns text[]
language plpgsql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_q    public.study_questions;
  v_d    text[] := '{}';
  v_l    text;
  v_m    public.study_question_meta;
  v_in   jsonb := case when jsonb_typeof(p_q -> 'meta') = 'object' then p_q -> 'meta' else '{}'::jsonb end;
begin
  select * into v_q from public.study_questions where id = p_id;
  if v_q.subject_id is distinct from p_subject_id then v_d := array_append(v_d, 'subject'); end if;
  if v_q.stem is distinct from btrim(p_q ->> 'stem') then v_d := array_append(v_d, 'stem'); end if;
  if v_q.difficulty is distinct from coalesce(nullif(p_q ->> 'difficulty', '')::integer, 2) then v_d := array_append(v_d, 'difficulty'); end if;
  foreach v_l in array array['A', 'B', 'C', 'D', 'E'] loop
    if (select o.body from public.study_question_options o where o.question_id = p_id and o.label = v_l)
       is distinct from btrim(p_q -> 'options' ->> v_l) then
      v_d := array_append(v_d, 'option_' || v_l);
    end if;
  end loop;
  if (select o.label::text from public.study_answer_keys k join public.study_question_options o on o.id = k.option_id where k.question_id = p_id)
     is distinct from (p_q ->> 'correct') then
    v_d := array_append(v_d, 'correct');
  end if;
  if (select e.body from public.study_explanations e where e.question_id = p_id) is distinct from btrim(p_q ->> 'explanation') then
    v_d := array_append(v_d, 'explanation');
  end if;
  select * into v_m from public.study_question_meta where question_id = p_id;
  if coalesce(v_m.technical_references, '[]'::jsonb) is distinct from coalesce(v_in -> 'technical_references', '[]'::jsonb) then
    v_d := array_append(v_d, 'meta.technical_references');
  end if;
  if coalesce(v_m.origin_status, 'not_proven') is distinct from coalesce(v_in ->> 'origin_status', 'not_proven') then
    v_d := array_append(v_d, 'meta.origin_status');
  end if;
  if v_m.origin_note is distinct from nullif(v_in ->> 'origin_note', '') then v_d := array_append(v_d, 'meta.origin_note'); end if;
  if v_m.editorial_note is distinct from nullif(v_in ->> 'editorial_note', '') then v_d := array_append(v_d, 'meta.editorial_note'); end if;
  return v_d;
end;
$$;

-- Monta o JSON completo de uma questão para a tela do administrador (inclui gabarito: só admin chega aqui).
create or replace function public.study__admin_question_json(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_q public.study_questions;
  v_s public.study_subjects;
  v_m public.study_question_meta;
begin
  select * into v_q from public.study_questions where id = p_id;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  select * into v_s from public.study_subjects where id = v_q.subject_id;
  select * into v_m from public.study_question_meta where question_id = p_id;
  return jsonb_build_object(
    'id', v_q.id,
    'external_key', v_q.external_key,
    'version', v_q.version,
    'is_latest', not exists (select 1 from public.study_questions x
                              where x.external_key is not null and x.external_key = v_q.external_key and x.version > v_q.version),
    'status', v_q.status,
    'stem', v_q.stem,
    'difficulty', v_q.difficulty,
    'subject', jsonb_build_object('id', v_s.id, 'slug', v_s.slug, 'name', v_s.name, 'active', v_s.active),
    'options', (select coalesce(jsonb_agg(jsonb_build_object('label', o.label::text, 'body', o.body) order by o.label), '[]'::jsonb)
                  from public.study_question_options o where o.question_id = p_id),
    'correct_label', (select o.label::text from public.study_answer_keys k join public.study_question_options o on o.id = k.option_id where k.question_id = p_id),
    'explanation', (select e.body from public.study_explanations e where e.question_id = p_id),
    'meta', jsonb_build_object(
      'technical_references', coalesce(v_m.technical_references, '[]'::jsonb),
      'origin_status', coalesce(v_m.origin_status, 'not_proven'),
      'origin_note', v_m.origin_note,
      'editorial_note', v_m.editorial_note,
      'import_batch', v_m.import_batch),
    'audit', jsonb_build_object(
      'created_by_ref', v_q.created_by_ref, 'reviewed_by_ref', v_q.reviewed_by_ref,
      'created_at', v_q.created_at, 'updated_at', v_q.updated_at,
      'reviewed_at', v_q.reviewed_at, 'published_at', v_q.published_at,
      'no_real_patient_data_confirmed', v_q.no_real_patient_data_confirmed),
    'supersedes_id', v_q.supersedes_id,
    'source_note', v_q.source_note,
    'student_visible', (v_q.status = 'published' and v_s.active),
    'versions', (select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'version', x.version, 'status', x.status) order by x.version), '[]'::jsonb)
                   from public.study_questions x where v_q.external_key is not null and x.external_key = v_q.external_key)
  );
end;
$$;

-- ── 6. RPCs: assuntos ─────────────────────────────────────────────────────────────────
create or replace function public.study_admin_list_subjects()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
  perform public.study__admin_guard(false);
  return (select coalesce(jsonb_agg(jsonb_build_object(
            'id', s.id, 'slug', s.slug, 'name', s.name, 'description', s.description,
            'position', s.position, 'active', s.active,
            'counts', jsonb_build_object(
              'draft',     (select count(*) from public.study_questions q where q.subject_id = s.id and q.status = 'draft'),
              'in_review', (select count(*) from public.study_questions q where q.subject_id = s.id and q.status = 'in_review'),
              'published', (select count(*) from public.study_questions q where q.subject_id = s.id and q.status = 'published'),
              'archived',  (select count(*) from public.study_questions q where q.subject_id = s.id and q.status = 'archived')))
          order by s.position, s.name), '[]'::jsonb)
          from public.study_subjects s);
end;
$$;

-- p_id nulo = cria (slug obrigatório; nasce INATIVO salvo p_active = true). p_id informado = edita (slug imutável).
create or replace function public.study_admin_save_subject(
  p_id uuid, p_slug text, p_name text, p_description text, p_position integer, p_active boolean
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_uid uuid := public.study__admin_guard(true);
  v_s   public.study_subjects;
begin
  if p_name is null or char_length(btrim(p_name)) not between 2 and 80 then
    raise exception 'invalid_payload' using errcode = 'P0001', detail = 'name: texto de 2 a 80 caracteres';
  end if;
  if p_description is not null and char_length(p_description) > 300 then
    raise exception 'invalid_payload' using errcode = 'P0001', detail = 'description: até 300 caracteres';
  end if;
  if p_position is not null and p_position not between 0 and 10000 then
    raise exception 'invalid_payload' using errcode = 'P0001', detail = 'position: inteiro de 0 a 10000';
  end if;

  if p_id is null then
    if p_slug is null or p_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then
      raise exception 'invalid_payload' using errcode = 'P0001', detail = 'slug: minúsculas, números e hífens';
    end if;
    begin
      insert into public.study_subjects (slug, name, description, position, active)
      values (p_slug, btrim(p_name), nullif(btrim(coalesce(p_description, '')), ''), coalesce(p_position, 0), coalesce(p_active, false))
      returning * into v_s;
    exception when unique_violation then
      raise exception 'slug_taken' using errcode = 'P0001';
    end;
    perform public.study__admin_audit('create_subject', null, v_s.id, null, null, jsonb_build_object('slug', v_s.slug, 'active', v_s.active));
  else
    select * into v_s from public.study_subjects where id = p_id for update;
    if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
    if p_slug is not null and p_slug is distinct from v_s.slug then
      raise exception 'slug_immutable' using errcode = 'P0001';
    end if;
    update public.study_subjects
       set name = btrim(p_name),
           description = case when p_description is null then description else nullif(btrim(p_description), '') end,
           position = coalesce(p_position, position),
           active = coalesce(p_active, active)
     where id = p_id
     returning * into v_s;
    perform public.study__admin_audit('update_subject', null, v_s.id, null, null, jsonb_build_object('slug', v_s.slug, 'active', v_s.active));
  end if;

  return (select x from jsonb_array_elements(public.study_admin_list_subjects()) x where (x ->> 'id')::uuid = v_s.id);
end;
$$;

-- ── 7. RPCs: leitura de questões ─────────────────────────────────────────────────────────
create or replace function public.study_admin_list_questions(
  p_status text[] default null,
  p_subject_id uuid default null,
  p_search text default null,
  p_limit integer default 50,
  p_offset integer default 0,
  p_latest_only boolean default false
) returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_limit  integer := least(greatest(coalesce(p_limit, 50), 1), 200);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_search text := nullif(lower(btrim(coalesce(p_search, ''))), '');
  v_status public.study_content_status[];
  v_total  integer;
  v_items  jsonb;
begin
  perform public.study__admin_guard(false);
  if v_search is not null and char_length(v_search) > 100 then
    raise exception 'invalid_filter' using errcode = 'P0001', detail = 'search: até 100 caracteres';
  end if;
  if p_status is not null then
    begin
      v_status := p_status::public.study_content_status[];
    exception when others then
      raise exception 'invalid_filter' using errcode = 'P0001', detail = 'status: draft, in_review, published ou archived';
    end;
  end if;

  with f as (
    select q.*
      from public.study_questions q
     where (v_status is null or q.status = any (v_status))
       and (p_subject_id is null or q.subject_id = p_subject_id)
       and (v_search is null or strpos(lower(q.stem), v_search) > 0 or strpos(lower(coalesce(q.external_key, '')), v_search) > 0)
       and (not coalesce(p_latest_only, false) or q.external_key is null
            or not exists (select 1 from public.study_questions x where x.external_key = q.external_key and x.version > q.version))
  )
  select count(*) into v_total from f;

  select coalesce(jsonb_agg(row_to_json(r)::jsonb), '[]'::jsonb) into v_items from (
    select q.id, q.external_key, q.version, q.status, q.subject_id, s.slug as subject_slug, s.name as subject_name,
           left(q.stem, 160) as stem_preview, q.difficulty, q.updated_at, q.published_at,
           (q.external_key is null or not exists (select 1 from public.study_questions x where x.external_key = q.external_key and x.version > q.version)) as is_latest,
           (q.status = 'published' and s.active) as student_visible
      from public.study_questions q
      join public.study_subjects s on s.id = q.subject_id
     where (v_status is null or q.status = any (v_status))
       and (p_subject_id is null or q.subject_id = p_subject_id)
       and (v_search is null or strpos(lower(q.stem), v_search) > 0 or strpos(lower(coalesce(q.external_key, '')), v_search) > 0)
       and (not coalesce(p_latest_only, false) or q.external_key is null
            or not exists (select 1 from public.study_questions x where x.external_key = q.external_key and x.version > q.version))
     order by q.updated_at desc, q.id
     limit v_limit offset v_offset
  ) r;

  return jsonb_build_object('total', v_total, 'limit', v_limit, 'offset', v_offset, 'items', v_items);
end;
$$;

create or replace function public.study_admin_get_question(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
  perform public.study__admin_guard(false);
  return public.study__admin_question_json(p_id);
end;
$$;

-- ── 8. RPCs: rascunhos ──────────────────────────────────────────────────────────────────
-- Contrato do payload (jsonb): { id?, expected_updated_at?, subject_id | subject_slug, external_key?, stem, difficulty?,
--   options:{A..E}, correct:"A".."E", explanation, meta?:{technical_references[], origin_status, origin_note, editorial_note} }
-- Sem id = cria rascunho (versão 1; chave gerada se não vier). Com id = edita SÓ rascunho/em revisão.
create or replace function public.study_admin_save_draft_question(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_uid      uuid := public.study__admin_guard(true);
  v_allowed  text[] := array['id', 'expected_updated_at', 'subject_id', 'subject_slug', 'external_key', 'stem', 'difficulty',
                             'options', 'correct', 'explanation', 'meta'];
  v_k        text;
  v_p        jsonb;
  v_id       uuid;
  v_q        public.study_questions;
  v_subject  uuid;
  v_key      text;
  v_l        text;
  v_opt      uuid;
  v_correct  uuid;
  v_meta     jsonb;
  v_exp_ts   timestamptz;
begin
  if jsonb_typeof(p_payload) is distinct from 'object' then
    raise exception 'invalid_payload' using errcode = 'P0001', detail = 'o payload deve ser um objeto JSON';
  end if;
  for v_k in select jsonb_object_keys(p_payload) loop
    if not (v_k = any (v_allowed)) then
      raise exception 'invalid_payload' using errcode = 'P0001', detail = 'campo desconhecido: ' || v_k;
    end if;
  end loop;

  v_p := public.study__admin_validate_content(p_payload);

  -- id
  if p_payload ? 'id' and jsonb_typeof(p_payload -> 'id') <> 'null' then
    begin v_id := (p_payload ->> 'id')::uuid;
    exception when others then v_p := v_p || jsonb_build_object('field', 'id', 'message', 'UUID inválido'); end;
  end if;
  -- assunto
  if p_payload ? 'subject_id' and jsonb_typeof(p_payload -> 'subject_id') = 'string' then
    begin v_subject := (p_payload ->> 'subject_id')::uuid;
    exception when others then v_p := v_p || jsonb_build_object('field', 'subject_id', 'message', 'UUID inválido'); end;
    if v_subject is not null and not exists (select 1 from public.study_subjects where id = v_subject) then
      v_p := v_p || jsonb_build_object('field', 'subject_id', 'message', 'assunto inexistente');
      v_subject := null;
    end if;
  elsif p_payload ? 'subject_slug' and jsonb_typeof(p_payload -> 'subject_slug') = 'string' then
    select id into v_subject from public.study_subjects where slug = p_payload ->> 'subject_slug';
    if v_subject is null then v_p := v_p || jsonb_build_object('field', 'subject_slug', 'message', 'assunto inexistente'); end if;
  end if;
  if p_payload ? 'external_key' and jsonb_typeof(p_payload -> 'external_key') <> 'null'
     and (jsonb_typeof(p_payload -> 'external_key') <> 'string' or (p_payload ->> 'external_key') !~ '^[A-Za-z0-9][A-Za-z0-9._-]{2,63}$') then
    v_p := v_p || jsonb_build_object('field', 'external_key', 'message', 'de 3 a 64 caracteres: letras, números, ponto, hífen e sublinhado');
  end if;
  if p_payload ? 'expected_updated_at' and jsonb_typeof(p_payload -> 'expected_updated_at') <> 'null' then
    begin v_exp_ts := (p_payload ->> 'expected_updated_at')::timestamptz;
    exception when others then v_p := v_p || jsonb_build_object('field', 'expected_updated_at', 'message', 'data/hora inválida'); end;
  end if;

  if v_id is null and v_subject is null and not exists (select 1 from jsonb_array_elements(v_p) e where e ->> 'field' in ('subject_id', 'subject_slug')) then
    v_p := v_p || jsonb_build_object('field', 'subject_id', 'message', 'informe subject_id ou subject_slug');
  end if;
  if jsonb_array_length(v_p) > 0 then
    raise exception 'invalid_payload' using errcode = 'P0001', detail = v_p::text;
  end if;

  if v_id is null then
    -- cria rascunho versão 1
    v_key := nullif(p_payload ->> 'external_key', '');
    if v_key is null then
      v_key := 'APP-' || to_char(timezone('utc', now()), 'YYYYMMDD') || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 6);
    end if;
    if exists (select 1 from public.study_questions where external_key = v_key) then
      raise exception 'key_taken' using errcode = 'P0001', detail = 'já existe questão com esta external_key (use nova versão para corrigir)';
    end if;
    v_id := public.study__admin_create_question(v_uid, v_key, 1, v_subject, p_payload, null, null);
    perform public.study__admin_audit('create_draft', v_id, v_subject, v_key, 1, '{}'::jsonb);
  else
    select * into v_q from public.study_questions where id = v_id for update;
    if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
    if v_q.status not in ('draft', 'in_review') then
      raise exception 'not_editable' using errcode = 'P0001', detail = 'questão publicada ou arquivada é imutável: crie uma nova versão';
    end if;
    if v_exp_ts is not null and v_exp_ts is distinct from v_q.updated_at then
      raise exception 'stale_write' using errcode = 'P0001', detail = 'a questão foi alterada por outra sessão; recarregue';
    end if;
    if p_payload ? 'external_key' and jsonb_typeof(p_payload -> 'external_key') = 'string'
       and (p_payload ->> 'external_key') is distinct from v_q.external_key then
      raise exception 'invalid_payload' using errcode = 'P0001', detail = 'external_key é imutável';
    end if;
    update public.study_questions
       set subject_id = coalesce(v_subject, subject_id),
           stem = btrim(p_payload ->> 'stem'),
           difficulty = coalesce(nullif(p_payload ->> 'difficulty', '')::integer, 2)
     where id = v_id;
    -- troca atômica de alternativas, gabarito e explicação (chave primeiro, por causa da FK)
    delete from public.study_answer_keys where question_id = v_id;
    delete from public.study_question_options where question_id = v_id;
    foreach v_l in array array['A', 'B', 'C', 'D', 'E'] loop
      insert into public.study_question_options (question_id, label, body)
      values (v_id, v_l, btrim(p_payload -> 'options' ->> v_l)) returning id into v_opt;
      if v_l = p_payload ->> 'correct' then v_correct := v_opt; end if;
    end loop;
    insert into public.study_answer_keys (question_id, option_id) values (v_id, v_correct);
    insert into public.study_explanations (question_id, body) values (v_id, btrim(p_payload ->> 'explanation'))
      on conflict (question_id) do update set body = excluded.body;
    if jsonb_typeof(p_payload -> 'meta') = 'object' then
      v_meta := p_payload -> 'meta';
      insert into public.study_question_meta (question_id, technical_references, origin_status, origin_note, editorial_note)
      values (v_id, coalesce(v_meta -> 'technical_references', '[]'::jsonb), coalesce(v_meta ->> 'origin_status', 'not_proven'),
              nullif(v_meta ->> 'origin_note', ''), nullif(v_meta ->> 'editorial_note', ''))
      on conflict (question_id) do update
        set technical_references = excluded.technical_references, origin_status = excluded.origin_status,
            origin_note = excluded.origin_note, editorial_note = excluded.editorial_note;
    end if;
    perform public.study__admin_audit('update_draft', v_id, coalesce(v_subject, v_q.subject_id), v_q.external_key, v_q.version, '{}'::jsonb);
  end if;
  return public.study__admin_question_json(v_id);
end;
$$;

-- Metadados (referências, origem, notas) podem ser corrigidos em qualquer status: não fazem parte do que o aluno vê.
create or replace function public.study_admin_save_question_meta(p_id uuid, p_meta jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_uid uuid := public.study__admin_guard(true);
  v_q   public.study_questions;
  v_p   jsonb;
begin
  select * into v_q from public.study_questions where id = p_id for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if jsonb_typeof(p_meta) is distinct from 'object' then
    raise exception 'invalid_payload' using errcode = 'P0001', detail = 'meta deve ser um objeto';
  end if;
  v_p := public.study__admin_validate_content(jsonb_build_object(
           'stem', 'validação apenas dos metadados', 'options', jsonb_build_object('A', 'a', 'B', 'b', 'C', 'c', 'D', 'd', 'E', 'e'),
           'correct', 'A', 'explanation', 'validação apenas dos metadados', 'meta', p_meta));
  if jsonb_array_length(v_p) > 0 then
    raise exception 'invalid_payload' using errcode = 'P0001', detail = v_p::text;
  end if;
  insert into public.study_question_meta (question_id, technical_references, origin_status, origin_note, editorial_note)
  values (p_id, coalesce(p_meta -> 'technical_references', '[]'::jsonb), coalesce(p_meta ->> 'origin_status', 'not_proven'),
          nullif(p_meta ->> 'origin_note', ''), nullif(p_meta ->> 'editorial_note', ''))
  on conflict (question_id) do update
    set technical_references = excluded.technical_references, origin_status = excluded.origin_status,
        origin_note = excluded.origin_note, editorial_note = excluded.editorial_note;
  perform public.study__admin_audit('save_meta', p_id, v_q.subject_id, v_q.external_key, v_q.version, '{}'::jsonb);
  return public.study__admin_question_json(p_id);
end;
$$;

create or replace function public.study_admin_delete_draft(p_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_uid uuid := public.study__admin_guard(true);
  v_q   public.study_questions;
begin
  select * into v_q from public.study_questions where id = p_id for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if v_q.status <> 'draft' then raise exception 'invalid_status' using errcode = 'P0001'; end if;
  delete from public.study_answer_keys where question_id = p_id;
  delete from public.study_explanations where question_id = p_id;
  delete from public.study_question_options where question_id = p_id;
  delete from public.study_questions where id = p_id;
  perform public.study__admin_audit('delete_draft', p_id, v_q.subject_id, v_q.external_key, v_q.version, '{}'::jsonb);
end;
$$;

-- ── 9. RPC: importação (simulação e gravação atômica, sempre como rascunho) ─────────────────────
-- Contrato (jsonb): { "format":"fslobo.study-import/1", "batch_id":"lote-02",
--   "questions":[ { external_key, version?, subject_slug, stem, difficulty?, options:{A..E}, correct, explanation, meta? } ] }
-- Resultado por item: new | equal | divergent | invalid. Nunca sobrescreve: divergente e inválido impedem a gravação.
-- p_dry_run = true (padrão): só simula (exige administrador, sem MFA). false: grava TUDO ou NADA (exige MFA).
create or replace function public.study_admin_import_questions(p_batch jsonb, p_dry_run boolean default true)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_dry     boolean := coalesce(p_dry_run, true);
  v_uid     uuid := public.study__admin_guard(not coalesce(p_dry_run, true));
  v_batch   text;
  v_items   jsonb;
  v_n       integer;
  v_allowed text[] := array['external_key', 'version', 'subject_slug', 'stem', 'difficulty', 'options', 'correct', 'explanation', 'meta'];
  v_report  jsonb := '[]'::jsonb;
  v_new_idx integer[] := '{}';
  v_new_sub uuid[] := '{}';
  v_new_prev uuid[] := '{}';
  v_i       integer;
  v_it      jsonb;
  v_prob    jsonb;
  v_warn    jsonb;
  v_key     text;
  v_ver     integer;
  v_subject uuid;
  v_exist   uuid;
  v_prev    uuid;
  v_diffs   text[];
  v_out     text;
  v_k       text;
  v_seen    text[] := '{}';
  c_new int := 0; c_equal int := 0; c_div int := 0; c_inv int := 0;
  v_applied boolean;
  v_id      uuid;
  v_keys    jsonb := '[]'::jsonb;
  v_status  text;
begin
  if jsonb_typeof(p_batch) is distinct from 'object' then
    raise exception 'invalid_batch' using errcode = 'P0001', detail = 'o lote deve ser um objeto JSON';
  end if;
  if octet_length(p_batch::text) > 2000000 then
    raise exception 'payload_too_large' using errcode = 'P0001', detail = 'o lote passa de 2 MB';
  end if;
  for v_k in select jsonb_object_keys(p_batch) loop
    if v_k not in ('format', 'batch_id', 'questions') then
      raise exception 'invalid_batch' using errcode = 'P0001', detail = 'campo desconhecido no lote: ' || v_k;
    end if;
  end loop;
  if coalesce(p_batch ->> 'format', '') <> 'fslobo.study-import/1' then
    raise exception 'invalid_batch' using errcode = 'P0001', detail = 'format deve ser fslobo.study-import/1';
  end if;
  v_batch := p_batch ->> 'batch_id';
  if v_batch is null or v_batch !~ '^[A-Za-z0-9][A-Za-z0-9._-]{1,59}$' then
    raise exception 'invalid_batch' using errcode = 'P0001', detail = 'batch_id: 2 a 60 caracteres (letras, números, ponto, hífen, sublinhado)';
  end if;
  v_items := p_batch -> 'questions';
  if jsonb_typeof(v_items) is distinct from 'array' then
    raise exception 'invalid_batch' using errcode = 'P0001', detail = 'questions deve ser uma lista';
  end if;
  v_n := jsonb_array_length(v_items);
  if v_n = 0 then raise exception 'empty_batch' using errcode = 'P0001'; end if;
  if v_n > 200 then raise exception 'batch_too_large' using errcode = 'P0001', detail = 'no máximo 200 questões por lote'; end if;

  if not v_dry then perform pg_advisory_xact_lock(hashtextextended('study-admin-import', 0)); end if;

  for v_i in 0 .. v_n - 1 loop
    v_it := v_items -> v_i;
    v_prob := '[]'::jsonb; v_warn := '[]'::jsonb; v_diffs := '{}'; v_exist := null; v_prev := null;
    v_key := null; v_ver := 1; v_subject := null; v_out := null;

    if jsonb_typeof(v_it) is distinct from 'object' then
      v_prob := v_prob || jsonb_build_object('field', 'item', 'message', 'cada questão deve ser um objeto');
    else
      for v_k in select jsonb_object_keys(v_it) loop
        if not (v_k = any (v_allowed)) then
          v_prob := v_prob || jsonb_build_object('field', v_k, 'message', 'campo desconhecido');
        end if;
      end loop;
      if jsonb_typeof(v_it -> 'external_key') = 'string' and (v_it ->> 'external_key') ~ '^[A-Za-z0-9][A-Za-z0-9._-]{2,63}$' then
        v_key := v_it ->> 'external_key';
      else
        v_prob := v_prob || jsonb_build_object('field', 'external_key', 'message', 'obrigatória: 3 a 64 caracteres (letras, números, ponto, hífen, sublinhado)');
      end if;
      if v_it ? 'version' and jsonb_typeof(v_it -> 'version') <> 'null' then
        if jsonb_typeof(v_it -> 'version') = 'number' and (v_it ->> 'version') ~ '^[1-9][0-9]{0,3}$' then
          v_ver := (v_it ->> 'version')::integer;
        else
          v_prob := v_prob || jsonb_build_object('field', 'version', 'message', 'inteiro de 1 a 9999');
        end if;
      end if;
      v_prob := v_prob || public.study__admin_validate_content(v_it);
      if jsonb_typeof(v_it -> 'subject_slug') = 'string' then
        select id into v_subject from public.study_subjects where slug = v_it ->> 'subject_slug';
      end if;
      if v_subject is null then
        v_prob := v_prob || jsonb_build_object('field', 'subject_slug', 'message', 'assunto inexistente (crie o assunto antes de importar)');
      end if;
      if v_key is not null then
        if (v_key || '#' || v_ver) = any (v_seen) then
          v_prob := v_prob || jsonb_build_object('field', 'external_key', 'message', 'chave e versão repetidas dentro do lote');
        end if;
        v_seen := v_seen || (v_key || '#' || v_ver);
      end if;
    end if;

    if jsonb_array_length(v_prob) > 0 then
      v_out := 'invalid'; c_inv := c_inv + 1;
    else
      select id, status::text into v_exist, v_status from public.study_questions where external_key = v_key and version = v_ver;
      if v_exist is not null then
        v_diffs := public.study__admin_diff_question(v_exist, v_it, v_subject);
        if cardinality(v_diffs) = 0 then v_out := 'equal'; c_equal := c_equal + 1;
        else v_out := 'divergent'; c_div := c_div + 1; end if;
      else
        if v_ver > 1 then
          select id into v_prev from public.study_questions where external_key = v_key and version = v_ver - 1;
          if v_prev is null then
            v_prob := v_prob || jsonb_build_object('field', 'version', 'message', 'a versão anterior (' || (v_ver - 1) || ') não existe no banco');
          end if;
        end if;
        if exists (select 1 from public.study_questions where external_key = v_key and status in ('draft', 'in_review')) then
          v_prob := v_prob || jsonb_build_object('field', 'external_key', 'message', 'já existe rascunho aberto para esta chave');
        end if;
        if jsonb_array_length(v_prob) > 0 then
          v_out := 'invalid'; c_inv := c_inv + 1;
        else
          v_out := 'new'; c_new := c_new + 1;
          v_new_idx := v_new_idx || v_i; v_new_sub := v_new_sub || v_subject; v_new_prev := v_new_prev || v_prev;
        end if;
      end if;
      if exists (select 1 from public.study_questions q
                  where lower(btrim(q.stem)) = lower(btrim(v_it ->> 'stem'))
                    and (q.external_key is distinct from v_key)) then
        v_warn := v_warn || jsonb_build_object('code', 'duplicate_stem', 'message', 'já existe outra questão com o mesmo enunciado');
      end if;
    end if;

    v_report := v_report || jsonb_build_object(
      'index', v_i, 'external_key', v_key, 'version', v_ver, 'outcome', v_out,
      'id', v_exist, 'status', v_status,
      'problems', v_prob, 'diffs', to_jsonb(v_diffs), 'warnings', v_warn);
    v_status := null;
  end loop;

  v_applied := (not v_dry) and c_inv = 0 and c_div = 0;
  if v_applied then
    for v_i in 1 .. coalesce(cardinality(v_new_idx), 0) loop
      v_it := v_items -> v_new_idx[v_i];
      v_id := public.study__admin_create_question(v_uid, v_it ->> 'external_key', coalesce(nullif(v_it ->> 'version', '')::integer, 1),
                                                  v_new_sub[v_i], v_it, v_batch, v_new_prev[v_i]);
      v_report := jsonb_set(v_report, array[(v_new_idx[v_i])::text, 'id'], to_jsonb(v_id));
      v_keys := v_keys || to_jsonb(v_it ->> 'external_key');
    end loop;
  end if;
  if not v_dry then
    perform public.study__admin_audit('import', null, null, null, null, jsonb_build_object(
      'batch_id', v_batch, 'applied', v_applied, 'new', c_new, 'equal', c_equal, 'divergent', c_div, 'invalid', c_inv, 'created_keys', v_keys));
  end if;

  return jsonb_build_object(
    'format', 'fslobo.study-import/1', 'batch_id', v_batch, 'dry_run', v_dry, 'applied', v_applied,
    'can_apply', (c_inv = 0 and c_div = 0),
    'counts', jsonb_build_object('total', v_n, 'new', c_new, 'equal', c_equal, 'divergent', c_div, 'invalid', c_inv),
    'items', v_report);
end;
$$;

-- ── 10. RPCs: publicar, arquivar, nova versão ────────────────────────────────────────────────────
-- Publica 1 a 100 questões TUDO OU NADA. Grava reviewed_by = quem chama (nunca um campo livre).
-- Se a questão substitui uma versão publicada (supersedes_id), a anterior é arquivada na mesma transação.
create or replace function public.study_admin_publish_questions(p_ids uuid[], p_confirm_no_real_patient_data boolean)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_uid       uuid := public.study__admin_guard(true);
  v_ids       uuid[];
  v_q         public.study_questions;
  v_n         integer;
  v_pub       jsonb := '[]'::jsonb;
  v_arch      jsonb := '[]'::jsonb;
  v_warn      jsonb := '[]'::jsonb;
  v_prev      public.study_questions;
  v_active    boolean;
begin
  if p_confirm_no_real_patient_data is distinct from true then
    raise exception 'patient_data_confirmation_required' using errcode = 'P0001';
  end if;
  select array_agg(distinct x) into v_ids from unnest(p_ids) x;
  if v_ids is null or cardinality(v_ids) not between 1 and 100 then
    raise exception 'invalid_payload' using errcode = 'P0001', detail = 'informe de 1 a 100 questões';
  end if;
  select count(*) into v_n from public.study_questions where id = any (v_ids);
  if v_n <> cardinality(v_ids) then
    raise exception 'not_found' using errcode = 'P0002', detail = 'alguma questão informada não existe';
  end if;

  for v_q in select * from public.study_questions where id = any (v_ids) order by id for update loop
    if v_q.status not in ('draft', 'in_review') then
      raise exception 'invalid_status' using errcode = 'P0001', detail = v_q.id::text;
    end if;
    if (select count(*) from public.study_question_options where question_id = v_q.id) not between 2 and 5 then
      raise exception 'options_incomplete' using errcode = 'P0001', detail = v_q.id::text;
    end if;
    if not exists (select 1 from public.study_answer_keys where question_id = v_q.id) then
      raise exception 'answer_key_missing' using errcode = 'P0001', detail = v_q.id::text;
    end if;
    if not exists (select 1 from public.study_explanations where question_id = v_q.id) then
      raise exception 'explanation_missing' using errcode = 'P0001', detail = v_q.id::text;
    end if;

    update public.study_questions
       set status = 'published', no_real_patient_data_confirmed = true,
           reviewed_by = v_uid, reviewed_at = now(), published_at = now()
     where id = v_q.id;
    v_pub := v_pub || jsonb_build_object('id', v_q.id, 'external_key', v_q.external_key, 'version', v_q.version);
    perform public.study__admin_audit('publish', v_q.id, v_q.subject_id, v_q.external_key, v_q.version, '{}'::jsonb);

    if v_q.supersedes_id is not null then
      select * into v_prev from public.study_questions where id = v_q.supersedes_id for update;
      if found and v_prev.status = 'published' then
        update public.study_questions set status = 'archived' where id = v_prev.id;
        v_arch := v_arch || to_jsonb(v_prev.id);
        perform public.study__admin_audit('archive', v_prev.id, v_prev.subject_id, v_prev.external_key, v_prev.version,
                                          jsonb_build_object('reason', 'superseded', 'by', v_q.id));
      end if;
    end if;
    select active into v_active from public.study_subjects where id = v_q.subject_id;
    if not v_active then
      v_warn := v_warn || jsonb_build_object('id', v_q.id, 'code', 'subject_inactive');
    end if;
  end loop;

  return jsonb_build_object('published', v_pub, 'archived_previous', v_arch, 'warnings', v_warn);
end;
$$;

-- Função já existente: mesma assinatura e mesmos GRANTs; agora delega (e, com isso, exige MFA e gera auditoria).
create or replace function public.study_admin_publish_question(
  p_question_id uuid,
  p_confirm_no_real_patient_data boolean
) returns void
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
  perform public.study_admin_publish_questions(array[p_question_id], p_confirm_no_real_patient_data);
end;
$$;

create or replace function public.study_admin_archive_question(p_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_uid uuid := public.study__admin_guard(true);
  v_q   public.study_questions;
begin
  if p_reason is null or char_length(btrim(p_reason)) not between 3 and 300 then
    raise exception 'invalid_payload' using errcode = 'P0001', detail = 'reason: de 3 a 300 caracteres';
  end if;
  select * into v_q from public.study_questions where id = p_id for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if v_q.status <> 'published' then raise exception 'invalid_status' using errcode = 'P0001'; end if;
  update public.study_questions set status = 'archived' where id = p_id;
  perform public.study__admin_audit('archive', p_id, v_q.subject_id, v_q.external_key, v_q.version, jsonb_build_object('reason', btrim(p_reason)));
  return public.study__admin_question_json(p_id);
end;
$$;

-- Cria o rascunho da PRÓXIMA versão (copia conteúdo e metadados). A versão publicada nunca é alterada.
create or replace function public.study_admin_create_new_version(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_uid uuid := public.study__admin_guard(true);
  v_q   public.study_questions;
  v_new uuid;
  v_src jsonb;
  v_o   jsonb;
begin
  select * into v_q from public.study_questions where id = p_id for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if v_q.status not in ('published', 'archived') then raise exception 'invalid_status' using errcode = 'P0001'; end if;
  if v_q.external_key is null then raise exception 'no_external_key' using errcode = 'P0001'; end if;
  if exists (select 1 from public.study_questions where external_key = v_q.external_key and version > v_q.version) then
    raise exception 'not_latest_version' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.study_questions where external_key = v_q.external_key and status in ('draft', 'in_review')) then
    raise exception 'draft_already_open' using errcode = 'P0001';
  end if;
  v_o := public.study__admin_question_json(p_id);
  v_src := jsonb_build_object(
    'stem', v_o ->> 'stem', 'difficulty', v_q.difficulty,
    'options', (select jsonb_object_agg(x ->> 'label', x ->> 'body') from jsonb_array_elements(v_o -> 'options') x),
    'correct', v_o ->> 'correct_label', 'explanation', v_o ->> 'explanation',
    'meta', jsonb_build_object(
      'technical_references', v_o -> 'meta' -> 'technical_references',
      'origin_status', v_o -> 'meta' ->> 'origin_status',
      'origin_note', v_o -> 'meta' ->> 'origin_note',
      'editorial_note', v_o -> 'meta' ->> 'editorial_note'));
  v_new := public.study__admin_create_question(v_uid, v_q.external_key, v_q.version + 1, v_q.subject_id, v_src, null, v_q.id);
  perform public.study__admin_audit('new_version', v_new, v_q.subject_id, v_q.external_key, v_q.version + 1, jsonb_build_object('from', v_q.id));
  return public.study__admin_question_json(v_new);
end;
$$;

-- ── 11. RPC: trilha de auditoria (somente leitura) ───────────────────────────────────────────────────
create or replace function public.study_admin_list_audit(p_question_id uuid default null, p_limit integer default 50)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
  perform public.study__admin_guard(false);
  return (select coalesce(jsonb_agg(row_to_json(r)::jsonb order by r.id desc), '[]'::jsonb) from (
            select a.id, a.at, a.actor_ref, a.action, a.question_id, a.subject_id, a.external_key, a.version, a.detail
              from public.study_admin_audit a
             where p_question_id is null or a.question_id = p_question_id
             order by a.id desc
             limit least(greatest(coalesce(p_limit, 50), 1), 200)) r);
end;
$$;

-- ── 12. permissões de execução ─────────────────────────────────────────────────────────────────────────
-- Internas: ninguém de navegador executa (as RPCs públicas as chamam como dono, via SECURITY DEFINER).
revoke execute on function public.study__admin_guard(boolean) from public, anon, authenticated;
revoke execute on function public.study__admin_audit(text, uuid, uuid, text, integer, jsonb) from public, anon, authenticated;
revoke execute on function public.study__admin_validate_content(jsonb) from public, anon, authenticated;
revoke execute on function public.study__admin_create_question(uuid, text, integer, uuid, jsonb, text, uuid) from public, anon, authenticated;
revoke execute on function public.study__admin_diff_question(uuid, jsonb, uuid) from public, anon, authenticated;
revoke execute on function public.study__admin_question_json(uuid) from public, anon, authenticated;

-- Públicas (admin): authenticated e service_role; a autorização real é feita DENTRO de cada função.
do $$
declare
  f text;
begin
  foreach f in array array[
    'study_admin_list_subjects()',
    'study_admin_save_subject(uuid, text, text, text, integer, boolean)',
    'study_admin_list_questions(text[], uuid, text, integer, integer, boolean)',
    'study_admin_get_question(uuid)',
    'study_admin_save_draft_question(jsonb)',
    'study_admin_save_question_meta(uuid, jsonb)',
    'study_admin_delete_draft(uuid)',
    'study_admin_import_questions(jsonb, boolean)',
    'study_admin_publish_questions(uuid[], boolean)',
    'study_admin_publish_question(uuid, boolean)',
    'study_admin_archive_question(uuid, text)',
    'study_admin_create_new_version(uuid)',
    'study_admin_list_audit(uuid, integer)'
  ] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated, service_role', f);
  end loop;
end $$;
