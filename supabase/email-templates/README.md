# Atmos email templates

Branded versions of the Supabase auth emails. Paste each one into
Supabase → Authentication → Emails → Templates:

| Template in Supabase | File | Subject |
|---|---|---|
| Reset Password | `reset-password.html` | Reset your Atmos password |
| Confirm signup | `confirm-signup.html` | Confirm your Atmos account |
| Magic Link | `magic-link.html` | Your Atmos sign-in link |
| Change Email Address | `change-email.html` | Confirm your new Atmos email |

They use Supabase's `{{ .ConfirmationURL }}`, `{{ .Email }}` and `{{ .NewEmail }}`
variables. Images load from https://gradient-ui.vercel.app, so keep that domain
(or update the image URL) if the site moves.
