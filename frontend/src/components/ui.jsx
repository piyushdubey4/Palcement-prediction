export const pct = (v, d = 1) => `${(v * 100).toFixed(d)}%`

const RISK = {
  High: 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300',
  Medium: 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300',
  Low: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
}
export function RiskBadge({ risk }) {
  if (!risk) return <span className="badge bg-slate-100 text-slate-500 dark:bg-slate-800">Not assessed</span>
  return <span className={`badge ${RISK[risk]}`}>{risk} risk</span>
}

const LEVEL = {
  Excellent: 'text-emerald-600 dark:text-emerald-400',
  Good: 'text-brand-600 dark:text-brand-100',
  Average: 'text-amber-600 dark:text-amber-400',
  Poor: 'text-red-600 dark:text-red-400',
}
export const levelColor = (l) => LEVEL[l] || ''

export function Stat({ label, value, hint, className = '' }) {
  return (
    <div className="card">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`mt-1 text-2xl font-bold ${className}`}>{value}</div>
      {hint && <div className="mt-1 text-xs text-slate-500">{hint}</div>}
    </div>
  )
}

export function Empty({ children }) {
  return <div className="card py-12 text-center muted">{children}</div>
}

export function Tabs({ tabs, value, onChange }) {
  return (
    <div className="mb-5 flex flex-wrap gap-1 rounded-xl bg-slate-200/60 p-1 dark:bg-slate-800/60">
      {tabs.map(([key, label]) => (
        <button key={key} onClick={() => onChange(key)}
          className={`rounded-lg px-4 py-2 text-sm font-medium cursor-pointer ${value === key ? 'bg-white shadow-sm dark:bg-slate-900' : 'text-slate-600 dark:text-slate-400'}`}>
          {label}
        </button>
      ))}
    </div>
  )
}

export const fmtDate = (d) => new Date(d).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
