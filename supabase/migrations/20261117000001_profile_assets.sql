begin;

-- Only approved, public-facing imagery belongs in this bucket.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('profile-assets', 'profile-assets', true, 10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'image/avif']);

-- Public object URLs work independently of the client object access policy.
create policy "Profile assets are managed by the project operator"
on storage.objects as restrictive
for all to anon, authenticated
using (bucket_id <> 'profile-assets')
with check (bucket_id <> 'profile-assets');

commit;
