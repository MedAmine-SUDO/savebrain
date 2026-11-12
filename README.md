# 🧠 SaveBrain

Turn your saved Instagram / Facebook posts into a private, filterable to-do list.

**Open it:** https://medamine-sudo.github.io/savebrain-frontend/

## Features
- **Your own private database** — every user connects their own free Supabase project. There is no shared backend and no key in this repo or on the site.
- **Import from Meta AI** — copy a ready-made prompt, paste it into Meta AI, paste the reply back. Works daily with a Meta AI scheduled task.
- **Paste a link** from Instagram/Facebook's Share → Copy Link.
- Filter by To Do / Done / High urgency / Check claims; mark done; delete.

## Setup (about 3 minutes, no coding)
1. Open SaveBrain.
2. Click **Create a free Supabase account** and sign up.
3. Click **Generate an access token**, copy it, paste it into SaveBrain, click **Continue**.
4. Pick an email + password for SaveBrain and click **Set up SaveBrain**.

SaveBrain then creates your Supabase project, the table and its privacy rules, sets up sign-in,
creates your account and locks sign-ups so nobody else can use your project.
When it's done you can delete the access token on the Supabase tokens page.

> Free Supabase plans allow 2 active projects. If you already have 2, choose
> “Use existing” and SaveBrain will add its table to that project instead.

## Daily sync with Meta AI
1. In SaveBrain, click **Saves from the last 24h** to copy the prompt.
2. In Meta AI, ask it to run that prompt every morning as a scheduled task.
3. Each morning, copy Meta AI's reply into **Import from Meta AI**. Links already in SaveBrain are skipped.

Imported posts are marked “Check claims”: AI can make mistakes, so open the original link to confirm.

## Security
- The access token is used only during setup, only sent to `api.supabase.com`, and never stored.
- After setup the browser keeps only your project URL and **publishable** key. The app refuses secret keys.
- Data is protected by Row Level Security: each row has a `user_id`, only signed-in users can reach
  the table, and they only see rows where `auth.uid() = user_id`. See [`supabase/schema.sql`](supabase/schema.sql).
- On projects created by setup, new sign-ups are disabled after your account is created.

## Already have a Supabase project?
Run the same setup and pick **Use existing** after pasting your token. Setup adds the table and privacy
rules, adds SaveBrain to your sign-in settings, and creates + confirms your account. It doesn't lock
sign-ups on existing projects; if the project is only for SaveBrain, turn off *Allow new users to sign up*
in Supabase → Authentication → Sign In / Providers.

Saves created before accounts existed have no owner. Give them to yourself in the SQL Editor:
```sql
update savebrain_items set user_id = (select id from auth.users where email = 'you@example.com') where user_id is null;
```

## Using SaveBrain on another device
On your first device, click **📱 Connect another device** and open the link (or scan the QR code) on the
other one, then sign in. The link holds your project address and publishable key, never your password —
only open it on your own devices.

## Development
```bash
python3 -m http.server 8000   # open http://localhost:8000
```
Pushing to `main` deploys to GitHub Pages via `.github/workflows/deploy.yml`.
