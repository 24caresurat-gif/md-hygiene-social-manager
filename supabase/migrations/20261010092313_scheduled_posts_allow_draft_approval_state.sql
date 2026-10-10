-- Keep the scheduled-post workflow state machine consistent with the drafts API.
-- The app creates/edit pre-submission drafts with status='draft' and approval_status='draft';
-- worker publishing continues to process approval_status='approved' only.
ALTER TABLE public.scheduled_posts
  DROP CONSTRAINT IF EXISTS scheduled_posts_approval_status_check;

ALTER TABLE public.scheduled_posts
  ADD CONSTRAINT scheduled_posts_approval_status_check
  CHECK (approval_status IN ('draft', 'pending', 'approved', 'rejected', 'changes_requested'));
