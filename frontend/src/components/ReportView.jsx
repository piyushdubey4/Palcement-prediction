import {
  Bar, BarChart, CartesianGrid, Cell, PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart,
  RadialBar, RadialBarChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { levelColor, pct, RiskBadge } from './ui'

const SEV = {
  high: 'border-red-300 bg-red-50 dark:border-red-500/30 dark:bg-red-500/10',
  medium: 'border-amber-300 bg-amber-50 dark:border-amber-500/30 dark:bg-amber-500/10',
  low: 'border-slate-300 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/50',
}

function Meter({ value, label, color }) {
  return (
    <div className="relative h-36">
      <ResponsiveContainer>
        <RadialBarChart innerRadius="72%" outerRadius="100%" data={[{ value }]} startAngle={210} endAngle={-30}>
          <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
          <RadialBar dataKey="value" cornerRadius={8} fill={color} background={{ fill: 'rgba(148,163,184,.2)' }} />
        </RadialBarChart>
      </ResponsiveContainer>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div className="text-2xl font-bold">{value.toFixed(1)}</div>
        <div className="text-xs text-slate-500">{label}</div>
      </div>
    </div>
  )
}

export default function ReportView({ report, inputs, actions }) {
  const prob = report.placement_probability
  const likely = prob >= 0.55
  const radar = [
    ['Aptitude', inputs.aptitude], ['Coding', inputs.coding], ['DSA', inputs.dsa],
    ['Communication', inputs.communication], ['CGPA ×10', inputs.cgpa * 10], ['Attendance', inputs.attendance],
  ].map(([skill, v]) => ({ skill, value: Number(v), target: 75 }))
  const semAvg = (inputs.sem1 + inputs.sem2 + inputs.sem3 + inputs.sem4) / 4
  const parts = [
    { name: 'CGPA (40%)', value: +(0.4 * inputs.cgpa * 10).toFixed(2) },
    { name: 'Attendance (30%)', value: +(0.3 * inputs.attendance).toFixed(2) },
    { name: 'Semester avg (30%)', value: +(0.3 * semAvg * 10).toFixed(2) },
  ]
  const impacts = (report.contributions || []).filter((c) => Math.abs(c.impact) >= 0.001)
  const met = report.hiring_criteria.filter((c) => c.met).length

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="card">
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Placement probability</div>
          <div className={`mt-1 text-3xl font-bold ${likely ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>{pct(prob)}</div>
          <div className="mt-1 text-sm font-medium">{report.placement_status}</div>
          <div className="mt-1 text-xs text-slate-500">{report.model_name ? `${report.model_name} model` : report.prediction_source} · threshold 55%</div>
        </div>
        <div className="card">
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Performance level</div>
          <div className={`mt-1 text-3xl font-bold ${levelColor(report.performance_level)}`}>{report.performance_level}</div>
          <div className="mt-1 text-sm">Score {report.performance_score} / 100</div>
        </div>
        <div className="card p-3">
          <div className="px-2 text-xs font-medium uppercase tracking-wide text-slate-500">Readiness index</div>
          <Meter value={report.readiness_index} label="out of 100" color={report.readiness_index >= 70 ? '#10b981' : report.readiness_index >= 50 ? '#f59e0b' : '#ef4444'} />
        </div>
        <div className="card">
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Risk flag</div>
          <div className="mt-2"><RiskBadge risk={report.risk_flag} /></div>
          <div className="mt-2 text-sm">{report.skill_gaps.length} skill gap{report.skill_gaps.length === 1 ? '' : 's'} detected</div>
          <div className="mt-1 text-xs text-slate-500">{met} of 4 hiring criteria met</div>
        </div>
      </div>

      {actions}

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="card">
          <h3 className="h2">Skill profile</h3>
          <p className="muted">Your scores against a 75-point target.</p>
          <div className="h-72">
            <ResponsiveContainer>
              <RadarChart data={radar} outerRadius="75%">
                <PolarGrid stroke="rgba(148,163,184,.4)" />
                <PolarAngleAxis dataKey="skill" tick={{ fontSize: 12, fill: 'currentColor' }} />
                <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
                <Radar name="Target" dataKey="target" stroke="#94a3b8" fill="#94a3b8" fillOpacity={0.1} strokeDasharray="4 4" />
                <Radar name="You" dataKey="value" stroke="#2753e0" fill="#3b6ef5" fillOpacity={0.35} />
                <Tooltip />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="card">
          <h3 className="h2">Performance score breakdown</h3>
          <p className="muted">0.40 × CGPA×10 + 0.30 × Attendance + 0.30 × Semester avg×10</p>
          <div className="h-72">
            <ResponsiveContainer>
              <BarChart data={parts} margin={{ top: 16, right: 8, left: -16 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,.3)" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 12, fill: 'currentColor' }} />
                <YAxis domain={[0, 40]} tick={{ fontSize: 12, fill: 'currentColor' }} />
                <Tooltip />
                <Bar dataKey="value" radius={[6, 6, 0, 0]} fill="#3b6ef5" label={{ position: 'top', fontSize: 12, fill: 'currentColor' }} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="card">
          <h3 className="h2">Hiring criteria learned from the data</h3>
          <p className="muted">In the training data, students were placed when at least 3 of these 4 held.</p>
          <ul className="mt-3 space-y-2">
            {report.hiring_criteria.map((c) => (
              <li key={c.criterion} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm dark:bg-slate-800/60">
                <span><span className="mr-2">{c.met ? '✅' : '⬜'}</span>{c.criterion}<span className="ml-2 text-xs text-slate-500">({c.form_hint})</span></span>
                <span className="font-mono text-xs">{c.value}</span>
              </li>
            ))}
          </ul>
          {impacts.length > 0 && (
            <div className="mt-4">
              <div className="text-sm font-medium">What moves your probability</div>
              <p className="text-xs text-slate-500">Change in probability if this feature were at the dataset median.</p>
              <div className="h-48">
                <ResponsiveContainer>
                  <BarChart data={impacts} layout="vertical" margin={{ left: 40 }}>
                    <XAxis type="number" tickFormatter={(v) => `${(v * 100).toFixed(0)}%`} tick={{ fontSize: 11, fill: 'currentColor' }} />
                    <YAxis type="category" dataKey="feature" width={130} tick={{ fontSize: 11, fill: 'currentColor' }} />
                    <Tooltip formatter={(v) => pct(v)} />
                    <Bar dataKey="impact">{impacts.map((c) => <Cell key={c.feature} fill={c.impact >= 0 ? '#10b981' : '#ef4444'} />)}</Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </div>
        <div className="card">
          <h3 className="h2">Your improvement plan</h3>
          {likely ? (
            <p className="mt-2 text-sm">You are already above the 55% threshold. Keep your scores up and close the skill gaps below to stay competitive.</p>
          ) : report.improvement_path?.length ? (
            <>
              <p className="muted">Smallest changes that move the model over the threshold (lowest effort first).</p>
              <ol className="mt-3 space-y-3">
                {report.improvement_path.map((p, i) => (
                  <li key={i} className="rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm dark:border-emerald-500/30 dark:bg-emerald-500/10">
                    <div className="font-medium">Option {i + 1} → {pct(p.new_probability)}</div>
                    <ul className="mt-1 list-disc pl-5">
                      {p.changes.map((c) => <li key={c.field}>Raise {c.label} from <b>{c.from}</b> to <b>{c.to}</b></li>)}
                    </ul>
                  </li>
                ))}
              </ol>
            </>
          ) : (
            <p className="mt-2 text-sm">No combination of aptitude, communication, projects and CGPA reached the threshold. Focus on the skill gaps below.</p>
          )}
        </div>
      </div>

      <div className="card">
        <h3 className="h2">Skill gaps &amp; recommendations</h3>
        {report.skill_gaps.length === 0 ? <p className="mt-2 text-sm">No gaps detected. 🎉</p> : (
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            {report.skill_gaps.map((g) => (
              <div key={g.area} className={`rounded-lg border p-3 text-sm ${SEV[g.severity]}`}>
                <div className="flex items-center justify-between">
                  <span className="font-semibold">{g.gap}</span>
                  <span className="text-xs uppercase tracking-wide">{g.severity}</span>
                </div>
                <p className="mt-1">{g.recommendation}</p>
                <a className="mt-1 inline-block text-xs text-brand-600 hover:underline" href={g.resource} target="_blank" rel="noreferrer">{g.resource.replace(/^https?:\/\//, '')}</a>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
