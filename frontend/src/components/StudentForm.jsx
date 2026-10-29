export const DEFAULT_INPUTS = {
  cgpa: 7.5, attendance: 80, sem1: 7.4, sem2: 7.5, sem3: 7.6, sem4: 7.5,
  aptitude: 65, coding: 60, dsa: 55, communication: 65,
  internships: 0, projects: 1, certifications: 1, backlogs: 0,
}

const GROUPS = [
  ['Academics', [
    ['cgpa', 'CGPA (0–10)', 0, 10, 0.01],
    ['attendance', 'Attendance %', 0, 100, 0.1],
    ['sem1', 'Sem 1 SGPA', 0, 10, 0.01],
    ['sem2', 'Sem 2 SGPA', 0, 10, 0.01],
    ['sem3', 'Sem 3 SGPA', 0, 10, 0.01],
    ['sem4', 'Sem 4 SGPA', 0, 10, 0.01],
    ['backlogs', 'Active backlogs', 0, 30, 1],
  ]],
  ['Skills (test scores 0–100)', [
    ['aptitude', 'Aptitude', 0, 100, 1],
    ['coding', 'Coding', 0, 100, 1],
    ['dsa', 'DSA', 0, 100, 1],
    ['communication', 'Communication', 0, 100, 1],
  ]],
  ['Experience', [
    ['internships', 'Internships', 0, 20, 1],
    ['projects', 'Projects', 0, 50, 1],
    ['certifications', 'Certifications', 0, 50, 1],
  ]],
]

export const FIELDS = GROUPS.flatMap(([, f]) => f)

export function toNumbers(values) {
  return Object.fromEntries(FIELDS.map(([k]) => [k, Number(values[k])]))
}

export default function StudentForm({ values, onChange, onSubmit, busy, submitLabel = 'Predict', sliders = false }) {
  const set = (k) => (e) => onChange({ ...values, [k]: e.target.value })
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit?.() }} className="space-y-6">
      {GROUPS.map(([title, fields]) => (
        <fieldset key={title}>
          <legend className="mb-3 text-sm font-semibold text-slate-900 dark:text-white">{title}</legend>
          <div className={`grid gap-3 ${sliders ? 'grid-cols-1' : 'grid-cols-2 sm:grid-cols-4'}`}>
            {fields.map(([k, label, min, max, step]) => (
              <div key={k}>
                <label className="label" htmlFor={k}>
                  {label}{sliders && <span className="float-right font-semibold text-slate-800 dark:text-slate-200">{values[k]}</span>}
                </label>
                {sliders ? (
                  <input id={k} type="range" className="w-full accent-brand-600" min={min} max={Math.min(max, k === 'projects' || k === 'certifications' ? 10 : max)} step={step} value={values[k]} onChange={set(k)} />
                ) : (
                  <input id={k} type="number" className="input" required min={min} max={max} step={step} value={values[k]} onChange={set(k)} />
                )}
              </div>
            ))}
          </div>
        </fieldset>
      ))}
      {onSubmit && <button className="btn-primary w-full sm:w-auto" disabled={busy}>{busy ? 'Working…' : submitLabel}</button>}
    </form>
  )
}
