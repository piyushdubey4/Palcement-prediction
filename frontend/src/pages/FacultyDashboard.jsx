import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import api, { errorMessage } from '../api'
import { Empty, fmtDate, pct, RiskBadge, Stat } from '../components/ui'

const RISK_COLORS = { High: '#ef4444', Medium: '#f59e0b', Low: '#10b981' }

export default function FacultyDashboard() {
  const [stats, setStats] = useState(null)
  const [rows, setRows] = useState([])
  const [risk, setRisk] = useState('')
  const [q, setQ] = useState('')

  useEffect(() => { api.get('/students/stats').then((r) => setStats(r.data)).catch((e) => toast.error(errorMessage(e))) }, [])
  useEffect(() => {
    const t = setTimeout(() => {
      api.get('/students/all', { params: { risk: risk || undefined, q: q || undefined } })
        .then((r) => setRows(r.data)).catch((e) => toast.error(errorMessage(e)))
    }, 200)
    return () => clearTimeout(t)
  }, [risk, q])

  const exportCsv = async () => {
    try {
      const { data, headers } = await api.get('/students/export.csv', { responseType: 'blob' })
      const name = /filename="(.+)"/.exec(headers['content-disposition'] || '')?.[1] || 'placement_report.csv'
      const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(data), download: name })
      a.click()
      URL.revokeObjectURL(a.href)
    } catch (e) { toast.error(errorMessage(e)) }
  }

  const riskData = stats ? Object.entries(stats.risk).map(([name, value]) => ({ name, value })).filter((d) => d.value) : []
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Faculty overview</h1>
          <p className="muted">Latest assessment of every registered student.</p>
        </div>
        <button className="btn-ghost" onClick={exportCsv}>⬇ Export CSV</button>
      </div>

      {stats && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <Stat label="Students" value={stats.total_students} hint={`${stats.assessed_students} assessed`} />
          <Stat label="Likely placed" value={stats.likely_placed} hint="probability ≥ 55%" className="text-emerald-600" />
          <Stat label="High risk" value={stats.risk.High} hint="need mentoring" className="text-red-600" />
          <Stat label="Avg placement %" value={pct(stats.avg_probability)} />
          <Stat label="Avg performance" value={stats.avg_performance} hint={`${stats.total_predictions} predictions in total`} />
        </div>
      )}

      {stats && stats.assessed_students > 0 && (
        <div className="grid gap-5 lg:grid-cols-[1fr_2fr]">
          <div className="card">
            <h2 className="h2">Risk distribution</h2>
            <div className="h-60">
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={riskData} dataKey="value" nameKey="name" innerRadius={50} outerRadius={85} label={({ name, value }) => `${name}: ${value}`}>
                    {riskData.map((d) => <Cell key={d.name} fill={RISK_COLORS[d.name]} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="card">
            <h2 className="h2">Most common skill gaps</h2>
            <div style={{ height: Math.max(240, stats.common_gaps.length * 34) }}>
              <ResponsiveContainer>
                <BarChart data={stats.common_gaps} layout="vertical" margin={{ left: 30 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,.3)" horizontal={false} />
                  <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12, fill: 'currentColor' }} />
                  <YAxis type="category" dataKey="gap" width={170} interval={0} tick={{ fontSize: 12, fill: 'currentColor' }} />
                  <Tooltip />
                  <Bar dataKey="count" fill="#3b6ef5" radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      <div className="card p-0">
        <div className="flex flex-wrap gap-3 border-b border-slate-200 p-4 dark:border-slate-800">
          <input className="input max-w-xs" placeholder="Search name, email or roll no." value={q} onChange={(e) => setQ(e.target.value)} />
          <select className="input max-w-[180px]" value={risk} onChange={(e) => setRisk(e.target.value)}>
            <option value="">All students</option>
            <option value="High">High risk</option>
            <option value="Medium">Medium risk</option>
            <option value="Low">Low risk</option>
            <option value="None">Not assessed</option>
          </select>
        </div>
        {rows.length === 0 ? <Empty>No students match.</Empty> : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase text-slate-500">
                <tr><th className="p-3">Student</th><th className="p-3">Branch</th><th className="p-3">Performance</th><th className="p-3">Placement</th><th className="p-3">Risk</th><th className="p-3">Top gaps</th><th className="p-3">Last assessed</th></tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t border-slate-100 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/40">
                    <td className="p-3"><Link className="font-medium text-brand-600 hover:underline" to={`/faculty/students/${r.id}`}>{r.name}</Link><div className="text-xs text-slate-500">{r.roll_no || r.email}</div></td>
                    <td className="p-3">{r.branch || '-'}{r.year ? ` · Y${r.year}` : ''}</td>
                    <td className="p-3">{r.latest ? `${r.latest.performance_score} · ${r.latest.performance_level}` : '-'}</td>
                    <td className="p-3">{r.latest ? pct(r.latest.placement_probability) : '-'}</td>
                    <td className="p-3"><RiskBadge risk={r.latest?.risk_flag} /></td>
                    <td className="p-3 text-xs">{r.latest?.skill_gaps.slice(0, 3).join(', ') || '-'}</td>
                    <td className="p-3 text-xs whitespace-nowrap">{r.latest ? fmtDate(r.latest.created_at) : '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
