# SocialPilot Hub

Centralized Facebook Page scheduling dashboard.

## Features
- Connect Facebook accounts through Meta OAuth
- Discover/manage Facebook Pages returned by the authorized account
- Select multiple Pages
- Compose text posts
- Schedule posts
- Dashboard for scheduled/published/failed jobs
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
