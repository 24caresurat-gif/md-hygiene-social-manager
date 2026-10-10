-- Adds publication retry state and conditional claim fields to both approval pipelines.
-- This migration was applied to production as 20261010095804_scheduled_post_publish_retry_claim_fields.
-- It is tracked here for reproducibility; do not replay it against the already-updated production DB.

ALTER TABLE public.scheduled_posts
  ADD COLUMN IF NOT EXISTS publish_status text NOT NULL DEFAULT 'not_published',
  ADD COLUMN IF NOT EXISTS publish_error text,
  ADD COLUMN IF NOT EXISTS publish_claimed_at timestamptz,
  ADD COLUMN IF NOT EXISTS publish_attempts integer NOT NULL DEFAULT 0;

ALTER TABLE public.post_approvals
  ADD COLUMN IF NOT EXISTS publish_claimed_at timestamptz,
  ADD COLUMN IF NOT EXISTS publish_attempts integer NOT NULL DEFAULT 0;

ALTER TABLE public.social_posts
  ADD COLUMN IF NOT EXISTS post_approval_id uuid;

DO $migration$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.scheduled_posts'::regclass
      AND conname = 'scheduled_posts_publish_status_check'
  ) THEN
    ALTER TABLE public.scheduled_posts
      ADD CONSTRAINT scheduled_posts_publish_status_check
      CHECK (publish_status IN ('not_published', 'publishing', 'published', 'failed'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.post_approvals'::regclass
      AND conname = 'post_approvals_publish_status_check'
  ) THEN
    ALTER TABLE public.post_approvals
      ADD CONSTRAINT post_approvals_publish_status_check
      CHECK (publish_status IN ('not_published', 'publishing', 'published', 'failed'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.social_posts'::regclass
      AND conname = 'social_posts_post_approval_id_fkey'
  ) THEN
    ALTER TABLE public.social_posts
      ADD CONSTRAINT social_posts_post_approval_id_fkey
      FOREIGN KEY (post_approval_id) REFERENCES public.post_approvals(id) ON DELETE SET NULL;
  END IF;
END
$migration$;

CREATE INDEX IF NOT EXISTS scheduled_posts_publish_retry_idx
  ON public.scheduled_posts (publish_status, publish_claimed_at)
  WHERE status = 'draft' AND approval_status = 'approved';

CREATE INDEX IF NOT EXISTS social_posts_post_approval_id_idx
  ON public.social_posts (post_approval_id)
  WHERE post_approval_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS social_posts_post_approval_account_published_unique
  ON public.social_posts (post_approval_id, social_account_id)
  WHERE post_approval_id IS NOT NULL AND status = 'published';

UPDATE public.scheduled_posts
SET publish_status = 'published', publish_error = NULL, publish_claimed_at = NULL
WHERE status = 'published' AND publish_status <> 'published';

UPDATE public.post_approvals
SET publish_claimed_at = NULL
WHERE publish_status <> 'publishing';
