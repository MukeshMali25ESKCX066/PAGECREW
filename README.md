# SocialPilot Hub

Centralized Facebook Page scheduling dashboard.

## Features
- Connect Facebook accounts through Meta OAuth
- Discover/manage Facebook Pages returned by the authorized account
- Select multiple Pages
- Compose text posts
- Schedule posts
- Signup plan selection, QR payment submission, and super-admin payment review
- Dashboard for scheduled/published/failed jobs
- Separate login, registration, and super admin sign-in pages at `/login`, `/register`, and `/suuperadmin`
- Optional Google Authenticator (TOTP) protection for super admin sign-in, configured in the `/suuperadmin` Security section
- PostgreSQL-ready data model
- BullMQ/Redis-ready job architecture

## Important Meta/API note
This project uses official Meta OAuth/API endpoints as placeholders and a clean service boundary.
Before production use, create/configure a Meta developer app, set the OAuth redirect URI,
request the permissions your use case is eligible for, and comply with Meta Platform Terms
and Page publishing policies. Do not store Facebook passwords.

## Quick start
1. Copy `backend/.env.example` to `backend/.env`.
2. Put your Meta App ID/secret and database values in `.env`.
3. Run PostgreSQL.
4. `cd backend && npm install && npm run dev`
5. `cd frontend && npm install && npm run dev`

The included demo mode lets you inspect the dashboard without real Meta credentials.

After a user registers, they choose one of the listed plans. Paid plans require the
super admin to configure a payment QR at `/suuperadmin`; the user then submits the payer
name, transaction reference, and a payment screenshot. The account stays outside
the workspace until an admin compares the details with the payment statement and
approves it. The free Demo plan skips payment but still requires admin approval.
Payment screenshots and the QR are stored under `backend/uploads/payments`, so
deployments need persistent storage for that directory.
Super admins can enable Google Authenticator at `/suuperadmin`: scan the setup QR and
verify a current six-digit code to activate it. When enabled, a password alone
does not create an admin session; each new admin sign-in also requires a
time-based code. Disabling it requires a current authenticator code. The
authenticator seed is encrypted at rest using the super admin password hash, so
changing or replacing that password hash requires re-enrolling the authenticator.
