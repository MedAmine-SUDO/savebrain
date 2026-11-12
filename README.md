# 🧠 SaveBrain

Turn your saved Instagram / Facebook posts into a private, filterable to-do list.
Static frontend on GitHub Pages, data and accounts in Supabase. No server.

**Live:** https://medamine-sudo.github.io/savebrain-frontend/

## Features
- Email + password accounts (Supabase Auth) — each user only sees their own saves
- Paste a post/reel link (or open `?url=…` from a share shortcut) to file it
- Filter by To Do / Done / High urgency / Check claims
- Mark done, delete

## Security model
This is a browser-only app, so the Supabase **publishable** key is shipped to the browser
— that is how Supabase is designed. Data is protected by **Row Level Security**:
every row has a `user_id`, and policies only allow `auth.uid() = user_id`.
Never put a `service_role` / secret key in this project.

The key is not committed to the repo: `config.js` is generated at deploy time from
GitHub Actions secrets.

## Self-host your own copy
1. **Supabase:** create a project, then SQL Editor → run [`supabase/schema.sql`](supabase/schema.sql).
2. **Auth URLs:** Authentication → URL Configuration → set *Site URL* to your Pages URL
   (e.g. `https://<you>.github.io/savebrain-frontend/`) and add it to *Redirect URLs*.
3. **Fork** this repo, then Settings → Secrets and variables → Actions → add:
   - `SUPABASE_URL` — `https://<project>.supabase.co`
   - `SUPABASE_PUBLISHABLE_KEY` — `sb_publishable_...`
4. Settings → Pages → Source: **GitHub Actions**. Push to `main` to deploy.

## Local development
```bash
cp config.example.js config.js   # fill in your URL + publishable key
python3 -m http.server 8000      # open http://localhost:8000
```
Add `http://localhost:8000` to Supabase Redirect URLs if you sign up locally.
