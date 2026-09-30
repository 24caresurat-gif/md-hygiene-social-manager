create policy "google_business_connections_no_client_access"
on public.google_business_connections
for all
to anon, authenticated
using (false)
with check (false);
