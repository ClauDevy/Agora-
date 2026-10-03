'use client';

// New Patient authoring form (clinician). Responsive, repeatable sections:
// details, emergency contacts, care-plan tasks (confirm/coach/checkin with
// instructions + precautions), and warning-sign rules. On save it creates the
// patient + active plan and shows the generated /p/[token] link.

import { useState } from 'react';
import Link from 'next/link';
import { PatientLinkPanel } from '@/components/PatientLinkPanel';

type TaskType = 'confirm' | 'coach' | 'checkin';
type AnswerType = 'yes_no' | 'number';

interface ContactRow {
  name: string;
  relationship: string;
  phone: string;
}
interface QuestionRow {
  key: string;
  ask: string;
  type: AnswerType;
}
interface TaskRow {
  type: TaskType;
  time: string;
  text: string;
  instructions: string;
  precautions: string;
  stepsText: string; // newline-separated in the UI
  needs_helper: boolean;
  questions: QuestionRow[];
}
interface RuleRow {
  label: string;
  key: string;
  answerKind: 'yes_no' | 'number';
  op: string;
  value: string;
  then_level: 1 | 2 | 3;
  patient_message: string;
}

const inputCls =
  'w-full rounded-lg border border-[color:var(--card-border)] bg-background/60 px-3 py-2 text-foreground outline-none focus:border-[color:var(--primary)] focus:ring-2 focus:ring-[color:var(--primary)]/30';
const labelCls = 'block text-sm font-medium text-foreground';
const sectionCls =
  'rounded-[16px] border border-[color:var(--card-border)] bg-[color:var(--surface)]/70 p-5 sm:p-6';
const btnGhost =
  'rounded-lg border border-[color:var(--card-border)] px-3 py-1.5 text-sm text-muted-foreground transition hover:text-foreground';

// Quick time presets for friendlier schedule entry (no manual typing needed).
const TIME_PRESETS: { label: string; value: string }[] = [
  { label: 'Morning', value: '08:00' },
  { label: 'Noon', value: '12:00' },
  { label: 'Afternoon', value: '15:00' },
  { label: 'Evening', value: '18:00' },
  { label: 'Night', value: '21:00' },
];

// Normalize free-typed time (e.g. "4:20", "4:20 pm", "16:20", "420") to 24h HH:MM.
// Returns the input unchanged if it can't be parsed (validation catches it on save).
export function normalizeTime(raw: string): string {
  const s = raw.trim().toLowerCase();
  if (!s) return s;
  const ampm = /(am|pm)$/.exec(s)?.[1];
  const digits = s.replace(/[^0-9:]/g, '');
  let h: number, m: number;
  if (digits.includes(':')) {
    const [hh, mm] = digits.split(':');
    h = parseInt(hh, 10);
    m = parseInt(mm ?? '0', 10);
  } else if (digits.length <= 2) {
    h = parseInt(digits, 10);
    m = 0;
  } else {
    // e.g. "420" -> 4:20, "1620" -> 16:20
    h = parseInt(digits.slice(0, digits.length - 2), 10);
    m = parseInt(digits.slice(-2), 10);
  }
  if (Number.isNaN(h) || Number.isNaN(m)) return raw;
  if (ampm === 'pm' && h < 12) h += 12;
  if (ampm === 'am' && h === 12) h = 0;
  if (h < 0 || h > 23 || m < 0 || m > 59) return raw;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export default function NewPatientPage() {
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [language, setLanguage] = useState('en');
  const [generalInstructions, setGeneralInstructions] = useState('');
  const [illnesses, setIllnesses] = useState('');
  const [hospitalName, setHospitalName] = useState('');
  const [hospitalPhone, setHospitalPhone] = useState('');
  const [emergencyNumber, setEmergencyNumber] = useState('');

  const [contacts, setContacts] = useState<ContactRow[]>([
    { name: '', relationship: '', phone: '' },
  ]);
  const [tasks, setTasks] = useState<TaskRow[]>([
    {
      type: 'confirm',
      time: '08:00',
      text: '',
      instructions: '',
      precautions: '',
      stepsText: '',
      needs_helper: false,
      questions: [],
    },
  ]);
  const [rules, setRules] = useState<RuleRow[]>([]);
  const [descriptiveWarnings, setDescriptiveWarnings] = useState('');

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ id: string; token: string } | null>(
    null,
  );

  // --- helpers to mutate repeatable rows ---
  function updateTask(i: number, patch: Partial<TaskRow>) {
    setTasks((prev) => prev.map((t, j) => (j === i ? { ...t, ...patch } : t)));
  }
  function addQuestion(i: number) {
    updateTask(i, {
      questions: [
        ...tasks[i].questions,
        { key: '', ask: '', type: 'yes_no' },
      ],
    });
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const payload = {
        name,
        address: address || undefined,
        language,
        general_instructions: generalInstructions || undefined,
        illnesses: illnesses || undefined,
        hospital_name: hospitalName || undefined,
        hospital_phone: hospitalPhone || undefined,
        emergency_number: emergencyNumber || undefined,
        contacts: contacts
          .filter((c) => c.name.trim() && c.phone.trim())
          .map((c, idx) => ({
            name: c.name,
            relationship: c.relationship || undefined,
            phone: c.phone,
            priority: idx + 1,
          })),
        tasks: tasks.map((t) => ({
          type: t.type,
          time: t.time,
          ...(t.type === 'confirm' && {
            text: t.text,
            instructions: t.instructions || undefined,
            precautions: t.precautions || undefined,
          }),
          ...(t.type === 'coach' && {
            steps: t.stepsText
              .split('\n')
              .map((s) => s.trim())
              .filter(Boolean),
            needs_helper: t.needs_helper,
            instructions: t.instructions || undefined,
            precautions: t.precautions || undefined,
          }),
          ...(t.type === 'checkin' && {
            questions: t.questions.filter((q) => q.key.trim() && q.ask.trim()),
          }),
        })),
        rules: rules
          .filter((r) => r.key.trim())
          .map((r) => ({
            label: r.label || undefined,
            conditions: [
              {
                key: r.key,
                op: r.op,
                value:
                  r.op === '=='
                    ? r.value
                    : Number.isFinite(Number(r.value))
                      ? Number(r.value)
                      : r.value,
              },
            ],
            then_level: r.then_level,
            patient_message: r.patient_message || undefined,
          })),
        descriptive_warnings: descriptiveWarnings || undefined,
      };

      const res = await fetch('/api/admin/patients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(
          body.issues
            ? `Validation: ${body.issues.map((i: { message: string }) => i.message).join(', ')}`
            : (body.error ?? 'Failed to save.'),
        );
        return;
      }
      setCreated(body);
    } catch {
      setError('Failed to save. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  // Success screen: show the generated patient link.
  if (created) {
    return (
      <main className="mx-auto w-full max-w-2xl px-4 py-8 sm:px-6">
        <div className={sectionCls}>
          <h1 className="text-2xl font-bold text-foreground">
            Patient created ✓
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Share this private link with {name}. Opening it starts their voice
            assistant — no login, no reading required.
          </p>
          <div className="mt-5">
            <PatientLinkPanel token={created.token} patientName={name} />
          </div>
          <div className="mt-6 flex flex-wrap gap-2">
            <Link
              href="/clinician"
              className="rounded-lg bg-[color:var(--primary)] px-4 py-2 font-semibold text-[color:var(--primary-foreground)]"
            >
              Back to patients
            </Link>
            <button className={btnGhost} onClick={() => location.reload()}>
              Add another
            </button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
      <div className="mb-6">
        <Link href="/clinician" className="text-sm text-muted-foreground hover:text-foreground">
          ← Patients
        </Link>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-foreground">
          New patient
        </h1>
      </div>

      <div className="mb-6 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-300">
        AlalAI follows the instructions you write. It does not diagnose or
        replace clinical judgment. Use <strong>DEMO</strong> data only.
      </div>

      <div className="space-y-6">
        {/* --- Details --- */}
        <section className={sectionCls}>
          <h2 className="text-lg font-semibold text-foreground">Patient details</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className={labelCls}>
              Name*
              <input className={`mt-1 ${inputCls}`} value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <label className={labelCls}>
              Language
              <select className={`mt-1 ${inputCls}`} value={language} onChange={(e) => setLanguage(e.target.value)}>
                <option value="en">English (default)</option>
                <option value="tl">Tagalog</option>
                <option value="tl-en">Taglish</option>
              </select>
            </label>
            <label className={`${labelCls} sm:col-span-2`}>
              Address
              <input className={`mt-1 ${inputCls}`} value={address} onChange={(e) => setAddress(e.target.value)} />
            </label>
            <label className={`${labelCls} sm:col-span-2`}>
              Illnesses / diseases (conditions the agent may reference)
              <textarea className={`mt-1 ${inputCls}`} rows={2} value={illnesses} onChange={(e) => setIllnesses(e.target.value)} placeholder="e.g. Type 2 diabetes, hypertension" />
            </label>
            <label className={`${labelCls} sm:col-span-2`}>
              General instructions (the agent may read / answer from these)
              <textarea className={`mt-1 ${inputCls}`} rows={3} value={generalInstructions} onChange={(e) => setGeneralInstructions(e.target.value)} />
            </label>
            <label className={labelCls}>
              Hospital name
              <input className={`mt-1 ${inputCls}`} value={hospitalName} onChange={(e) => setHospitalName(e.target.value)} />
            </label>
            <label className={labelCls}>
              Hospital phone
              <input className={`mt-1 ${inputCls}`} value={hospitalPhone} onChange={(e) => setHospitalPhone(e.target.value)} />
            </label>
            <label className={labelCls}>
              Emergency number
              <input className={`mt-1 ${inputCls}`} value={emergencyNumber} onChange={(e) => setEmergencyNumber(e.target.value)} />
            </label>
          </div>
        </section>

        {/* --- Contacts --- */}
        <section className={sectionCls}>
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-foreground">Emergency contacts</h2>
            <button className={btnGhost} onClick={() => setContacts([...contacts, { name: '', relationship: '', phone: '' }])}>
              + Add contact
            </button>
          </div>
          <div className="mt-4 space-y-3">
            {contacts.map((c, i) => (
              <div key={i} className="grid gap-3 sm:grid-cols-[1fr_1fr_1fr_auto]">
                <input className={inputCls} placeholder="Name" value={c.name} onChange={(e) => setContacts(contacts.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
                <input className={inputCls} placeholder="Relationship" value={c.relationship} onChange={(e) => setContacts(contacts.map((x, j) => (j === i ? { ...x, relationship: e.target.value } : x)))} />
                <input className={inputCls} placeholder="Phone (fake for demo)" value={c.phone} onChange={(e) => setContacts(contacts.map((x, j) => (j === i ? { ...x, phone: e.target.value } : x)))} />
                <button className={btnGhost} onClick={() => setContacts(contacts.filter((_, j) => j !== i))} aria-label="Remove contact">✕</button>
              </div>
            ))}
          </div>
        </section>

        {/* --- Tasks --- */}
        <section className={sectionCls}>
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-foreground">Care-plan tasks</h2>
            <button
              className={btnGhost}
              onClick={() => setTasks([...tasks, { type: 'confirm', time: '12:00', text: '', instructions: '', precautions: '', stepsText: '', needs_helper: false, questions: [] }])}
            >
              + Add task
            </button>
          </div>
          <div className="mt-4 space-y-4">
            {tasks.map((t, i) => (
              <div key={i} className="rounded-lg border border-[color:var(--card-border)] bg-background/40 p-4">
                <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
                  <label className={labelCls}>
                    Type
                    <select className={`mt-1 ${inputCls}`} value={t.type} onChange={(e) => updateTask(i, { type: e.target.value as TaskType })}>
                      <option value="confirm">Reminder (did you do it?)</option>
                      <option value="coach">Instructional (step-by-step)</option>
                      <option value="checkin">Check-in (questions)</option>
                    </select>
                  </label>
                  <label className={labelCls}>
                    Time
                    <input
                      type="text"
                      inputMode="numeric"
                      placeholder="e.g. 4:20 or 16:20"
                      className={`mt-1 ${inputCls}`}
                      value={t.time}
                      onChange={(e) => updateTask(i, { time: e.target.value })}
                      onBlur={(e) => updateTask(i, { time: normalizeTime(e.target.value) })}
                    />
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {TIME_PRESETS.map((preset) => (
                        <button
                          key={preset.value}
                          type="button"
                          onClick={() => updateTask(i, { time: preset.value })}
                          className={`rounded-full px-2.5 py-1 text-xs transition ${
                            t.time === preset.value
                              ? 'bg-[color:var(--primary)] text-[color:var(--primary-foreground)]'
                              : 'border border-[color:var(--card-border)] text-muted-foreground hover:text-foreground'
                          }`}
                        >
                          {preset.label}
                        </button>
                      ))}
                    </div>
                  </label>
                  <button className={`${btnGhost} self-end`} onClick={() => setTasks(tasks.filter((_, j) => j !== i))}>Remove</button>
                </div>

                {t.type === 'confirm' && (
                  <div className="mt-3 space-y-3">
                    <input className={inputCls} placeholder="What to confirm (e.g. morning medicine)" value={t.text} onChange={(e) => updateTask(i, { text: e.target.value })} />
                    <textarea className={inputCls} rows={2} placeholder="Instructions (read verbatim)" value={t.instructions} onChange={(e) => updateTask(i, { instructions: e.target.value })} />
                    <textarea className={inputCls} rows={2} placeholder="Precautions / what to watch for" value={t.precautions} onChange={(e) => updateTask(i, { precautions: e.target.value })} />
                  </div>
                )}

                {t.type === 'coach' && (
                  <div className="mt-3 space-y-3">
                    <textarea className={inputCls} rows={4} placeholder="Steps — one per line" value={t.stepsText} onChange={(e) => updateTask(i, { stepsText: e.target.value })} />
                    <label className="flex items-center gap-2 text-sm text-foreground">
                      <input type="checkbox" checked={t.needs_helper} onChange={(e) => updateTask(i, { needs_helper: e.target.checked })} />
                      Needs a helper
                    </label>
                    <textarea className={inputCls} rows={2} placeholder="Precautions / what to watch for" value={t.precautions} onChange={(e) => updateTask(i, { precautions: e.target.value })} />
                  </div>
                )}

                {t.type === 'checkin' && (
                  <div className="mt-3 space-y-3">
                    {t.questions.map((q, qi) => (
                      <div key={qi} className="grid gap-2 sm:grid-cols-[1fr_2fr_1fr_auto]">
                        <input className={inputCls} placeholder="key (e.g. odor)" value={q.key} onChange={(e) => updateTask(i, { questions: t.questions.map((x, k) => (k === qi ? { ...x, key: e.target.value } : x)) })} />
                        <input className={inputCls} placeholder="Question to ask" value={q.ask} onChange={(e) => updateTask(i, { questions: t.questions.map((x, k) => (k === qi ? { ...x, ask: e.target.value } : x)) })} />
                        <select className={inputCls} value={q.type} onChange={(e) => updateTask(i, { questions: t.questions.map((x, k) => (k === qi ? { ...x, type: e.target.value as AnswerType } : x)) })}>
                          <option value="yes_no">yes/no</option>
                          <option value="number">number</option>
                        </select>
                        <button className={btnGhost} onClick={() => updateTask(i, { questions: t.questions.filter((_, k) => k !== qi) })}>✕</button>
                      </div>
                    ))}
                    <button className={btnGhost} onClick={() => addQuestion(i)}>+ Add question</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* --- Warning signs --- */}
        <section className={sectionCls}>
          <h2 className="text-lg font-semibold text-foreground">Warning signs</h2>

          {/* Descriptive (free-text) warning signs */}
          <div className="mt-3">
            <label className={labelCls}>
              Describe what to watch for (plain words)
              <textarea
                className={`mt-1 ${inputCls}`}
                rows={3}
                placeholder="e.g. If the wound looks worse, smells bad, or the patient feels very weak or dizzy, note it and contact family."
                value={descriptiveWarnings}
                onChange={(e) => setDescriptiveWarnings(e.target.value)}
              />
            </label>
            <p className="mt-1 text-xs text-muted-foreground">
              AlalAI will gently ask about these and flag them for you if the patient
              mentions them. These are observations — they do not auto-escalate.
            </p>
          </div>

          {/* Measurable rules */}
          <div className="mt-6 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground">
              Measurable rules (auto-escalate)
            </h3>
            <button className={btnGhost} onClick={() => setRules([...rules, { label: '', key: '', answerKind: 'yes_no', op: '==', value: 'yes', then_level: 2, patient_message: '' }])}>
              + Add rule
            </button>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            A measurable rule watches one check-in answer and auto-escalates deterministically. For a yes/no question, pick the answer that should trigger. For a number (like pain 0–10), pick a comparison and a value. Level 1 = note, 2 = contact family, 3 = urgent.
          </p>
          <div className="mt-4 space-y-3">
            {rules.map((r, i) => (
              <div key={i} className="rounded-lg border border-[color:var(--card-border)] bg-background/40 p-3">
                <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                  <input className={inputCls} placeholder="Label (e.g. Swelling)" value={r.label} onChange={(e) => setRules(rules.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
                  <input className={inputCls} placeholder="Which question? (key, e.g. odor)" value={r.key} onChange={(e) => setRules(rules.map((x, j) => (j === i ? { ...x, key: e.target.value } : x)))} />
                  <button className={btnGhost} onClick={() => setRules(rules.filter((_, j) => j !== i))}>Remove</button>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span className="text-sm text-muted-foreground">Trigger when the answer is</span>
                  <select
                    className="rounded-lg border border-[color:var(--card-border)] bg-background/60 px-2 py-1.5 text-sm text-foreground"
                    value={r.answerKind}
                    onChange={(e) => {
                      const kind = e.target.value as 'yes_no' | 'number';
                      setRules(rules.map((x, j) => (j === i ? { ...x, answerKind: kind, op: kind === 'yes_no' ? '==' : '>=', value: kind === 'yes_no' ? 'yes' : '8' } : x)));
                    }}
                  >
                    <option value="yes_no">yes / no</option>
                    <option value="number">a number</option>
                  </select>

                  {r.answerKind === 'yes_no' ? (
                    <select
                      className="rounded-lg border border-[color:var(--card-border)] bg-background/60 px-2 py-1.5 text-sm text-foreground"
                      value={r.value}
                      onChange={(e) => setRules(rules.map((x, j) => (j === i ? { ...x, op: '==', value: e.target.value } : x)))}
                    >
                      <option value="yes">yes</option>
                      <option value="no">no</option>
                    </select>
                  ) : (
                    <>
                      <select
                        className="rounded-lg border border-[color:var(--card-border)] bg-background/60 px-2 py-1.5 text-sm text-foreground"
                        value={r.op}
                        onChange={(e) => setRules(rules.map((x, j) => (j === i ? { ...x, op: e.target.value } : x)))}
                      >
                        <option value=">=">at least (≥)</option>
                        <option value="<=">at most (≤)</option>
                        <option value=">">greater than (&gt;)</option>
                        <option value="<">less than (&lt;)</option>
                        <option value="==">exactly (=)</option>
                      </select>
                      <input
                        type="number"
                        className="w-20 rounded-lg border border-[color:var(--card-border)] bg-background/60 px-2 py-1.5 text-sm text-foreground"
                        value={r.value}
                        onChange={(e) => setRules(rules.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))}
                      />
                    </>
                  )}

                  <span className="text-sm text-muted-foreground">→ escalate to</span>
                  <select
                    className="rounded-lg border border-[color:var(--card-border)] bg-background/60 px-2 py-1.5 text-sm text-foreground"
                    value={r.then_level}
                    onChange={(e) => setRules(rules.map((x, j) => (j === i ? { ...x, then_level: Number(e.target.value) as 1 | 2 | 3 } : x)))}
                  >
                    <option value={1}>Level 1 (note)</option>
                    <option value={2}>Level 2 (contact)</option>
                    <option value={3}>Level 3 (urgent)</option>
                  </select>
                </div>
              </div>
            ))}
          </div>
        </section>

        {error && (
          <p className="rounded-lg border border-[color:var(--destructive)]/40 bg-[color:var(--destructive)]/10 px-4 py-3 text-sm text-[color:var(--destructive)]" role="alert">
            {error}
          </p>
        )}

        <div className="sticky bottom-0 -mx-4 border-t border-[color:var(--card-border)] bg-background/90 px-4 py-4 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0">
          <button
            onClick={handleSave}
            disabled={saving || !name.trim()}
            className="w-full rounded-lg bg-[color:var(--primary)] px-4 py-3 font-semibold text-[color:var(--primary-foreground)] transition hover:opacity-90 disabled:opacity-50 sm:w-auto sm:px-8"
          >
            {saving ? 'Saving…' : 'Save patient & generate link'}
          </button>
        </div>
      </div>
    </main>
  );
}
