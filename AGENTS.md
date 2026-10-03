# AGENTS.md

Guidance for AI coding agents (and humans) working on **AlalAI**.

> Anything marked **TBD** is not decided yet. Anything marked **verify** came from quick research and must be checked against current docs before relying on it. Do not invent either one. Ask, or leave a clearly marked placeholder.

---

## 1. What this project is

AlalAI is a **voice-first care assistant** for adults 60+ who are home alone after hospital discharge. A clinician writes a care plan on a web page. At scheduled times AlalAI prompts the patient, who opens a **simple patient web app** and talks to the agent. The agent runs the plan by voice (medicine confirmations, wound-dressing coaching, symptom check-ins). If an answer matches a clinician-written warning sign, or the patient stops responding, AlalAI alerts emergency contacts and the clinic.

**Core principle (never violate):**

> **The doctor decides, the AI delivers, the rules escalate.**

Context: hackathon project built around **Agora Convo AI**, entered in the **Agora Track: Voice First**.

### Hackathon context and judging (from the participant booklet)

- **Event:** AWS Innovation Cup Championship, Agora Track "Voice First," October 3-4, 2026, AWS Philippines office, BGC, Taguig. **12-hour build window**, teams of up to 4. Voice First is an access lens across the domain tracks (Climate, Education, Health, Community). AlalAI is a **Health** project.
- **Required tech:** only **Agora** must be integrated. Any Agora technology counts (Convo AI, SDK, MCP, Skills, CLI). Everything else is our choice. Kiro and Amazon Quick are **optional** per the FAQ (the semi-final rubric text still mentions them, so ask coordinators if that matters).
- **Subtraction test:** if the product works just as well without voice, it is not voice-first and takes a **5-point penalty** under the MVP criterion. Treat this as a hard design constraint (see the patient client rules below).
- **Semi-finals:** judged on the submission and repo (1h30m review before pitches), then **4-min pitch + 5-min Q&A + 1-min tech setup**. All tracks pitch simultaneously, so the room is loud.

| Semi-final criterion | Weight | What the code and repo must show |
|---|---|---|
| MVP and technical implementation | 30% | Stable, fast, working end to end. Agora visibly integrated. Voice is essential. |
| Problem statement and domain fit | 25% | A real clinical workflow (discharge, medicines, wound care), not a theoretical need. |
| Technology and automation judgment | 25% | Plain-code rules where deterministic is better; AI only where it earns its place. Be ready to say what we chose *not* to use AI for. |
| Innovation and approach | 15% | Clinician-authored protocol plus the no-response safety net. |
| Live pitch and Q&A | 5% | One clear moment: the alert firing. Defend functional choices in domain Q&A. |

- **Grand finals (top 3 per track):** 5-min pitch + 5-min Q&A. Criteria: real-world impact 30%, practical deployment and feasibility 25% (clinical workflow, consent, regulatory), scalability and viability 20%, innovation 15%, presentation 10%.

### Two web surfaces, one Next.js app

| Surface | User | Purpose | Voice? |
|---|---|---|---|
| **Clinician dashboard** | Doctor / nurse | Create patient, build plan and rules, add contacts, review logs | No (authoring tool) |
| **Patient client app** | Older adult | Open from a link, tap one big button, then talk | **Yes. Voice does all the work.** |

Plus a **contact view / alerts** for relatives and barangay health workers (SMS or other notification, plus a simulated alert screen for demos).

**Patient client app rules (Voice First):**

- One screen, one huge button to start. Large type, high contrast, minimal text.
- The screen only starts the session and shows state (listening / speaking / ended). It never carries information the voice doesn't also carry.
- No login for the patient. Access is by a per-patient link (token) sent by SMS or push. Treat that link as sensitive. TBD: token expiry and revocation.
- If voice is removed, the patient app must do nothing useful (subtraction test).
- **Subtraction-test guardrail:** no text inputs, no yes/no or multiple-choice buttons for answering, no menus, no forms for the patient. Answers are spoken. Do not add a tap-to-answer fallback; if voice fails, the uncertainty rule alerts a contact instead. The one tap allowed is the big start button.
- Quickstart UI such as the transcript rail, pipeline metrics, and pre-call hero card may exist only in a clinician or debug view. The patient must never need them.

---

## 2. Hard safety rules (non-negotiable)

These override any feature request, refactor, or "improvement."

1. **The LLM never makes medical judgments.** No diagnosis, no severity assessment, no dosing advice, no dose changes, no "that sounds fine."
2. **Escalation is decided by deterministic code only** (the rules engine). Never route escalation decisions through an LLM.
3. **Rules run server-side only.** The browser transports audio and transcripts. It never decides levels or sends alerts, because a phone can lock, lose signal, or close the tab.
4. **The LLM's only jobs:** hold the conversation, and map messy speech ("medyo mabaho") onto **fixed answer fields**.
5. **Validate all extractor output** against the allowed values for that field. Anything invalid is treated as *unclear*, never guessed.
6. **Never guess on important answers.** Two failed attempts at the same answer, or signs of confusion, trigger the uncertainty rule (alert a contact).
7. **No free-text clinical rules.** Rules come from dropdowns/structured fields only.
8. **All clinical content is a placeholder** unless a clinician supplied it. Every threshold, warning sign, and timing must be labeled `DEMO PROTOCOL` in code comments, seed data, and UI.
9. **No real patient data** anywhere: not in seeds, tests, logs, screenshots, or the demo.
10. **Never claim capabilities we lack.** AlalAI cannot dispatch an ambulance, cannot detect falls, and cannot examine the patient. It detects *missed check-ins* and tells people what to do.
11. **Fail toward alerting.** On errors in the session flow, extractor, or rules engine, the safe default is to log and escalate to a contact, not to stay silent.
12. **Secrets never reach the browser.** Only variables meant to be public may use the `NEXT_PUBLIC_` prefix (see section 5).

---

## 3. Tech stack

- **Framework:** Next.js (App Router, TypeScript) with Node.js. Frontend and backend live in the same Next.js app (API routes / route handlers).
- **Runtime and package manager:** Node.js 22+ (to match the Agora Next.js quickstart, **verify** against its current README) and **npm**. Do not use pnpm or yarn. Keep only `package-lock.json`: if a scaffold or quickstart ships a `pnpm-lock.yaml`, delete it and run `npm install` so Vercel and teammates use one lockfile.
- **Hosting:** Vercel **Hobby (free)**. The web app must work as a deployed Vercel URL, openable on **laptops and phones**. Hobby is for non-commercial use, which fits the hackathon (**verify**).
- **Voice:** Agora Convo AI (see section 4).
- **Styling:** Tailwind CSS (default from the Next.js scaffold). Keep it simple.
- **Database:** TBD, **free tier only**. Candidates: Neon Postgres (free plan, available through the Vercel Marketplace) or Supabase (free plan). Decide in the first hour. Do not hand-roll storage.
- **Extractor LLM:** TBD, **free tier only**. Candidate: Gemini API free tier (Flash / Flash-Lite models) with a response schema. The conversation itself uses Agora's managed configuration. The extractor needs structured output that is validated in code.
- **No paid services.** See section 7.
- **Commands (if scaffolded from the Agora Next.js quickstart, **verify**):**

```
npm install
npm run dev               # local dev server
npm run lint
npm run typecheck
npm run build
npm run verify        # doctor + lint + typecheck + API checks + build, run before shipping
agora project doctor --deep   # checks Agora credentials, features, network, env binding
```

Scripts may differ if the project is not scaffolded from the quickstart. Update this list to match `package.json` once it exists.

---

## 4. Agora setup: install these first

AI coding agents must **consult the Agora skill or Agora docs MCP before writing any Agora code**. Do not guess API names, package exports, or config fields.

### 4.0 Official starter kit (from the booklet)

| Resource | Link |
|---|---|
| Agora Documentation | https://docs.agora.io/en/ |
| Agora Console | link in the booklet. **Every team member needs an active Agora Console account.** App ID and App Certificate come from here. |
| Agora Convo AI | https://www.agora.io/en/products/conversational-ai-engine/ |
| Agora Skills | https://github.com/agoraio/skills |
| Agora Agents SDK | https://docs.agora.io/en/api-reference/sdks |
| Agora MCP | https://docs.agora.io/en/realtime-media/cloud-recording/mcp (as listed in the booklet; the hosted server URL below is from Agora's docs, **verify** which to use) |
| Agora Workshop | https://tinyurl.com/agora-workshop |

### 4.1 Agora skills and docs MCP (for the coding agent)

| What | Install / location | Notes |
|---|---|---|
| **Agora Skills** (reference files covering Conversational AI, RTC, RTM, token generation) | `npx skills add github:AgoraIO/skills` | Recommended method. Activates automatically on tasks like "build a voice agent." |
| Same, as a Claude Code plugin | `/plugin marketplace add AgoraIO/skills` then `/plugin install agora` | Add `--scope project` to install for this repo only. |
| Same, manual | `git clone https://github.com/AgoraIO/skills.git ~/agora-skills`, then point the agent to `skills/agora/` | For tools without the skills CLI (Cursor, Windsurf, Copilot, etc. have their own steps in the repo README). |
| **Agora docs MCP server** | `https://mcp.agora.io` | Live Agora docs. Bundled when the skills are installed; can also be added alone. |

### 4.2 Agora CLI (project setup)

```
curl -fsSL https://raw.githubusercontent.com/AgoraIO/cli/main/install.sh | sh -s -- --add-to-path
agora login
agora init <project-name> --template nextjs     # scaffolds the Next.js voice quickstart, binds an Agora project, writes .env.local
agora project doctor --deep                      # run whenever the agent won't join or transcripts are missing
```

If the repo already exists: `agora project use <your-project>` then `agora project env write .env.local`. **verify** CLI commands against the current Agora CLI README.

### 4.3 Agora libraries the app is expected to use (**verify** exact names and versions in the quickstart's `package.json`; do not guess versions)

| Package / program | Role |
|---|---|
| `agora-agent-server-sdk` | **Server side.** Starts and stops agent sessions from Next.js route handlers. |
| `agora-agent-client-toolkit` | **Client side.** Transcript, agent state, metrics events. |
| `agora-agent-client-toolkit-react` | React bindings (provider and hooks) for the toolkit. |
| `agora-agent-uikit` | Optional React components (mic button, agent visualizer). Use only what the patient screen needs. |
| Agora RTC + RTM web SDKs and token builder | Browser audio join, RTM data channel, server-side token generation. Take the exact packages from the quickstart. |

How the quickstart works (reference model): the browser gets a combined RTC + RTM token from the server, joins the channel, the server invites a cloud agent into the same channel, the browser receives transcript and agent-state events over RTM, and a stop route ends the session. Start from this pattern instead of reinventing it. Recipe repos exist for custom LLM servers and MCP memory servers if ever needed. TBD whether we need them.

### 4.4 Things to verify in Agora docs before committing

- Whether **outbound phone calls (telephony)** are available. Not required: the web app is the primary path. Treat phone calls as roadmap.
- **Filipino / Taglish** speech recognition and synthesis quality. Test with real Taglish phrases early.
- **Interruption handling** ("teka lang").
- **How finalized answers get from the live conversation to the server-side extractor and rules engine** (transcript events relayed from the client, a custom LLM endpoint, tool calls, or another route). Decide once, document here, then stick to it. TBD.

---

## 5. Environment variables

Provided by the Agora Next.js quickstart (**verify**):

| Variable | Public? | Notes |
|---|---|---|
| `NEXT_PUBLIC_AGORA_APP_ID` | Yes | Agora App ID |
| `NEXT_AGORA_APP_CERTIFICATE` | **No, server only** | Agora App Certificate. Never prefix with `NEXT_PUBLIC_`. |
| `NEXT_PUBLIC_AGENT_UID` | Yes | Must match the agent UID used by the invite route |
| `NEXT_AGENT_GREETING` | No | Optional override of the agent's opening line |

Add more only when a service below is actually adopted. Provide an `.env.example` with names only. Set the same variables in Vercel Project Settings for Production and Preview. Never commit `.env.local`.

---

## 6. Architecture and session flow

```
Clinician dashboard ──► Care plan + rules + contacts (database)
                              │
Scheduler ──► at task time: send reminder link to patient (SMS / push)
                              │
Patient client app (phone or laptop browser)
   tap big button ──► token + invite-agent routes ──► Agora Convo AI agent joins
   voice in/out via Agora, transcript events back to client
                              │
              Server: answer extraction ──► fixed answer fields (validated)
                              │
              Server: rules engine (plain code) ──► Level 1/2/3
                              │
              Logs ──► Clinician view      Alerts ──► SMS / other channel / simulated contact view
```

| Component | Responsibility | AI involved? |
|---|---|---|
| Clinician dashboard | Plans, rules, contacts, logs | No |
| Scheduler | Fires each task, sends reminder, handles retries | No |
| Patient client app | Starts the session, shows state, carries audio | No (the agent is Agora's) |
| Agora Convo AI | Live voice conversation | Yes |
| Extractor | Maps spoken answers to fixed fields | Yes (output validated) |
| Rules engine | Matches rules, assigns level, triggers actions | **No** |
| Alert sender | Notifies contacts and clinic | No |
| Database + logs | Plans, answers, events | No |

---

## 7. External services (free, freemium, or trial only)

**Rule: no paid services.** Every service must have a free, freemium, or trial option that covers the hackathon, with no purchase. If a free limit is hit, fall back to the simulated path. Do not upgrade. Limits below come from quick research, so **verify** each on the provider's current page before relying on it. Everything must be usable from a laptop, a couple of phones, and team members' own accounts.

| Need | Free option | Free limits that matter (**verify**) | Test on laptop / phone |
|---|---|---|---|
| Hosting | **Vercel Hobby** | $0, no expiry, non-commercial use only. HTTPS URLs and Preview deployments. **Runtime logs are kept only about 1 hour**, so store our own decision log in the database. | Any browser, any phone |
| Voice | **Agora Convo AI** | **First 300 minutes free**, then billed per minute. Usage is tracked per developer account; watch it in the Agora Console. RTC also has a monthly free pool; check eligibility. | Browser mic on laptop and phone (needs HTTPS) |
| SMS | **Twilio free trial** | No credit card. 30-day trial with about 100 free SMS. **Can only send to verified numbers (up to 5)**, from a trial number, and messages carry a "Sent from a Twilio Trial account" prefix. Philippines sending permission must be enabled in the console. | Real SMS to team phones |
| SMS backup | **SMS.to free trial credits** | Free credits on sign-up (amount, Philippines delivery: unknown). Only if Twilio is blocked. | Team phones |
| Notification fallback | **Telegram Bot API** | Free. Each recipient starts the bot once. No carrier setup. Good for contact alerts if SMS is slow. | Telegram on phone or laptop |
| Notification fallback | **Web Push** (PWA) | Free. Android Chrome and desktop work. iOS needs the web app installed to the home screen. Can carry the patient reminder link. | Phone or laptop |
| Email fallback | **Resend** (or similar) free tier | Free tier exists. Check daily and monthly caps and whether a verified domain is required. Optional. | Any inbox |
| **Simulated alert** | Built-in "contact view" page | Free. **Required for the demo.** Same data and code path as real alerts, only the transport differs. Always log alerts regardless of transport. | Second phone or laptop |
| Scheduler | **Free external trigger + manual route** | **Vercel Cron on Hobby runs once per day with hour-level precision, so it cannot drive timed reminders.** Use a protected `run due tasks` route triggered by a free pinger (for example cron-job.org or a scheduled GitHub Actions workflow, both **verify**) plus a manual "run due tasks now" button for the demo. Protect the route with a secret. | Trigger manually in dev |
| Database | **Neon free plan** (via Vercel Marketplace) or **Supabase free plan** | Neon: about 0.5 GB per project and a monthly compute allowance; it scales to zero, so the **first query after idle is slow. Warm it before the demo.** Supabase: check inactivity pausing. | n/a |
| Extractor LLM | **Gemini API free tier** (Google AI Studio key) | Flash and Flash-Lite models only, with per-minute and per-day request caps (roughly 15 RPM and 1,500 per day as of mid-2026). **Free-tier inputs may be used to improve Google's models**, so send fake demo data only. | n/a |

**Budget the Agora minutes.** 300 free Convo AI minutes is the tightest limit in the stack. Always stop the agent when the session ends. Never leave a demo agent running. Keep test sessions short. Develop and test the rules engine, extractor, scheduler, and alerts **without live voice sessions** (fixtures and unit tests), and save live sessions for end-to-end checks and the demo. Reserve a chunk of the budget for the final run-throughs and pitch.

**Mic access on phones:** browsers only allow microphone use on HTTPS pages (and `localhost` on the same machine). To test the patient app on a phone, use a Vercel Preview/Production URL or an HTTPS tunnel. Do not expect `http://<laptop-ip>:3000` to get mic access on a phone.

**Transport-agnostic alerts:** write one `sendAlert(level, contact, message)` interface with swappable channels (SMS, Telegram, simulated). The rules engine never knows which channel is used. Trial SMS can only reach verified numbers, so the simulated contact view stays the reliable demo path.

**Never send real alerts to real people during development.** Use team phones only.

---

## 8. Domain model

### Care plan block types

Every task is one of three reusable blocks. Do not add new block types without team agreement.

| Block | Purpose | Example |
|---|---|---|
| `confirm` | Ask whether a task was done | "Nainom na po ba ang gamot sa umaga?" |
| `coach` | Walk through steps one at a time, waiting for "okay na" | Wound dressing |
| `checkin` | Ask fixed questions and record answers | Odor? Fever? Pain 0-10? |

### Plan shape (illustrative, all values are DEMO PROTOCOL)

```json
{
  "patient": { "name": "Lolo Ben", "language": "tl-en", "contacts": ["Ana (daughter)", "Barangay Health Worker"] },
  "tasks": [
    { "id": "t1", "type": "confirm", "time": "08:00", "text": "gamot sa umaga" },
    { "id": "t2", "type": "coach", "time": "09:00",
      "steps": ["hugas ng kamay", "tanggalin ang lumang benda", "linisin", "ilagay ang bagong gasa"],
      "needs_helper": true },
    { "id": "t3", "type": "checkin", "time": "09:20", "questions": [
      { "key": "odor", "ask": "May amoy po ba ang sugat?", "type": "yes_no" },
      { "key": "fever", "ask": "May lagnat po ba kayo?", "type": "yes_no" },
      { "key": "pain", "ask": "Gaano po kasakit, mula 0 hanggang 10?", "type": "number" } ] }
  ],
  "rules": [
    { "if": "odor == yes", "then": "level_2" },
    { "if": "fever == yes AND odor == yes", "then": "level_3" },
    { "if": "pain >= 8", "then": "level_3" }
  ],
  "no_response": { "retries": 2, "gap_minutes": 5, "then": "level_2" }
}
```

Answer types are a closed set (`yes_no`, `number`, and any others the team adds explicitly). The extractor may only return a valid value of the declared type, or `unclear`.

### Escalation levels

| Level | Trigger examples | Action |
|---|---|---|
| **1: Note** | Missed dose, mild pain, postponed task | Log for clinician. No alert. |
| **2: Contact** | Warning sign reported; patient unreachable after retries; uncertainty rule fired | Alert emergency contact plus clinic log entry |
| **3: Urgent** | Severe warning combination; patient says they feel very unwell | Agent tells patient to call the local emergency number or go to hospital now (**confirm the correct hotline, TBD**). Alert all contacts. |

### Special rules

- **No-response rule:** the patient does not open the link or start the session within the window, or stops answering mid-session. Re-send the reminder (default 2 retries, 5 minutes apart), then Level 2. This is the signature feature; protect it with tests.
- **Uncertainty rule:** same answer misheard twice, or patient sounds confused, then alert a contact. Never guess.
- **Needs-helper flag:** before a wound task, the agent asks whether a helper is present.

---

## 9. Voice interaction guidelines

When writing prompts, scripts, or agent instructions:

- **Languages:** Filipino, Taglish, English. Default to polite forms (*po*, *opo*).
- **Pace:** short sentences, one question at a time, slow delivery.
- **Greeting:** brief and warm, by name ("Magandang umaga po, Lolo Ben.").
- **Listens for:** yes/no, numbers, and a small phrase set: `okay na`, `ulitin mo`, `teka lang`, `tulong`, `mali`, `hindi pala`.
- **Unclear speech:** one rephrase, then offer a simple yes/no choice, then treat as uncertain.
- **Read-backs:** always read back numbers and **any answer that triggers a rule**, and wait for confirmation.
- **Corrections:** `mali` / `hindi pala` overwrites the last answer before rules run.
- **Interruptions:** `teka lang` pauses and waits.
- **Closing:** one-line summary and what happens next ("Tatawag po ulit ako mamayang alas dos." Adjust wording to match the real channel, for example "Magpapadala po ulit ako ng paalala mamayang alas dos.").
- **Never** let the agent reassure medically ("okay lang yan," "hindi yan seryoso") or explain what a symptom means.

---

## 10. Engineering conventions

- **Rules engine = pure functions.** Input: plan rules + answers. Output: level + reasons. No network, no clock, no randomness, no LLM calls. This makes it trivially testable.
- **Keep AI behind a narrow interface.** The extractor takes an utterance plus a field spec and returns a valid value or `unclear`. Nothing else.
- **Structured logging for every decision:** timestamp, task id, raw transcript, extracted value, validation result, rule matched, level assigned, action taken. The clinician log and the demo both depend on this.
- **Validate plans on save and again before use.** Reject malformed plans.
- **Agora integration must stay visible and easy to find** in the codebase and README (judging requirement).
- **Keep changes small and readable.** This is a 12-hour build; prefer simple and working over clever. Do not add dependencies without a reason.
- **Do not impose a directory layout in docs or tooling.** Follow the conventions of the Next.js scaffold and the Agora quickstart.
- **Do not add a dependency or service that needs payment.** Check for a free tier first. Save free quota (Agora minutes, trial SMS, LLM requests) by testing with fixtures instead of live calls.

---

## 11. Testing requirements

Must have tests before the feature freeze:

- [ ] Each rule in the demo plan fires at the right level (and doesn't fire when it shouldn't)
- [ ] Boundary values (e.g., `pain >= 8` at 7, 8, 9)
- [ ] `unclear` or invalid extractor output never triggers a clinical rule, and triggers the uncertainty path after two strikes
- [ ] No-response: reminders re-sent at the configured gap, then Level 2 fires
- [ ] A correction (`mali`) overwrites the previous answer before rules run
- [ ] Alert sending failures are logged and surfaced, not swallowed
- [ ] Malformed plans are rejected by validation
- [ ] The simulated alert path and the real channel path produce the same log entries

Manual checks (on a deployed Vercel URL, not only localhost):

- [ ] Full demo script on a real phone, in Taglish, with the screen mostly ignored
- [ ] Mic permission flow on iOS Safari and Android Chrome
- [ ] Reminder link opens the patient app and starts the session in one tap
- [ ] Contact receives the alert on a second device

---

## 12. MVP scope

**Must have:** clinician dashboard with the three block types and dropdown rules; patient client app that runs a Confirm, Coach, and Check-in block live through Agora; rules engine with Levels 1-3 and the no-response rule; scheduler plus reminder link; at least one alert channel plus the simulated contact view; clinician-visible logs; README; one seeded demo patient labeled DEMO PROTOCOL; deployed on Vercel and stable and fast there (judges score stability and execution speed).

**Should have:** conversational rescheduling ("nakatulog ako"); needs-helper flag; trend flag by rule.

**Nice to have:** multiple patients, clinic-wide dashboard, regional languages, outbound phone calls if Agora telephony is confirmed.

### Do NOT build

- AI diagnosis or severity judgment
- Wound photo analysis
- Dosing advice or dose changes
- Fall detection
- Multiple demo conditions
- Anything using real patient data

If a task seems to require one of these, stop and flag it instead of building it.

---

## 13. Privacy and consent

- Treat all patient data as sensitive health data, even in the demo.
- Real deployment needs patient consent for storing health data and alerting contacts. The Data Privacy Act likely applies (**verify**).
- Log only what the product needs. Don't log secrets, and avoid full phone numbers in plain text where possible.
- Patient access links are credentials. Don't log them or put them in analytics.
- Seed data uses fictional people ("Lolo Ben," "Ana") and obviously fake phone numbers. For SMS testing, use only team members' own numbers, and keep them out of the repo.

---

## 14. Honest limits (keep consistent in docs, UI, and pitch)

- The AI cannot see or examine the patient; it only knows what is said.
- It detects missed check-ins, not falls or collapses.
- It cannot dispatch an ambulance.
- It does not diagnose, change doses, or replace a clinician. Describe it as an *adherence and escalation support tool*.
- The patient side needs a phone or device with a browser, a microphone, internet, and the ability to tap one button. Patients without these are not served by this version. Outbound phone calls would widen reach but are unconfirmed.
- Hearing loss, dementia, and unclear speech reduce reliability. Deaf and hard-of-hearing patients are not served by this version.
- Speech recognition can fail on Taglish, soft speech, and numbers. Read-backs and the uncertainty rule are the mitigation.
- Plan accuracy is the biggest safety dependency, so the plan is read back to the clinician for confirmation before activation.
- Market, pricing, and "who pays" claims are unvalidated hypotheses.
- The demo runs on free and trial tiers: trial SMS reaches verified numbers only, Agora free minutes are limited, and Vercel Hobby is non-commercial. A real deployment would need paid plans and registered SMS sender setup.

---

## 15. Definition of done (per change)

- [ ] Respects every rule in section 2
- [ ] Clinical values are labeled DEMO PROTOCOL
- [ ] Rules logic stays deterministic, server-side, and covered by tests
- [ ] Decisions are logged
- [ ] No secrets or real data committed or exposed to the browser
- [ ] Agora code was written after consulting the Agora skills or docs MCP
- [ ] Works on a deployed Vercel URL on a phone, not only on localhost
- [ ] README updated if setup, behavior, or limits changed

---

## 16. Submission checklist (booklet fields)

Teams must complete the submission template **before pitches begin**. Judges review it and the repo for 1h30m first. The fields "form the basis of project evaluation and may be updated," so recheck the booklet near the deadline.

| Field | What we put |
|---|---|
| Project Name | AlalAI |
| Project Overview | Voice care assistant that carries out a clinician-written care plan for older adults home alone, and alerts family and clinic when something is wrong. |
| Target Market | Adults 60+ recently discharged with a chronic condition or wound, living alone for much of the day, plus the clinics that discharge them. |
| Pain Point (Evidence) | Data-driven, **verified sources only**. No unchecked statistics. Ideally one real quote from a nurse or caregiver. TBD. |
| The "How" | Clinician plan builder, patient voice client through Agora Convo AI, deterministic rules engine, three escalation levels, no-response detection. |
| Strategic Integration | Say exactly what Agora does: live voice conversation, speech in and out, agent session management, and how that makes the patient experience possible without a screen. Mention telephony only if confirmed. |
| Sustainability and Growth | Hypotheses only (clinics and discharge programs as customers). Label unvalidated claims. |
| Video Demonstration | YouTube, Loom, or Drive link. Shows plan creation, voice session with an interruption, alert firing, no-response. |
| GitHub Repository Link | Must let judges **verify the Agora implementation**. README explains where and how Agora is used, setup, honest limits, and what we deliberately did not use AI for. |
| Website URL | Vercel production URL. Open it in a private window and on a phone to confirm it works logged out (preview deployments may sit behind Vercel authentication, **verify**). |

Timing and demo:

- Plan for a feature freeze with real buffer before the submission deadline. Do not spend the last hour on features.
- Pitch setup is 1 minute: pre-open the deployed app, the clinician dashboard, and a second device for the contact view before the slot.
- Loud room: use a headset or close mic. Keep a recorded backup of the demo.

---

## 17. When unsure

Ask the team rather than guessing, especially about: clinical content, hotline numbers, thresholds, consent wording, Agora capabilities, and SMS provider limits. A clearly marked placeholder is always better than a plausible-sounding invention.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
