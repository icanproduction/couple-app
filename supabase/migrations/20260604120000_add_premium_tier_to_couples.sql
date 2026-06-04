-- Dummy-payment premium tier for couples
-- Additive + idempotent. Free tier = default (is_premium=false).
ALTER TABLE public.couples
  ADD COLUMN IF NOT EXISTS is_premium boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS unlocked_at timestamptz;

COMMENT ON COLUMN public.couples.is_premium IS 'Dummy-payment premium tier flag. true = unlocked (all Deep Talk levels, full results, shareable card).';
COMMENT ON COLUMN public.couples.unlocked_at IS 'When premium was unlocked (dummy or real payment).';
