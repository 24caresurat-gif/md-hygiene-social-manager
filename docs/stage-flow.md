# MD Hygiene Social Manager — Stage Flow

1. Stage 1 — Login
   - Authenticate user.
   - Redirect authenticated users to Workspace Hub.

2. Stage 2 — Workspace Hub
   - Admin: see all authorized workspace cards and Create New Workspace.
   - Staff: see only assigned workspace cards; never show Create New Workspace.
   - One assignment = one card; multiple assignments = multiple cards.
   - Open Workspace enters the selected workspace dashboard.
   - Delete is available only to authorized admins.

3. Stage 3 — Create Workspace
   - Workspace name is required.
   - Optional logo upload: PNG/JPG/WEBP, max 5 MB.
   - Preview logo before submit.
   - Create Workspace is disabled until the name is valid.
   - On success, return to Workspace Hub with the new workspace visible.
   - Staff cannot reach creation successfully through UI or API authorization.
