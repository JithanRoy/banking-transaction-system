BEGIN;

ALTER TABLE accounts
ADD COLUMN IF NOT EXISTS id BIGSERIAL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'accounts_id_unique'
  ) THEN
    ALTER TABLE accounts
    ADD CONSTRAINT accounts_id_unique UNIQUE (id);
  END IF;
END
$$;

COMMIT;
