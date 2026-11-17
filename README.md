# Trishik Seksaria consultancy website

A Next.js App Router project for the professional profile, invite-only appointment requests, and the advocate dashboard. The profile uses the palette and typography direction of the [Dribbble reference](https://dribbble.com/shots/27308105-Lawyer-Alexander-s-Landing-Page-Website-UI-UX-Design).

## Run locally

Use Node.js 22 or newer.

```powershell
npm install
Copy-Item .env.example .env.local
npm run dev
```

Open http://localhost:3000 for the profile and http://localhost:3000/preview to try a fictional request, approval, reschedule and cancellation. The demo uses browser memory and requires zero provider credentials. The real dashboard at http://localhost:3000/admin uses Supabase Auth with authenticator-app MFA.

## Connect staging services

1. Create a Supabase staging project. Apply both SQL migrations in order with the Supabase CLI or SQL Editor. Disable open sign-ups, create the advocate's user account, and set its UUID as `ADMIN_USER_ID`. Set the project URL, publishable key and secret key. Sign in and enroll TOTP before using the real dashboard.
2. Upload the approved portrait to the `profile-assets` bucket and set `PORTRAIT_OBJECT_KEY` to the object key if using Supabase Storage. The bucket is for approved public images. To move these assets to Cloudflare R2 later, copy them, verify checksums and update the URL resolver in `lib/storage.ts`.
3. Enable Google Calendar API in a client-owned Google Cloud project and obtain a refresh token for the advocate's calendar account using [Google OAuth with offline access](https://developers.google.com/identity/protocols/oauth2/web-server). Use `https://www.googleapis.com/auth/calendar.events.owned` for a calendar the advocate owns (or `https://www.googleapis.com/auth/calendar.events` for a writable shared calendar) and `https://www.googleapis.com/auth/calendar.events.freebusy`. Use a dedicated consultation calendar with Google Meet enabled and configure its explicit calendar ID. Set any additional calendars used to check for busy time. Verify the OAuth app's status and token lifetime before launch.
4. Verify the sender domain in Resend and set `RESEND_API_KEY` and `MAIL_FROM`. The dashboard creates client invitation links. Share the link with the intended recipient using your existing communication channel.
5. Set `SITE_URL` to the exact HTTPS origin of the staging deployment. For local development, use the same origin shown in the browser. Generate separate random values for `BOOKING_SECRET` and `CRON_SECRET`. In Vercel, the once-per-minute job schedule in `vercel.json` assumes Vercel Pro. In local testing, call `GET /api/jobs` with the `Authorization: Bearer <CRON_SECRET>` header.
6. Keep staging access protected. Obtain the advocate's sign-off on the profile, portrait, privacy contact, retention practice and booking access before publication. `PUBLIC_BOOKING=false` defaults to invitations bound to an email address and valid for seven days. `PROFILE_INDEXABLE=true` enables search indexing.

## Verify before deployment

- Run `npm run typecheck` and `npm run build`. Check the public profile on desktop and mobile.
- Sign in using the staging advocate account. Verify the dashboard requires MFA. Verify signed-out visitors cannot read appointment records or run admin actions. Confirm the cron route rejects unauthenticated requests.
- Generate an invitation for a staging email address. Test the wrong address, then submit with the intended address. Verify the receipt, approval, Google Calendar event, Meet link and confirmation email. Repeating a submission with the same key should create one appointment.
- Submit two overlapping requests and approve them simultaneously. Verify one slot reservation succeeds. Add an external Calendar event and verify the new availability and pre-confirmation checks.
- Reschedule and cancel from the dashboard. Verify the same Google event is moved or removed and the client receives the appropriate update. Use **Check Calendar sync** to reconcile an event moved or deleted outside the site.
- Test provider failures and retries in staging. If a Calendar conflict stopped a job before a write, use the dashboard to return it to pending or keep the original time. If the email deduplication window has elapsed, check Resend before taking further action.
