BEGIN;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('uniform-payment-proofs', 'uniform-payment-proofs', false, 262144, ARRAY['image/jpeg'])
ON CONFLICT (id) DO UPDATE
SET public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- Officer preview and member upload go through the portal Edge Function.
CREATE POLICY "Keep uniform payment proofs server-only"
ON storage.objects AS RESTRICTIVE FOR ALL TO anon, authenticated
USING (bucket_id <> 'uniform-payment-proofs')
WITH CHECK (bucket_id <> 'uniform-payment-proofs');

ALTER TABLE public.bb_orders ADD COLUMN has_payment_proof boolean NOT NULL DEFAULT false;
CREATE UNIQUE INDEX bb_orders_payment_proof_order_number_idx
ON public.bb_orders (order_number) WHERE has_payment_proof;

CREATE FUNCTION public.require_uniform_payment_proof()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.order_number IS DISTINCT FROM OLD.order_number OR NEW.ic IS DISTINCT FROM OLD.ic THEN
      IF OLD.has_payment_proof OR NEW.order_number LIKE 'BB-%' THEN
        RAISE EXCEPTION 'Uniform order identity cannot be changed' USING ERRCODE = '23514';
      END IF;
    END IF;
    NEW.has_payment_proof := OLD.has_payment_proof;
    RETURN NEW;
  END IF;

  NEW.has_payment_proof := false;
  IF NEW.order_number LIKE 'BB-%' THEN
    IF NEW.order_number !~ '^BB-[A-F0-9]{16}$' OR NEW.ic IS NULL OR NOT EXISTS (
      SELECT 1 FROM storage.objects
      WHERE bucket_id = 'uniform-payment-proofs'
        AND name = encode(sha256(convert_to(NEW.ic::text, 'UTF8')), 'hex') || '/' || NEW.order_number || '.jpg'
    ) THEN
      RAISE EXCEPTION 'A payment screenshot is required to submit a uniform order' USING ERRCODE = '23514';
    END IF;
    NEW.has_payment_proof := true;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.require_uniform_payment_proof() FROM PUBLIC;
CREATE TRIGGER require_uniform_payment_proof
BEFORE INSERT OR UPDATE OF order_number, ic, has_payment_proof ON public.bb_orders
FOR EACH ROW EXECUTE FUNCTION public.require_uniform_payment_proof();

COMMIT;
