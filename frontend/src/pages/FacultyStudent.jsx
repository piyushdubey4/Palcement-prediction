import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import api, { errorMessage } from '../api'
import ReportView from '../components/ReportView'
import { Empty, fmtDate, pct, RiskBadge } from '../components/ui'
import { downloadReport } from '../lib/pdf'

export default function FacultyStudent() {
  const { id } = useParams()
  const [data, setData] = useState(null)
  const [selected, setSelected] = useState(0)
  const [note, setNote] = useState('')

  const load = useCallback(() => api.get(`/students/${id}/data`).then((r) => setData(r.data)).catch((e) => toast.error(errorMessage(e))), [id])
  useEffect(() => { load() }, [load])

  const addNote = async (e) => {
    e.preventDefault()
    try { await api.post(`/students/${id}/notes`, { text: note }); setNote(''); toast.success('Note added'); load() } catch (err) { toast.error(errorMessage(err)) }
  }
  const delNote = async (nid) => {
    try { await api.delete(`/students/${id}/notes/${nid}`); load() } catch (err) { toast.error(errorMessage(err)) }
  }

  if (!data) return <div className="muted">Loading…</div>
  const { student, history, notes } = data
  const current = history[selected]
  return (
    <div className="space-y-5">
      <Link to="/faculty" className="text-sm text-brand-600 hover:underline">← Back to overview</Link>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{student.name}</h1>
          <p className="muted">{[student.email, student.roll_no, student.branch, student.year && `Year ${student.year}`, student.target_role].filter(Boolean).join(' · ')}</p>
        </div>
        {current && <button className="btn-primary" onClick={() => downloadReport({ user: student, report: current.report, inputs: current.inputs, createdAt: current.created_at })}>⬇ PDF report</button>}
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <div>
          {current ? <ReportView report={current.report} inputs={current.inputs} /> : <Empty>This student has not generated a report yet.</Empty>}
        </div>
        <div className="space-y-5">
          <div className="card">
            <h2 className="h2">Mentor notes</h2>
            <form onSubmit={addNote} className="mt-3 space-y-2">
              <textarea className="input min-h-24" required maxLength={2000} placeholder="Add guidance for this student…" value={note} onChange={(e) => setNote(e.target.value)} />
              <button className="btn-primary w-full">Add note</button>
            </form>
            <ul className="mt-4 space-y-2">
              {notes.map((n) => (
                <li key={n.id} className="rounded-lg bg-slate-50 p-3 text-sm dark:bg-slate-800/60">
                  <p className="whitespace-pre-wrap">{n.text}</p>
                  <div className="mt-1 flex justify-between text-xs text-slate-500"><span>{n.author_name} · {fmtDate(n.created_at)}</span><button className="text-red-600 hover:underline" onClick={() => delNote(n.id)}>Delete</button></div>
                </li>
              ))}
            </ul>
          </div>
          <div className="card">
            <h2 className="h2">History ({history.length})</h2>
            <ul className="mt-3 space-y-1">
              {history.map((h, i) => (
                <li key={h.id}>
                  <button onClick={() => setSelected(i)} className={`w-full rounded-lg px-3 py-2 text-left text-sm cursor-pointer ${i === selected ? 'bg-brand-50 dark:bg-brand-600/20' : 'hover:bg-slate-50 dark:hover:bg-slate-800'}`}>
                    <div className="flex items-center justify-between"><span>{fmtDate(h.created_at)}</span><RiskBadge risk={h.risk_flag} /></div>
                    <div className="text-xs text-slate-500">Placement {pct(h.placement_probability)} · Performance {h.performance_score}</div>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}
