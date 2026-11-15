-- Match the existing member editor without exposing guardian names or contact details.
BEGIN;
SET LOCAL lock_timeout = '5s';

ALTER TABLE public.bb_members
  ADD COLUMN IF NOT EXISTS verification_status text,
  ADD COLUMN IF NOT EXISTS parental_consent_signed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS media_consent boolean NOT NULL DEFAULT false;

CREATE TABLE public.bb_admin_member_consents (
  member_id text PRIMARY KEY REFERENCES public.bb_members(ic) ON DELETE CASCADE,
  parent_name text,
  parent_contact text,
  parental_consent_date timestamptz
);
ALTER TABLE public.bb_admin_member_consents ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.bb_admin_member_consents FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.bb_guard_member_review_fields()
RETURNS trigger LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  IF current_user IN ('anon', 'authenticated') THEN
    IF TG_OP = 'INSERT' THEN
      IF coalesce(new.verification_status, 'not_verified') <> 'not_verified' OR new.parental_consent_signed OR new.media_consent THEN
        RAISE EXCEPTION 'Member review requires a verified operation' USING ERRCODE = '42501';
      END IF;
    ELSIF ROW(old.verification_status, old.parental_consent_signed, old.media_consent)
          IS DISTINCT FROM ROW(new.verification_status, new.parental_consent_signed, new.media_consent) THEN
      RAISE EXCEPTION 'Member review requires a verified operation' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN new;
END;
$$;
CREATE TRIGGER bb_guard_member_review_fields BEFORE INSERT OR UPDATE ON public.bb_members
  FOR EACH ROW EXECUTE FUNCTION public.bb_guard_member_review_fields();

CREATE FUNCTION public.bb_require_admin_members(p_token text)
RETURNS void LANGUAGE plpgsql STABLE
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_session json := public.rpc_verify_admin_session(p_token);
BEGIN
  IF NOT (v_session->>'valid')::boolean OR NOT coalesce(v_session->>'scope' = 'super_admin' OR ((v_session->'permissions')::jsonb ? 'members'), false) THEN
    RAISE EXCEPTION 'Member administration session required' USING ERRCODE = '42501';
  END IF;
END;
$$;

CREATE FUNCTION public.rpc_admin_get_member_consent(p_token text, p_member_id text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_consent jsonb;
BEGIN
  PERFORM public.bb_require_admin_members(p_token);
  SELECT jsonb_build_object('parent_name', c.parent_name, 'parent_contact', c.parent_contact,
    'parental_consent_date', c.parental_consent_date, 'parental_consent_signed', m.parental_consent_signed, 'media_consent', m.media_consent)
  INTO v_consent FROM public.bb_members m LEFT JOIN public.bb_admin_member_consents c ON c.member_id = m.ic
  WHERE m.ic = p_member_id;
  RETURN v_consent;
END;
$$;

CREATE FUNCTION public.rpc_admin_save_member(p_token text, p_member_id text, p_create boolean, p_updates jsonb)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_old public.bb_members%ROWTYPE;
  v_member public.bb_members%ROWTYPE;
  v_consent public.bb_admin_member_consents%ROWTYPE;
BEGIN
  PERFORM public.bb_require_admin_members(p_token);
  IF p_member_id IS NULL OR length(p_member_id) NOT BETWEEN 1 AND 100 OR jsonb_typeof(p_updates) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Invalid member update';
  END IF;
  IF p_create THEN
    IF p_member_id !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
       OR (public.rpc_get_user_role(p_member_id)->>'is_admin')::boolean
       OR coalesce(p_updates->>'password','') !~ '^pbkdf2:sha256:100000:[a-fA-F0-9]{32}:[a-fA-F0-9]{64}$' THEN
      RAISE EXCEPTION 'Invalid account details';
    END IF;
    v_old.verification_status := 'not_verified';
    v_old.parental_consent_signed := false;
    v_old.media_consent := false;
  ELSE
    SELECT * INTO STRICT v_old FROM public.bb_members WHERE ic = p_member_id
      AND coalesce(department, '') NOT IN ('deleted', 'archived_deleted') FOR UPDATE;
  END IF;
  v_member := jsonb_populate_record(v_old, p_updates);
  IF length(trim(coalesce(v_member.name,''))) NOT BETWEEN 1 AND 100
     OR coalesce(v_member.verification_status,'not_verified') NOT IN ('not_verified','processing','verified','rejected')
     OR coalesce(v_member.department,'') IN ('deleted','archived_deleted') THEN
    RAISE EXCEPTION 'Invalid member details';
  END IF;
  IF p_create THEN
    INSERT INTO public.bb_members (ic,email,name,rank,squad,department,section,att_section,joined_at,date_of_birth,password,
      verification_status,parental_consent_signed,media_consent) VALUES (
      p_member_id,p_member_id,v_member.name,v_member.rank,v_member.squad,v_member.department,v_member.section,v_member.att_section,
      coalesce(v_member.joined_at,now()),v_member.date_of_birth,v_member.password,v_member.verification_status,
      v_member.parental_consent_signed,v_member.media_consent);
  ELSE
    UPDATE public.bb_members SET name=v_member.name,rank=v_member.rank,squad=v_member.squad,department=v_member.department,
      section=v_member.section,att_section=v_member.att_section,joined_at=v_member.joined_at,date_of_birth=v_member.date_of_birth,
      verification_status=v_member.verification_status,parental_consent_signed=v_member.parental_consent_signed,
      media_consent=v_member.media_consent WHERE ic=p_member_id;
  END IF;
  IF p_updates ?| ARRAY['parent_name','parent_contact','parental_consent_signed'] THEN
    SELECT * INTO v_consent FROM public.bb_admin_member_consents WHERE member_id=p_member_id;
    IF p_updates ? 'parent_name' THEN v_consent.parent_name := nullif(left(trim(p_updates->>'parent_name'),100),''); END IF;
    IF p_updates ? 'parent_contact' THEN v_consent.parent_contact := nullif(left(trim(p_updates->>'parent_contact'),100),''); END IF;
    IF v_member.parental_consent_signed THEN
      IF v_consent.parent_name IS NULL OR v_consent.parent_contact IS NULL THEN RAISE EXCEPTION 'Verified guardian details are required'; END IF;
      v_consent.parental_consent_date := coalesce(v_consent.parental_consent_date, now());
    ELSE
      v_consent.parental_consent_date := NULL;
    END IF;
    INSERT INTO public.bb_admin_member_consents (member_id,parent_name,parent_contact,parental_consent_date)
    VALUES (p_member_id,v_consent.parent_name,v_consent.parent_contact,v_consent.parental_consent_date)
    ON CONFLICT (member_id) DO UPDATE SET parent_name=excluded.parent_name,parent_contact=excluded.parent_contact,
      parental_consent_date=excluded.parental_consent_date;
  END IF;
  IF NOT public.rpc_append_admin_config_audit(p_token,jsonb_build_object('action', CASE WHEN p_create THEN 'member.create' ELSE 'member.update' END,
    'target_type','member','target_id',p_member_id)) THEN RAISE EXCEPTION 'Could not write member audit'; END IF;
  RETURN true;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.bb_require_admin_members(text), public.rpc_admin_get_member_consent(text,text),
  public.rpc_admin_save_member(text,text,boolean,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_admin_get_member_consent(text,text), public.rpc_admin_save_member(text,text,boolean,jsonb) TO anon, authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
