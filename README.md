# 🧠 SaveBrain

Turn your saved Instagram / Facebook posts into a private, filterable to-do list.
Static frontend on GitHub Pages, data and accounts in Supabase. No server.

**Live:** https://medamine-sudo.github.io/savebrain-frontend/

## Features
- Bring your own Supabase project — no shared backend, no shared keys
- Email + password accounts (Supabase Auth) — each user only sees their own saves
- Paste a post/reel link (or open `?url=…` from a share shortcut) to file it
- Filter by To Do / Done / High urgency / Check claims
- Mark done, delete

## Use it with your own Supabase
SaveBrain is bring-your-own-backend: the hosted site ships **no** Supabase key.
Each person connects their own free Supabase project, and the URL + key are stored only in their browser.

1. Create a project at [supabase.com](https://supabase.com).
2. SQL Editor → run [`supabase/schema.sql`](supabase/schema.sql).
3. Authentication → URL Configuration → set *Site URL* to
   `https://medamine-sudo.github.io/savebrain-frontend/` (or your fork's URL) and add it to *Redirect URLs*.
4. Project Settings → API Keys → copy your **publishable** key (`sb_publishable_...`).
   Never use a `sb_secret_...` / `service_role` key — the app refuses them.
5. Open SaveBrain, paste your project URL + publishable key, then create an account.

## Security model
- The publishable key is designed to be used in browsers; it is not a secret. Your data is protected by
  **Row Level Security**: every row has a `user_id`, and policies only allow `auth.uid() = user_id`.
- No keys are committed to this repo. `config.js` is git-ignored.

## Deploy your own fork (optional)
1. Fork, then Settings → Pages → Source: **GitHub Actions**. Push to `main` to deploy.
2. Optional: to bake one Supabase project into your deployment (so visitors skip the setup screen),
   add Actions secrets `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY`. That key will then be visible
   in the deployed `config.js`, which is fine as long as RLS is on.

## Local development
```bash
cp config.example.js config.js   # fill in your URL + publishable key
python3 -m http.server 8000      # open http://localhost:8000
```
Add `http://localhost:8000` to Supabase Redirect URLs if you sign up locally.
