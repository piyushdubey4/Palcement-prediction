import { useCallback, useEffect, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import api, { errorMessage } from '../api'
import { useAuth } from '../context/AuthContext'
import StudentForm, { DEFAULT_INPUTS, toNumbers } from '../components/StudentForm'
import ReportView from '../components/ReportView'
import { Empty, fmtDate, pct, RiskBadge, Tabs } from '../components/ui'
import { downloadReport } from '../lib/pdf'

const TABS = [['predict', 'AI prediction'], ['report', 'Latest report'], ['history', 'History'], ['whatif', 'What-if simulator'], ['profile', 'Profile & mentor notes']]

export default function StudentDashboard() {
  const { user, setUser } = useAuth()
  const [tab, setTab] = useState('predict')
  const [inputs, setInputs] = useState(user.profile || DEFAULT_INPUTS)
  const [history, setHistory] = useState([])
  const [busy, setBusy] = useState(false)

  const loadHistory = useCallback(async () => {
    try { setHistory((await api.get('/predict/history')).data) } catch (e) { toast.error(errorMessage(e)) }
  }, [])
  useEffect(() => { loadHistory() }, [loadHistory])

  const predict = async () => {
    setBusy(true)
    try {
      const body = toNumbers(inputs)
      const { data } = await api.post('/predict/full-report', body)
      setHistory((h) => [data, ...h])
      setUser({ ...user, profile: body })
      toast.success('Report generated and saved')
      setTab('report')
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  const latest = history[0]
  return (
    <div>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Hi {user.name.split(' ')[0]} 👋</h1>
          <p className="muted">{[user.branch, user.year && `Year ${user.year}`, user.roll_no].filter(Boolean).join(' · ') || 'Complete your profile in the Profile tab.'}</p>
        </div>
        {latest && <div className="text-right text-sm">Last assessed {fmtDate(latest.created_at)} · <RiskBadge risk={latest.risk_flag} /></div>}
      </div>
      <Tabs tabs={TABS} value={tab} onChange={setTab} />

      {tab === 'predict' && (
        <div className="card">
          <h2 className="h2">Enter your academic and skill data</h2>
          <p className="mb-5 muted">Your last submission is pre-filled. Each prediction is saved to your history.</p>
          <StudentForm values={inputs} onChange={setInputs} onSubmit={predict} busy={busy} submitLabel="Generate full report" />
        </div>
      )}

      {tab === 'report' && (latest ? (
        <ReportView report={latest.report} inputs={latest.inputs} actions={
          <div className="flex flex-wrap gap-2">
            <button className="btn-primary" onClick={() => downloadReport({ user, report: latest.report, inputs: latest.inputs, createdAt: latest.created_at })}>⬇ Download PDF report</button>
            <button className="btn-ghost" onClick={() => setTab('whatif')}>Try what-if changes</button>
          </div>
        } />
      ) : <Empty>No report yet. Fill in the AI prediction form first.</Empty>)}

      {tab === 'history' && <History history={history} user={user} reload={loadHistory} />}
      {tab === 'whatif' && <WhatIf base={latest?.inputs || toNumbers(inputs)} />}
      {tab === 'profile' && <Profile />}
    </div>
  )
}

function History({ history, user, reload }) {
  if (!history.length) return <Empty>No predictions yet.</Empty>
  const series = [...history].reverse().map((h) => ({
    date: new Date(h.created_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }),
    'Placement %': +(h.placement_probability * 100).toFixed(1),
    'Performance': h.performance_score,
    'Readiness': h.readiness_index,
  }))
  const remove = async (id) => {
    if (!confirm('Delete this prediction from your history?')) return
    try { await api.delete(`/predict/history/${id}`); toast.success('Deleted'); reload() } catch (e) { toast.error(errorMessage(e)) }
  }
  return (
    <div className="space-y-5">
      <div className="card">
        <h2 className="h2">Progress over time</h2>
        <div className="mt-3 h-72">
          <ResponsiveContainer>
            <LineChart data={series} margin={{ left: -16, right: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,.3)" />
              <XAxis dataKey="date" tick={{ fontSize: 12, fill: 'currentColor' }} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 12, fill: 'currentColor' }} />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="Placement %" stroke="#10b981" strokeWidth={2} />
              <Line type="monotone" dataKey="Performance" stroke="#3b6ef5" strokeWidth={2} />
              <Line type="monotone" dataKey="Readiness" stroke="#f59e0b" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
      <div className="card overflow-x-auto p-0">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 text-xs uppercase text-slate-500 dark:border-slate-800">
            <tr><th className="p-3">Date</th><th className="p-3">Performance</th><th className="p-3">Placement</th><th className="p-3">Readiness</th><th className="p-3">Risk</th><th className="p-3">Gaps</th><th className="p-3"></th></tr>
          </thead>
          <tbody>
            {history.map((h) => (
              <tr key={h.id} className="border-b border-slate-100 last:border-0 dark:border-slate-800">
                <td className="p-3 whitespace-nowrap">{fmtDate(h.created_at)}</td>
                <td className="p-3">{h.performance_score} · {h.performance_level}</td>
                <td className="p-3">{pct(h.placement_probability)}</td>
                <td className="p-3">{h.readiness_index}</td>
                <td className="p-3"><RiskBadge risk={h.risk_flag} /></td>
                <td className="p-3">{h.report.skill_gaps.length}</td>
                <td className="p-3 whitespace-nowrap text-right">
                  <button className="text-brand-600 hover:underline" onClick={() => downloadReport({ user, report: h.report, inputs: h.inputs, createdAt: h.created_at })}>PDF</button>
                  <button className="ml-3 text-red-600 hover:underline" onClick={() => remove(h.id)}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function WhatIf({ base }) {
  const [values, setValues] = useState(base)
  const [baseline, setBaseline] = useState(null)
  const [result, setResult] = useState(null)
  const timer = useRef()

  useEffect(() => { api.post('/predict/simulate', toNumbers(base)).then((r) => setBaseline(r.data)).catch(() => {}) }, [base])
  useEffect(() => {
    clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      api.post('/predict/simulate', toNumbers(values)).then((r) => setResult(r.data)).catch((e) => toast.error(errorMessage(e)))
    }, 250)
    return () => clearTimeout(timer.current)
  }, [values])

  const delta = (k, f = (v) => v) => {
    if (!baseline || !result) return null
    const d = f(result[k]) - f(baseline[k])
    if (Math.abs(d) < 0.05) return <span className="text-slate-400">±0</span>
    return <span className={d > 0 ? 'text-emerald-600' : 'text-red-600'}>{d > 0 ? '+' : ''}{d.toFixed(1)}</span>
  }
  return (
    <div className="grid gap-5 lg:grid-cols-[360px_1fr]">
      <div className="card">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="h2">Adjust and see</h2>
          <button className="btn-ghost px-3 py-1 text-xs" onClick={() => setValues(base)}>Reset</button>
        </div>
        <p className="mb-4 muted">Nothing here is saved. Compare against your latest report.</p>
        <StudentForm values={values} onChange={setValues} sliders />
      </div>
      <div className="space-y-4">
        {result && (
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="card"><div className="text-xs uppercase text-slate-500">Placement %</div><div className="text-2xl font-bold">{pct(result.placement_probability)}</div><div className="text-sm">{delta('placement_probability', (v) => v * 100)} pts</div></div>
            <div className="card"><div className="text-xs uppercase text-slate-500">Performance</div><div className="text-2xl font-bold">{result.performance_score}</div><div className="text-sm">{delta('performance_score')} pts</div></div>
            <div className="card"><div className="text-xs uppercase text-slate-500">Readiness</div><div className="text-2xl font-bold">{result.readiness_index}</div><div className="text-sm">{delta('readiness_index')} pts</div></div>
          </div>
        )}
        {result && <ReportView report={result} inputs={toNumbers(values)} />}
      </div>
    </div>
  )
}

function Profile() {
  const { user, setUser } = useAuth()
  const [form, setForm] = useState({ name: user.name, roll_no: user.roll_no || '', branch: user.branch || '', year: user.year || '', target_role: user.target_role || '' })
  const [notes, setNotes] = useState([])
  useEffect(() => { api.get(`/students/${user.id}/notes`).then((r) => setNotes(r.data)).catch(() => {}) }, [user.id])
  const save = async (e) => {
    e.preventDefault()
    try {
      const body = { ...form, year: form.year ? Number(form.year) : null }
      for (const k of ['roll_no', 'branch', 'target_role']) if (!body[k]) body[k] = null
      const { data } = await api.patch('/auth/me', body)
      setUser(data)
      toast.success('Profile saved')
    } catch (err) { toast.error(errorMessage(err)) }
  }
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <form className="card space-y-4" onSubmit={save}>
        <h2 className="h2">My profile</h2>
        <div><label className="label">Name</label><input className="input" required minLength={2} value={form.name} onChange={set('name')} /></div>
        <div className="grid grid-cols-3 gap-3">
          <div><label className="label">Roll no.</label><input className="input" value={form.roll_no} onChange={set('roll_no')} /></div>
          <div><label className="label">Branch</label><input className="input" value={form.branch} onChange={set('branch')} /></div>
          <div><label className="label">Year</label><input className="input" type="number" min={1} max={5} value={form.year} onChange={set('year')} /></div>
        </div>
        <div><label className="label">Target role</label><input className="input" placeholder="e.g. Software Engineer, Data Analyst" value={form.target_role} onChange={set('target_role')} /></div>
        <div className="text-xs text-slate-500">Email: {user.email}</div>
        <button className="btn-primary">Save profile</button>
      </form>
      <div className="card">
        <h2 className="h2">Mentor notes</h2>
        <p className="muted">Guidance your faculty mentor has left for you.</p>
        {notes.length === 0 ? <p className="mt-4 text-sm text-slate-500">No notes yet.</p> : (
          <ul className="mt-3 space-y-3">
            {notes.map((n) => (
              <li key={n.id} className="rounded-lg bg-slate-50 p-3 text-sm dark:bg-slate-800/60">
                <p className="whitespace-pre-wrap">{n.text}</p>
                <div className="mt-1 text-xs text-slate-500">{n.author_name} · {fmtDate(n.created_at)}</div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
