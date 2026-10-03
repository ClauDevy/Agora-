'use client';

// Edit patient — loads the full patient via GET /api/admin/patients/[id],
// pre-fills the same authoring form, and saves via PUT (replace-all plan).
// Shares the field structure/UX with the New Patient page.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';

type TaskType = 'confirm' | 'coach' | 'checkin';
type AnswerType = 'yes_no' | 'number';
interface ContactRow { name: string; relationship: string; phone: string }
interface QuestionRow { key: string; ask: string; type: AnswerType }
interface TaskRow {
  type: TaskType; time: string; text: string; instructions: string;
  precautions: string; stepsText: string; needs_helper: boolean; questions: QuestionRow[];
}
interface RuleRow {
  label: string; key: string; answerKind: 'yes_no' | 'number';
  op: string; value: string; then_level: 1 | 2 | 3;
}

const inputCls =
  'w-full rounded-lg border border-[color:var(--card-border)] bg-background/60 px-3 py-2 text-foreground outline-none focus:border-[color:var(--primary)] focus:ring-2 focus:ring-[color:var(--primary)]/30';
const labelCls = 'block text-sm font-medium text-foreground';
const sectionCls =
  'rounded-[16px] border border-[color:var(--card-border)] bg-[color:var(--surface)]/70 p-5 sm:p-6';
const btnGhost =
  'rounded-lg border border-[color:var(--card-border)] px-3 py-1.5 text-sm text-muted-foreground transition hover:text-foreground';
const TIME_PRESETS = [
  { label: 'Morning', value: '08:00' },
  { label: 'Noon', value: '12:00' },
  { label: 'Afternoon', value: '15:00' },
  { label: 'Evening', value: '18:00' },
  { label: 'Night', value: '21:00' },
];

function normalizeTime(raw: string): string {
  const s = raw.trim().toLowerCase();
  if (!s) return s;
  const ampm = /(am|pm)$/.exec(s)?.[1];
  const digits = s.replace(/[^0-9:]/g, '');
  let h: number, m: number;
  if (digits.includes(':')) {
    const [hh, mm] = digits.split(':');
    h = parseInt(hh, 10); m = parseInt(mm ?? '0', 10);
  } else if (digits.length <= 2) {
    h = parseInt(digits, 10); m = 0;
  } else {
    h = parseInt(digits.slice(0, digits.length - 2), 10);
    m = parseInt(digits.slice(-2), 10);
  }
  if (Number.isNaN(h) || Number.isNaN(m)) return raw;
  if (ampm === 'pm' && h < 12) h += 12;
  if (ampm === 'am' && h === 12) h = 0;
  if (h < 0 || h > 23 || m < 0 || m > 59) return raw;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export default function EditPatientPage() {
  const params = useParams();
  const router = useRouter();
  const id = String(params.id);

  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [language, setLanguage] = useState('en');
  const [illnesses, setIllnesses] = useState('');
  const [generalInstructions, setGeneralInstructions] = useState('');
  const [hospitalName, setHospitalName] = useState('');
  const [hospitalPhone, setHospitalPhone] = useState('');
  const [emergencyNumber, setEmergencyNumber] = useState('');
  const [descriptiveWarnings, setDescriptiveWarnings] = useState('');
  const [contacts, setContacts] = useState<ContactRow[]>([]);
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [rules, setRules] = useState<RuleRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/admin/patients/${id}`);
        if (res.status === 404) { setNotFound(true); return; }
        const { patient } = await res.json();
        setName(patient.name ?? '');
        setAddress(patient.address ?? '');
        setLanguage(patient.language ?? 'en');
        setIllnesses(patient.illnesses ?? '');
        setGeneralInstructions(patient.general_instructions ?? '');
        setHospitalName(patient.hospital_name ?? '');
        setHospitalPhone(patient.hospital_phone ?? '');
        setEmergencyNumber(patient.emergency_number ?? '');
        setDescriptiveWarnings(patient.descriptive_warnings ?? '');
        setContacts(
          (patient.contacts ?? []).map((c: { name?: string; relationship?: string; phone?: string }) => ({
            name: c.name ?? '', relationship: c.relationship ?? '', phone: c.phone ?? '',
          })),
        );
        setTasks(
          (patient.tasks ?? []).map((t: {
            type: TaskType; time: string; text?: string; instructions?: string;
            precautions?: string; steps?: string[]; needs_helper?: boolean; questions?: QuestionRow[];
          }) => ({
            type: t.type, time: t.time, text: t.text ?? '',
            instructions: t.instructions ?? '', precautions: t.precautions ?? '',
            stepsText: (t.steps ?? []).join('\n'), needs_helper: !!t.needs_helper,
            questions: t.questions ?? [],
          })),
        );
        setRules(
          (patient.rules ?? []).map((r: { conditions: { key: string; op: string; value: string | number }[]; then_level: 1 | 2 | 3 }) => {
            const c = r.conditions[0] ?? { key: '', op: '==', value: 'yes' };
            const isNum = typeof c.value === 'number';
            return {
              label: '', key: c.key, answerKind: isNum ? 'number' : 'yes_no',
              op: c.op, value: String(c.value), then_level: r.then_level,
            } as RuleRow;
          }),
        );
      } catch {
        setError('Failed to load patient.');
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  function updateTask(i: number, patch: Partial<TaskRow>) {
    setTasks((prev) => prev.map((t, j) => (j === i ? { ...t, ...patch } : t)));
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const payload = {
        name, address: address || undefined, language,
        illnesses: illnesses || undefined,
        general_instructions: generalInstructions || undefined,
        hospital_name: hospitalName || undefined,
        hospital_phone: hospitalPhone || undefined,
        emergency_number: emergencyNumber || undefined,
        descriptive_warnings: descriptiveWarnings || undefined,
        contacts: contacts.filter((c) => c.name.trim() && c.phone.trim()).map((c, idx) => ({
          name: c.name, relationship: c.relationship || undefined, phone: c.phone, priority: idx + 1,
        })),
        tasks: tasks.map((t) => ({
          type: t.type, time: t.time,
          ...(t.type === 'confirm' && { text: t.text, instructions: t.instructions || undefined, precautions: t.precautions || undefined }),
          ...(t.type === 'coach' && { steps: t.stepsText.split('\n').map((s) => s.trim()).filter(Boolean), needs_helper: t.needs_helper, precautions: t.precautions || undefined }),
          ...(t.type === 'checkin' && { questions: t.questions.filter((q) => q.key.trim() && q.ask.trim()) }),
        })),
        rules: rules.filter((r) => r.key.trim()).map((r) => ({
          conditions: [{ key: r.key, op: r.op, value: r.answerKind === 'number' && Number.isFinite(Number(r.value)) ? Number(r.value) : r.value }],
          then_level: r.then_level,
        })),
      };
      const res = await fetch(`/api/admin/patients/${id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.issues ? `Validation: ${body.issues.map((i: { message: string }) => i.message).join(', ')}` : (body.error ?? 'Failed to save.'));
        return;
      }
      setSaved(true);
      router.refresh();
    } catch {
      setError('Failed to save. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <main className="mx-auto max-w-3xl px-4 py-8 text-muted-foreground">Loading…</main>;
  if (notFound) return <main className="mx-auto max-w-3xl px-4 py-8 text-muted-foreground">Patient not found.</main>;

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
      <Link href={`/clinician/patient/${id}`} className="text-sm text-muted-foreground hover:text-foreground">← Back</Link>
      <h1 className="mt-2 text-3xl font-bold tracking-tight text-foreground">Edit patient</h1>

      <div className="mt-6 space-y-6">
        <section className={sectionCls}>
          <h2 className="text-lg font-semibold text-foreground">Patient details</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className={labelCls}>Name*<input className={`mt-1 ${inputCls}`} value={name} onChange={(e) => setName(e.target.value)} /></label>
            <label className={labelCls}>Language
              <select className={`mt-1 ${inputCls}`} value={language} onChange={(e) => setLanguage(e.target.value)}>
                <option value="en">English (default)</option><option value="tl">Tagalog</option><option value="tl-en">Taglish</option>
              </select>
            </label>
            <label className={`${labelCls} sm:col-span-2`}>Address<input className={`mt-1 ${inputCls}`} value={address} onChange={(e) => setAddress(e.target.value)} /></label>
            <label className={`${labelCls} sm:col-span-2`}>Illnesses / diseases<textarea className={`mt-1 ${inputCls}`} rows={2} value={illnesses} onChange={(e) => setIllnesses(e.target.value)} /></label>
            <label className={`${labelCls} sm:col-span-2`}>General instructions<textarea className={`mt-1 ${inputCls}`} rows={3} value={generalInstructions} onChange={(e) => setGeneralInstructions(e.target.value)} /></label>
            <label className={labelCls}>Hospital name<input className={`mt-1 ${inputCls}`} value={hospitalName} onChange={(e) => setHospitalName(e.target.value)} /></label>
            <label className={labelCls}>Hospital phone<input className={`mt-1 ${inputCls}`} value={hospitalPhone} onChange={(e) => setHospitalPhone(e.target.value)} /></label>
            <label className={labelCls}>Emergency number<input className={`mt-1 ${inputCls}`} value={emergencyNumber} onChange={(e) => setEmergencyNumber(e.target.value)} /></label>
          </div>
        </section>

        <section className={sectionCls}>
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-foreground">Emergency contacts</h2>
            <button className={btnGhost} onClick={() => setContacts([...contacts, { name: '', relationship: '', phone: '' }])}>+ Add contact</button>
          </div>
          <div className="mt-4 space-y-3">
            {contacts.map((c, i) => (
              <div key={i} className="grid gap-3 sm:grid-cols-[1fr_1fr_1fr_auto]">
                <input className={inputCls} placeholder="Name" value={c.name} onChange={(e) => setContacts(contacts.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
                <input className={inputCls} placeholder="Relationship" value={c.relationship} onChange={(e) => setContacts(contacts.map((x, j) => (j === i ? { ...x, relationship: e.target.value } : x)))} />
                <input className={inputCls} placeholder="Phone" value={c.phone} onChange={(e) => setContacts(contacts.map((x, j) => (j === i ? { ...x, phone: e.target.value } : x)))} />
                <button className={btnGhost} onClick={() => setContacts(contacts.filter((_, j) => j !== i))}>✕</button>
              </div>
            ))}
          </div>
        </section>

        <section className={sectionCls}>
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-foreground">Care-plan tasks</h2>
            <button className={btnGhost} onClick={() => setTasks([...tasks, { type: 'confirm', time: '12:00', text: '', instructions: '', precautions: '', stepsText: '', needs_helper: false, questions: [] }])}>+ Add task</button>
          </div>
          <div className="mt-4 space-y-4">
            {tasks.map((t, i) => (
              <div key={i} className="rounded-lg border border-[color:var(--card-border)] bg-background/40 p-4">
                <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
                  <label className={labelCls}>Type
                    <select className={`mt-1 ${inputCls}`} value={t.type} onChange={(e) => updateTask(i, { type: e.target.value as TaskType })}>
                      <option value="confirm">Reminder (did you do it?)</option>
                      <option value="coach">Instructional (step-by-step)</option>
                      <option value="checkin">Check-in (questions)</option>
                    </select>
                  </label>
                  <label className={labelCls}>Time
                    <input type="text" inputMode="numeric" placeholder="e.g. 4:20 or 16:20" className={`mt-1 ${inputCls}`} value={t.time} onChange={(e) => updateTask(i, { time: e.target.value })} onBlur={(e) => updateTask(i, { time: normalizeTime(e.target.value) })} />
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {TIME_PRESETS.map((p) => (
                        <button key={p.value} type="button" onClick={() => updateTask(i, { time: p.value })}
                          className={`rounded-full px-2.5 py-1 text-xs transition ${t.time === p.value ? 'bg-[color:var(--primary)] text-[color:var(--primary-foreground)]' : 'border border-[color:var(--card-border)] text-muted-foreground hover:text-foreground'}`}>
                          {p.label}
                        </button>
                      ))}
                    </div>
                  </label>
                  <button className={`${btnGhost} self-end`} onClick={() => setTasks(tasks.filter((_, j) => j !== i))}>Remove</button>
                </div>
                {t.type === 'confirm' && (
                  <div className="mt-3 space-y-3">
                    <input className={inputCls} placeholder="What to confirm" value={t.text} onChange={(e) => updateTask(i, { text: e.target.value })} />
                    <textarea className={inputCls} rows={2} placeholder="Instructions" value={t.instructions} onChange={(e) => updateTask(i, { instructions: e.target.value })} />
                    <textarea className={inputCls} rows={2} placeholder="Precautions" value={t.precautions} onChange={(e) => updateTask(i, { precautions: e.target.value })} />
                  </div>
                )}
                {t.type === 'coach' && (
                  <div className="mt-3 space-y-3">
                    <textarea className={inputCls} rows={4} placeholder="Steps — one per line" value={t.stepsText} onChange={(e) => updateTask(i, { stepsText: e.target.value })} />
                    <label className="flex items-center gap-2 text-sm text-foreground"><input type="checkbox" checked={t.needs_helper} onChange={(e) => updateTask(i, { needs_helper: e.target.checked })} />Needs a helper</label>
                    <textarea className={inputCls} rows={2} placeholder="Precautions" value={t.precautions} onChange={(e) => updateTask(i, { precautions: e.target.value })} />
                  </div>
                )}
                {t.type === 'checkin' && (
                  <div className="mt-3 space-y-3">
                    {t.questions.map((q, qi) => (
                      <div key={qi} className="grid gap-2 sm:grid-cols-[1fr_2fr_1fr_auto]">
                        <input className={inputCls} placeholder="key" value={q.key} onChange={(e) => updateTask(i, { questions: t.questions.map((x, k) => (k === qi ? { ...x, key: e.target.value } : x)) })} />
                        <input className={inputCls} placeholder="Question" value={q.ask} onChange={(e) => updateTask(i, { questions: t.questions.map((x, k) => (k === qi ? { ...x, ask: e.target.value } : x)) })} />
                        <select className={inputCls} value={q.type} onChange={(e) => updateTask(i, { questions: t.questions.map((x, k) => (k === qi ? { ...x, type: e.target.value as AnswerType } : x)) })}>
                          <option value="yes_no">yes/no</option><option value="number">number</option>
                        </select>
                        <button className={btnGhost} onClick={() => updateTask(i, { questions: t.questions.filter((_, k) => k !== qi) })}>✕</button>
                      </div>
                    ))}
                    <button className={btnGhost} onClick={() => updateTask(i, { questions: [...t.questions, { key: '', ask: '', type: 'yes_no' }] })}>+ Add question</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>

        <section className={sectionCls}>
          <h2 className="text-lg font-semibold text-foreground">Warning signs</h2>
          <div className="mt-3">
            <label className={labelCls}>Describe what to watch for (plain words)
              <textarea className={`mt-1 ${inputCls}`} rows={3} value={descriptiveWarnings} onChange={(e) => setDescriptiveWarnings(e.target.value)} />
            </label>
          </div>
          <div className="mt-6 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground">Measurable rules (auto-escalate)</h3>
            <button className={btnGhost} onClick={() => setRules([...rules, { label: '', key: '', answerKind: 'yes_no', op: '==', value: 'yes', then_level: 2 }])}>+ Add rule</button>
          </div>
          <div className="mt-4 space-y-3">
            {rules.map((r, i) => (
              <div key={i} className="rounded-lg border border-[color:var(--card-border)] bg-background/40 p-3">
                <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                  <input className={inputCls} placeholder="Which question? (key)" value={r.key} onChange={(e) => setRules(rules.map((x, j) => (j === i ? { ...x, key: e.target.value } : x)))} />
                  <button className={btnGhost} onClick={() => setRules(rules.filter((_, j) => j !== i))}>Remove</button>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span className="text-sm text-muted-foreground">Trigger when the answer is</span>
                  <select className="rounded-lg border border-[color:var(--card-border)] bg-background/60 px-2 py-1.5 text-sm text-foreground" value={r.answerKind}
                    onChange={(e) => { const k = e.target.value as 'yes_no' | 'number'; setRules(rules.map((x, j) => (j === i ? { ...x, answerKind: k, op: k === 'yes_no' ? '==' : '>=', value: k === 'yes_no' ? 'yes' : '8' } : x))); }}>
                    <option value="yes_no">yes / no</option><option value="number">a number</option>
                  </select>
                  {r.answerKind === 'yes_no' ? (
                    <select className="rounded-lg border border-[color:var(--card-border)] bg-background/60 px-2 py-1.5 text-sm text-foreground" value={r.value} onChange={(e) => setRules(rules.map((x, j) => (j === i ? { ...x, op: '==', value: e.target.value } : x)))}>
                      <option value="yes">yes</option><option value="no">no</option>
                    </select>
                  ) : (
                    <>
                      <select className="rounded-lg border border-[color:var(--card-border)] bg-background/60 px-2 py-1.5 text-sm text-foreground" value={r.op} onChange={(e) => setRules(rules.map((x, j) => (j === i ? { ...x, op: e.target.value } : x)))}>
                        <option value=">=">at least (≥)</option><option value="<=">at most (≤)</option><option value=">">greater than</option><option value="<">less than</option><option value="==">exactly (=)</option>
                      </select>
                      <input type="number" className="w-20 rounded-lg border border-[color:var(--card-border)] bg-background/60 px-2 py-1.5 text-sm text-foreground" value={r.value} onChange={(e) => setRules(rules.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))} />
                    </>
                  )}
                  <span className="text-sm text-muted-foreground">→ escalate to</span>
                  <select className="rounded-lg border border-[color:var(--card-border)] bg-background/60 px-2 py-1.5 text-sm text-foreground" value={r.then_level} onChange={(e) => setRules(rules.map((x, j) => (j === i ? { ...x, then_level: Number(e.target.value) as 1 | 2 | 3 } : x)))}>
                    <option value={1}>Level 1 (note)</option><option value={2}>Level 2 (contact)</option><option value={3}>Level 3 (urgent)</option>
                  </select>
                </div>
              </div>
            ))}
          </div>
        </section>

        {error && <p className="rounded-lg border border-[color:var(--destructive)]/40 bg-[color:var(--destructive)]/10 px-4 py-3 text-sm text-[color:var(--destructive)]" role="alert">{error}</p>}
        {saved && <p className="rounded-lg border border-[color:var(--success)]/40 bg-[color:var(--success)]/10 px-4 py-3 text-sm text-[color:var(--success)]">Saved ✓</p>}

        <div className="flex flex-wrap gap-2">
          <button onClick={handleSave} disabled={saving || !name.trim()} className="rounded-lg bg-[color:var(--primary)] px-8 py-3 font-semibold text-[color:var(--primary-foreground)] transition hover:opacity-90 disabled:opacity-50">
            {saving ? 'Saving…' : 'Save changes'}
          </button>
          <Link href={`/clinician/patient/${id}`} className={btnGhost + ' px-6 py-3'}>Done</Link>
        </div>
      </div>
    </main>
  );
}
