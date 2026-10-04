# AlalAI — access guide

AlalAI is a voice-first care-plan assistant demo. Clinicians create and manage plans; patients use a private, voice-first link. It is decision support only, not a medical device, and it does not diagnose or replace clinical judgment.

## Open the app

Live app: https://agora-navy.vercel.app/

| User | Local address | Live Vercel address |
| --- | --- | --- |
| Clinician sign-in | `http://localhost:3000/admin/login` | https://agora-navy.vercel.app/admin/login |
| Clinician dashboard | `http://localhost:3000/clinician` | https://agora-navy.vercel.app/clinician |
| Patient | Use the private link generated in the clinician dashboard | `https://agora-navy.vercel.app/p/<patient-token>` |
| Health check | `http://localhost:3000/api/health` | https://agora-navy.vercel.app/api/health |

Do not share a patient's private link publicly.

## Local setup

Prerequisites: Node.js 20 or later, an Agora project, and a Supabase project with this repository's migrations applied.

```bash
npm install
```

Create `.env.local` in the repository root. Use your own values and keep this file private:

```env
ADMIN_PASSWORD=<choose-a-strong-shared-demo-password>
NEXT_PUBLIC_SUPABASE_URL=https://<your-project-ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<your-supabase-service-role-key>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-supabase-anon-key>
NEXT_PUBLIC_AGORA_APP_ID=<your-agora-app-id>
NEXT_AGORA_APP_CERTIFICATE=<your-agora-app-certificate>
NEXT_PUBLIC_AGENT_UID=1000
# Optional: override the initial voice greeting
NEXT_AGENT_GREETING=Hello, I am AlalAI, your care assistant.
```

`SUPABASE_SERVICE_ROLE_KEY` is server-only. Never expose it in browser code, commit it, or add it to Vercel variables prefixed with `NEXT_PUBLIC_`.

Apply the database schema from `supabase/migrations/` to the Supabase project, then load the fictional demo protocol:

```bash
npm run seed
```

Start the app:

```bash
npm run dev
```

Open `http://localhost:3000/admin/login` and sign in with the exact value set in `ADMIN_PASSWORD`. The seeded demo patient is Lolo Ben. It contains fictional data only and is not medical advice.

## Clinician and patient flow

1. Sign in at `/admin/login` with `ADMIN_PASSWORD`.
2. Open the clinician dashboard, create or select a patient, and configure their plan.
3. Copy the patient’s generated private link and open it on the patient’s phone.
4. The patient taps the start button once to allow microphone and audio access, then uses voice. The screen remains a caption and large action buttons only.

The app uses one shared clinician password for this demo. Patient links do not require that password; anyone with a link can open that patient’s voice session, so distribute links only to the intended patient or caregiver.