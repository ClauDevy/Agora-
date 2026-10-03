# AlalAI — agent.md

> Read this file fully before writing any code. It is the source of truth for the project.
> If something here conflicts with a guess you want to make, follow this file. If this file is silent, ask the human instead of inventing.

---

## 0. What we are building (one paragraph)

**AlalAI** is a voice-first care assistant for older adults who are home alone. A **doctor or nurse** uses a small **admin web interface** to enter patient details, emergency contacts, a medicine/task **schedule**, **instructions**, and **warning signs** ("if swelling or fever, call the medical professional"). The system generates a **private link** for the patient. The patient opens the link once and from then on **only talks**: AlalAI speaks the reminder at the scheduled time, reads the doctor's instructions and precautions, asks whether it was done, asks how the patient feels, answers questions about the schedule, and **escalates** (contacts, then hospital) when the doctor's warning signs are triggered or the patient asks for help.

**Core principle (never violate): the doctor decides, the AI delivers, deterministic code escalates.**

---

## 1. Hackathon context (from the participant booklet)

Track: **Agora: Voice First**. These are requirements, not preferences.

- **Agora must be integrated** (Convo AI, Agents SDK, MCP, Skills, etc.). Everything else is our choice. Kiro/Quick are optional for this track.
- **Voice must be the primary interface** for the underserved user. **Subtraction test:** if removing voice leaves a working normal app, we lose points (5-point penalty stated in the booklet) and fail the track intent.
  - The admin interface is for clinicians and is allowed to be a screen. The **patient side must have no menus, no forms, no reading required.**
- Build window is 12 hours, team max 4. Judges review the **GitHub repo**, a **video demo**, and a **live URL** before the pitch.
- Judges reward: working MVP, real clinical workflow, **good technology judgment (use simple deterministic logic where it is the better choice)**, originality, a clear pitch.
- Submission fields (the README must make these easy to fill): Project Name, Overview, Target Market, Pain Point (evidence), The How (solution), Strategic Integration (how Agora is used), Sustainability & Growth, Video, GitHub, Live/Beta URL.

---

## 2. Roles

| Role | Interface | Notes |
|---|---|---|
| **Clinician** (doctor/nurse) | Web admin (screen) | Creates patient, schedule, instructions, warning signs. Sees activity and alerts. |
| **Patient** (older adult, often alone) | Voice-only web app opened via private link | One tap to wake. Everything else by voice. Large text only as a caption, never required. |
| **Emergency contact** (relative/BHW) | Phone call / message / dashboard alert | Receives alerts. May also be reached by the patient tapping or saying "call Ana". |

---

## 3. MVP scope

### MUST (build in this order)
1. **Admin: patient details** — name, address, language, emergency contacts (name, relationship, phone), nearest hospital (name, phone).
2. **Admin: schedule builder** — repeating items with time, days, type (medicine / task / check-in), **instructions** text, and **precautions** text.
3. **Admin: warning signs** — doctor writes if-then rules: symptom label + trigger phrases + action + message to the patient.
4. **Generate a patient link** (unguessable token, no login).
5. **Patient voice app** — one tap to wake; at scheduled time AlalAI speaks the reminder + instructions + precautions, asks "done?", asks how the patient feels, listens for warning signs.
6. **Q&A grounded only in the plan** — "what's my next medicine?", "what time is my dressing?", "what did the doctor say about X?" Anything outside the plan → "I'll ask your doctor" + log it.
7. **Deterministic rules engine** matches patient speech against the doctor's warning signs (and a small universal safety net) and picks an escalation action.
8. **Emergency ladder, free-first** (see section 9): dashboard alert → patient's phone dials contact (`tel:`) → dials hospital.
9. **No-response detection** — if a due reminder isn't answered after retries, raise an alert.
10. **Activity & alerts feed** for the clinician.
11. **Demo mode** — "trigger this item now" button and a seeded demo patient.

### SHOULD
- Doctor writes a normal sentence ("if swelling or fever, call the doctor") and the admin **proposes structured rules for the doctor to review and approve** (LLM assists; the doctor confirms; runtime is still deterministic).
- Free notification to a contact via Telegram bot or email.
- Taglish/Filipino/English per-patient language setting.
- Screen Wake Lock so the patient's phone stays awake.

### NICE
- QR code for the patient link; multiple patients dashboard polish; per-item "needs a helper" flag.

### DO NOT BUILD (hard no)
- Diagnosis, severity scoring, or any medical judgment by the AI.
- Dose calculation, dose changes, or drug advice not typed by the doctor.
- Wound/photo analysis. Fall detection. Wearables integration.
- Paid SMS/telephony as a dependency. Real patient data. User accounts for patients.
- Native mobile app. Multi-clinic tenancy. Billing.

---

## 4. Architecture

```
Clinician ──► Admin web (Next.js) ──► API routes ──► Database (Postgres)
                                           │
Patient link (/p/[token]) ──► Patient web (voice UI) ◄──► Agora RTC channel ◄──► Agora Conversational AI agent
                                                                                      │ (LLM request)
                                                                                      ▼
                                                              /api/llm  (our "brain" proxy)
                                                               1. load patient plan from DB
                                                               2. run RULES ENGINE on latest patient utterance (plain code)
                                                               3. build system prompt from plan
                                                               4. call LLM provider, stream answer back
                                                               5. on rule hit: log event, create alert, tell patient fixed message
                                                                                      │
                                                                                      ▼
                                                        Escalation: dashboard alert → tel: contact → tel: hospital
```

### Responsibility split (this is the "Technology & Automation Judgment" story)

| Piece | Done by | Why |
|---|---|---|
| Schedule timing, retries, no-response | **Plain code** | Must be exact and predictable |
| Matching speech to warning signs | **Plain code** (phrase matching) + optional LLM synonym check restricted to the doctor's closed symptom list | Doctor's rules must decide, not the AI |
| Choosing escalation action | **Plain code** | Safety-critical |
| Speech-to-text, text-to-speech, turn-taking | **Agora Conversational AI** | This is what Agora is for |
| Natural phrasing, Taglish replies, answering plan questions | **LLM** (constrained to the plan) | Conversation is the AI's only job |

---

## 5. Tech stack (recommended; change only with human approval)

- **Next.js (App Router) + TypeScript**, deployed to Vercel for the required live URL.
- **Supabase** (Postgres + realtime) or any hosted Postgres. Keep schema simple.
- **Agora**: Conversational AI Engine + Agora RTC Web SDK in the browser; server-side Agora agent SDK or REST for starting/stopping the agent; token generation on the server.
- **Tailwind CSS** for UI. Patient UI: huge buttons, high contrast, minimal text.
- **Vitest** (or similar) for unit tests on the rules engine and scheduler.
- Env vars only for secrets. Never commit keys.

### Agora facts confirmed from Agora docs (as of today)
- Flow: the browser client joins an **Agora RTC channel**; our **server** calls the Conversational AI Engine **join** endpoint (`POST https://api.agora.io/api/conversational-ai-agent/v2/projects/:appid/join`) with the channel name and a token for the agent; store the returned **agent_id**; call **leave** (`.../agents/:agentId/leave`) to stop it.
- REST calls use credentials generated per Agora's RESTful authentication page.
- Agent SDKs exist (Python `agora_agent`, TypeScript `agora-agents`, Go) with an `Agent` → `create_session` → `start()` pattern.
- The docs say **presets** let you start a first agent **without** your own ASR/LLM/TTS keys.
- The join request config includes ASR, LLM (with a `url`), and TTS settings.

### Things you MUST verify in the docs before relying on them (do not guess)
1. Whether the LLM `url` can point to **our own endpoint** (OpenAI-compatible chat-completions) and what headers/body Agora sends. If yes, use `/api/llm` as designed (Approach A).
2. If not, how to receive **user transcripts** (data stream / RTM / webhook). Then run the rules engine on transcripts and call `/api/escalate` (Approach B).
3. **Filipino / Taglish** support in the available ASR and TTS options. Test with real spoken Filipino in hour 1.
4. How **interruption** ("teka lang") is handled.
5. Pricing/credits and **session duration limits**. Keep sessions short regardless.
6. Install **Agora Skills** (listed in the booklet) into your coding tool so it can read Agora docs, and use the docs site as the source of truth.

---

## 6. Data model (Postgres)

```sql
create table patients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text,
  language text not null default 'tl-en',      -- 'tl', 'en', 'tl-en'
  general_instructions text,                    -- doctor's free-text notes the agent may read/answer from
  hospital_name text,
  hospital_phone text,
  emergency_number text default '',             -- admin-configurable; do NOT hard-code
  patient_token text unique not null,           -- random 32+ chars for /p/[token]
  created_at timestamptz default now()
);

create table emergency_contacts (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid references patients on delete cascade,
  name text not null,
  relationship text,
  phone text not null,
  priority int not null default 1,              -- 1 = call first
  telegram_chat_id text                         -- optional free notification channel
);

create table schedule_items (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid references patients on delete cascade,
  title text not null,                          -- e.g. "Medicine A (demo)"
  kind text not null check (kind in ('medicine','task','checkin')),
  time_of_day text not null,                    -- 'HH:MM' local time
  days_of_week int[] not null default '{0,1,2,3,4,5,6}',
  instructions text,                            -- read to the patient VERBATIM
  precautions text,                             -- read to the patient VERBATIM
  active boolean default true
);

create table warning_rules (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid references patients on delete cascade,
  schedule_item_id uuid references schedule_items on delete cascade,  -- null = applies to all check-ins
  label text not null,                          -- "Swelling"
  trigger_phrases text[] not null,              -- {"namamaga","pamamaga","swelling","swollen"}
  action text not null check (action in ('log','notify_contacts','call_contact','go_to_hospital')),
  patient_message text,                         -- fixed text spoken when triggered
  require_confirmation boolean default true     -- read back before non-critical escalation
);

create table events (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid references patients on delete cascade,
  schedule_item_id uuid,
  kind text not null,   -- reminder_started | confirmed_done | not_done | symptom_reported |
                        -- question_answered | question_unanswered | escalation | no_response | call_initiated | session_started | session_ended
  payload jsonb default '{}',
  created_at timestamptz default now()
);

create table alerts (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid references patients on delete cascade,
  level text not null,  -- 'notify_contacts' | 'call_contact' | 'go_to_hospital' | 'no_response'
  reason text not null, -- human-readable: "Patient reported: Swelling"
  status text not null default 'open',   -- open | acknowledged
  created_at timestamptz default now()
);
```

Index `patients.patient_token`. Add a `last_heartbeat_at` column to `patients` for no-response detection.

---

## 7. Admin interface spec

Protect with a **single shared password from an env var** (`ADMIN_PASSWORD`) for the hackathon. Say so in the README; real auth is roadmap.

**Screens**
1. **Patients list** → "New patient".
2. **Patient form**: Name*, Address, Language, General instructions (textarea), Hospital name + phone, Emergency number (optional, doctor-configurable), **Emergency contacts** (repeatable: name, relationship, phone, priority).
3. **Schedule builder** (per patient): repeatable rows — Title*, Kind (medicine/task/check-in), Time*, Days, **Instructions** (textarea), **Precautions / what to watch for** (textarea).
4. **Warning signs builder**: repeatable rows — Label*, Trigger phrases (comma-separated, English + Filipino), Action (Log / Notify contacts / Call contact / Go to hospital), Message to patient, "Read back before escalating" checkbox. Scope: all check-ins or one schedule item.
5. **Patient link panel**: shows `https://<app>/p/<token>`, copy button, "Open as patient", **"Trigger now (demo)"** per schedule item.
6. **Activity & alerts feed**: alerts at top (open/acknowledged), then events timeline. Auto-refresh every few seconds or realtime.

**Doctor-assist (SHOULD):** textarea "Write the rule in your own words" → LLM returns *proposed* `warning_rules` JSON → UI shows them as editable rows → doctor must click **Approve** before saving. The AI never writes rules silently. Show the label "Suggested by AI — review before saving".

Show a visible banner: *"AlalAI follows the instructions you write. It does not diagnose or replace clinical judgment."*

---

## 8. Patient app spec (`/p/[token]`)

**Voice-first, screen-minimal.** The screen is only a caption and a few giant buttons.

**States**
1. **Wake screen** (first visit only): one giant button "Tap to start Alalay". This one tap is required because browsers block audio and microphone until a user gesture. Keep the page open afterward. Request the microphone and (optionally) Wake Lock here.
2. **Idle**: calm screen showing the next scheduled item and time. Sends a **heartbeat** to `/api/heartbeat` every ~30 s.
3. **Due**: server says an item is due → page starts an Agora voice session with that item as context → AlalAI speaks.
4. **Conversation**: caption of the last sentence, a mic-active indicator, and a persistent **big "Tulong / Help"** button.
5. **Escalation**: full-screen with the message and a giant **"Tawagan si Ana"** `tel:` button (see section 9).
6. **Idle again** after the item completes or ~60 s of silence (end the agent session to save cost).

**Patient can start talking any time** by tapping the screen once ("Kausapin si Alalay") to ask questions. No wake word in MVP.

**Voice commands that always work:** "ulitin mo" (repeat), "teka lang" (pause), "okay na / tapos na" (done), "tulong" (help), "tawagan mo si <name>" (call contact).

---

## 9. Emergency ladder (free-first)

Actions come from the doctor's rule or from the universal safety net. Code executes; the AI only speaks the result.

| Action | What happens (all free) |
|---|---|
| `log` | Record event. Mention to patient only if the rule has a message. |
| `notify_contacts` | Create alert → shows on clinician dashboard immediately. Optional free push: Telegram bot message and/or email to contacts. Patient is told "Sinabihan ko na po si <contact>." |
| `call_contact` | Everything above, **plus** the patient screen shows the giant `tel:` button for contact priority 1 and the agent says it is calling. If the patient says the contact didn't answer, show the next contact, then the hospital. |
| `go_to_hospital` | Everything above, plus the agent tells the patient to go to / call the hospital now; screen shows `tel:` for the hospital number and the doctor-configured emergency number. Alerts all contacts. |

**Implementation notes**
- Use `window.location.href = "tel:+63..."` for the call. **Browsers may block navigation not triggered by a user tap**, especially on iOS. Always also render the giant tap-to-call button. The voice agent's job is to announce the action and tell the patient to tap the button. This is acceptable for the MVP; be honest about it in the pitch.
- The system **cannot dispatch an ambulance or place a call by itself** without paid telephony. State this plainly in the README. Paid auto-SMS/auto-call is roadmap.
- The emergency number is **configurable per patient**. Do not hard-code a national number in code; verify it with the clinician or an official source and put it in the seed data.

### Universal safety net (hard-coded, **must be reviewed by a clinician**; label "demo" until then)
A short list of phrases that always trigger `go_to_hospital` regardless of the doctor's rules, for example: difficulty breathing, chest pain, fainting/unconscious, cannot move, fell, "help"/"tulong". Keep the list in one file (`lib/safety/universal.ts`) with comments. Matching must handle phrases that contain negators (e.g. "hindi ako makahinga" means cannot breathe, so negation filtering must NOT cancel it).

---

## 10. Rules engine (pure functions, unit-tested)

Location: `lib/rules/`. No network, no LLM, no database inside the pure functions.

```ts
export type Action = 'log' | 'notify_contacts' | 'call_contact' | 'go_to_hospital';

export interface WarningRule {
  id: string; label: string; triggerPhrases: string[];
  action: Action; patientMessage?: string; requireConfirmation: boolean;
}

export interface RuleHit { ruleId: string | 'universal'; label: string; action: Action; matchedPhrase: string; }

export function normalize(text: string): string; // lowercase, strip diacritics/punctuation, collapse spaces

export function evaluateUtterance(text: string, rules: WarningRule[]): RuleHit[]; // includes universal safety net

export function strongestAction(hits: RuleHit[]): Action | null; // order: go_to_hospital > call_contact > notify_contacts > log
```

**Behavior**
- Match by normalized phrase containment (whole-word aware). Case/diacritic-insensitive.
- Simple negation guard for **doctor symptom phrases only** ("walang pamamaga", "no swelling" → not a hit). Never apply the guard to universal phrases.
- If `requireConfirmation` is true and the action is not `go_to_hospital`: the agent reads back ("Narinig ko po na may pamamaga. Tama po ba?"). Yes → escalate. No → log as corrected, no escalation. Unclear twice → treat as uncertain and `notify_contacts`.
- **Uncertainty rule:** the same important answer misunderstood twice → `notify_contacts` (never guess).
- Unit-test: positive hits, negation, Taglish phrases, negator-inside-phrase, multiple hits, strongest-action ordering, empty input.

**Scheduler (`lib/schedule/`)**
- `getDueItems(patient, now)`: items whose `time_of_day` is within a window of `now` on an allowed day and not already completed today (from `events`). Use the patient's local timezone (default `Asia/Manila`).
- `getNextItem(patient, now)`.
- Retries: if a due item has no `confirmed_done`/`not_done` event: re-prompt at +5 min and +10 min (configurable; short for demo). After the last retry → `no_response` alert (`notify_contacts`).
- **No cron needed for MVP:** expose `/api/tick` that evaluates due items and missed heartbeats. Call it from the patient page heartbeat and from the admin dashboard polling. (A real deployment would use a scheduler.)
- No-response also fires if the patient's heartbeat is stale (page closed/phone off) while an item is due. Message honestly: "patient did not respond", not "patient is in danger".
- Demo mode: `/api/demo/trigger` marks an item due now and shortens retry gaps.

---

## 11. Voice agent behavior

The agent is a **delivery voice**, not a clinician. Build the system prompt dynamically per session from the DB.

**System prompt template (fill the `{{ }}` from the database)**
```
You are Alalay, a warm, calm voice assistant for an older adult named {{patient.name}}.
Speak in {{language_instruction}}. Use short sentences. Ask ONE question at a time. Speak slowly.
Address the patient respectfully (use "po").

YOU ARE NOT A DOCTOR. You never diagnose, never suggest medicines or doses, never change the plan.
You only use the information below. If asked something not covered, say you will ask the doctor and offer to alert a contact.

TODAY'S ITEM (if any): {{item.title}} at {{item.time}}
Instructions (read these as written, do not rephrase medical content): {{item.instructions}}
Precautions (read as written): {{item.precautions}}

GENERAL INSTRUCTIONS FROM THE DOCTOR: {{patient.general_instructions}}
FULL SCHEDULE: {{list of items with times}}
WARNING SIGNS THE DOCTOR LISTED (ask about these during check-in): {{labels only}}
EMERGENCY CONTACTS: {{names only}}

CONVERSATION FLOW for a due item:
1. Greet by name and say what it is time for.
2. Read the instructions and precautions.
3. Ask: has the patient done it? (wait for yes/no/not yet)
4. Ask how they feel and whether they have any of the doctor's warning signs. Ask one at a time.
5. Summarize in one sentence and say when you will remind next.

RULES:
- If the system gives you an ESCALATION instruction, say exactly the provided message first, then continue calmly.
- If the patient sounds unwell or asks for help and you are unsure, ask once, then tell them you will alert their contact.
- Never promise that help is on the way. Say you are alerting {{contact}} and tell the patient what to do next.
- If you did not understand an important answer, ask again once in simpler words. Do not guess.
```

**Q&A grounding:** answer only from schedule, instructions, precautions and general instructions. Not found → "Hindi ko po alam iyan. Itatanong ko po sa doktor ninyo." and write a `question_unanswered` event the clinician sees.

**Tone/pace:** slow, short, polite, no jargon, no long lists, never alarmist.

---

## 12. API routes

| Route | Purpose |
|---|---|
| `POST /api/admin/login` | Check shared password, set cookie |
| `CRUD /api/admin/patients`, `/contacts`, `/schedule`, `/rules` | Admin data |
| `GET /api/patient/[token]/state` | Patient plan, next item, due items, contacts (no admin fields) |
| `POST /api/heartbeat` | Patient page heartbeat; updates `last_heartbeat_at`; triggers tick |
| `POST /api/tick` | Evaluate due/missed items, create `no_response` alerts, return due items |
| `POST /api/agora/token` | Generate RTC token for patient session |
| `POST /api/agora/start` / `POST /api/agora/stop` | Start/stop the Agora agent for a session (server-side credentials) |
| `POST /api/llm` | **Brain proxy** for Agora's LLM calls (Approach A): load plan, run rules, call LLM, stream response |
| `POST /api/escalate` | Create alert + events (used by Approach B or the SOS button) |
| `POST /api/events` | Log events from the client |
| `GET /api/admin/feed` | Alerts + events for the dashboard |
| `POST /api/admin/ai/propose-rules` | (SHOULD) LLM proposes structured rules from the doctor's sentence |
| `POST /api/demo/trigger` | Demo mode trigger |

Security: patient routes authorize by `patient_token` only and must never return other patients' data or admin-only fields. Admin routes require the admin cookie. Validate all inputs (zod).

---

## 13. Safety & honesty requirements

- Show a visible disclaimer on admin and in the README: **decision-support for adherence and escalation; not a medical device; does not diagnose.**
- All seed medical content must be labeled **"DEMO PROTOCOL — not medical advice."** Never present invented clinical rules as real.
- AlalAI **does not see or examine the patient**; it only knows what the patient says. It detects **missed check-ins**, not falls.
- Hearing loss, unclear speech, and dementia reduce reliability. Deaf/hard-of-hearing patients are not served by this version. Say so.
- **Privacy:** store only what the plan needs; consent is needed to store health data and alert contacts (check the Data Privacy Act with someone qualified). Don't log raw audio. Store transcripts only if needed for the event feed, and say so.
- Never log or print API secrets.

---

## 14. Seed data (DEMO PROTOCOL — not medical advice)

Patient: **Lolo Ben**, language `tl-en`, address "Sample St., Quezon City (demo)".
Contacts: Ana (daughter, priority 1), Barangay Health Worker (priority 2). Use fake phone numbers.
Hospital: "Demo General Hospital" + fake number.

Schedule (times adjustable; demo can trigger now):
1. **Medicine A (demo)** — 08:00 — instructions: "Take 1 tablet with water after breakfast." precautions: "Do not take on an empty stomach."
2. **Wound dressing (demo)** — 09:00 — instructions: "Wash hands, remove old dressing, clean gently, apply new gauze. Ask a helper if you cannot do it yourself." precautions: "Watch for swelling, bad smell, or fever."
3. **Evening check-in (demo)** — 18:00 — instructions: "Let us talk about how your day went."

Warning signs:
- Swelling → phrases `{namamaga, pamamaga, swelling, swollen}` → `call_contact`, message: "Sasabihan ko po si Ana. Tawagan po natin siya ngayon."
- Bad smell → `{mabaho, may amoy, foul smell, bad smell}` → `notify_contacts`
- Fever → `{lagnat, nilalagnat, fever}` → `notify_contacts`
- Severe symptom combination: handled by universal safety net.

---

## 15. Acceptance tests (the demo must pass these)

1. Admin creates a patient with 2 contacts, 3 schedule items, 3 warning signs, and gets a patient link.
2. Opening the link on a phone and tapping once starts the voice session; AlalAI greets Lolo Ben by name.
3. Clicking **Trigger now** on an item makes AlalAI speak that item's instructions and precautions **exactly as the doctor wrote them**.
4. Saying "tapos na" logs `confirmed_done`.
5. Saying "namamaga ang paa ko" → read-back → "oo" → rule fires → alert appears on the dashboard within seconds → patient screen shows the **tap-to-call Ana** button.
6. Saying "hindi ako makahinga" triggers the universal safety net immediately, with no read-back.
7. Asking "anong oras ang susunod kong gamot?" is answered correctly from the schedule.
8. Asking "pwede ba akong uminom ng alak?" (not in plan) → "itatanong ko po sa doktor" + a `question_unanswered` event.
9. Letting a due item go unanswered through all retries creates a `no_response` alert.
10. Closing the patient page while an item is due creates a `no_response` alert (stale heartbeat).
11. Rules engine unit tests pass.
12. The README states limitations honestly.

---

## 16. Working rules for the coding agent

- **Plan before coding.** For each task, write a short plan, then implement. Make small, reviewable changes; one feature per task; commit after each working step.
- **Do not invent Agora API shapes.** Read the Agora docs or the Agora Skills/MCP. If a detail is unclear, write a tiny spike, run it, and report what actually works.
- **Rules engine = pure, tested, boring.** No LLM calls inside it.
- **Never hard-code medical content** outside the labeled seed file and the universal safety list.
- **Keep patient UI minimal**: giant buttons, high contrast, captions only. Do not add menus, forms, or settings to the patient side.
- **All user-facing patient strings** live in one file with Filipino and English versions.
- Validate inputs with zod. Never expose service keys to the browser (only the Agora App ID and short-lived tokens).
- Add `.env.example` with every variable name (no values).
- Write the README as you go, using the headings in section 17.
- If a requirement here is unclear or conflicts with reality (e.g. an Agora feature is unavailable), **stop and ask the human** with 2 concrete options. Do not silently change the design.

### Cut list (if time runs out, drop in this order)
1. Telegram/email notifications
2. Doctor-assist rule proposals
3. Multiple patients polish, QR code
4. Wake Lock
Never cut: Agora voice, rules engine, tap-to-call escalation, no-response alert, README honesty section.

---

## 17. README structure (maps to the booklet's submission fields)

1. **Project name & overview**
2. **Target market** — adults 60+ living alone (much of the day) with a clinician care plan, plus the clinics that discharge them
3. **Pain point (evidence)** — verified sources only; mark anything unverified as such
4. **How it works** — architecture diagram from section 4
5. **Strategic Agora integration** — exactly what Agora does (real-time voice session, speech in/out, agent lifecycle) and why it matters for this user
6. **Why voice is essential (subtraction test)** — patient side has no screen; clinician dashboard is an authoring tool
7. **Technology judgment** — what is deterministic code vs AI, and why
8. **Safety & limitations** (section 13)
9. **Sustainability & growth** — hypothesis: clinics/discharge programs and barangay health programs as customers; same engine for other prescribed home-care routines. State as hypothesis, not fact.
10. **Run it locally** + env vars + demo script
11. **Links**: video, live URL
