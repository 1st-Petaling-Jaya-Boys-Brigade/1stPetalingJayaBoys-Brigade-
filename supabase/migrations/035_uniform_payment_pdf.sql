BEGIN;

UPDATE storage.buckets
SET file_size_limit = 1048576, allowed_mime_types = ARRAY['image/jpeg', 'application/pdf']
WHERE id = 'uniform-payment-proofs';

CREATE OR REPLACE FUNCTION public.require_uniform_payment_proof()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  proof_path text;
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
    proof_path := encode(sha256(convert_to(NEW.ic::text, 'UTF8')), 'hex') || '/' || NEW.order_number;
    IF NEW.order_number !~ '^BB-[A-F0-9]{16}$' OR NOT EXISTS (
      SELECT 1 FROM storage.objects
      WHERE bucket_id = 'uniform-payment-proofs'
        AND name IN (proof_path || '.jpg', proof_path || '.pdf')
    ) THEN
      RAISE EXCEPTION 'Proof of payment is required to submit a uniform order' USING ERRCODE = '23514';
    END IF;
    NEW.has_payment_proof := true;
  END IF;
  RETURN NEW;
END;
$$;

COMMIT;
