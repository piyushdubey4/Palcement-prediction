import { useEffect, useState } from 'react'
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import api from '../api'
import { pct } from '../components/ui'

const COLORS = ['#3b6ef5', '#f59e0b', '#10b981', '#a855f7']
const f3 = (v) => (v == null ? '-' : v.toFixed(3))

function MetricsTable({ results, selected, cv = true }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="text-xs uppercase text-slate-500">
          <tr><th className="p-2">Model</th><th className="p-2">Accuracy</th><th className="p-2">Precision</th><th className="p-2">Recall</th><th className="p-2">F1</th><th className="p-2">ROC-AUC</th>{cv && <th className="p-2">5-fold CV F1</th>}</tr>
        </thead>
        <tbody>
          {results.map((r) => (
            <tr key={r.model} className={`border-t border-slate-100 dark:border-slate-800 ${r.model === selected ? 'bg-brand-50 font-semibold dark:bg-brand-600/15' : ''}`}>
              <td className="p-2">{r.model}{r.model === selected && ' ★'}</td>
              <td className="p-2">{pct(r.accuracy, 2)}</td><td className="p-2">{f3(r.precision)}</td><td className="p-2">{f3(r.recall)}</td>
              <td className="p-2">{f3(r.f1)}</td><td className="p-2">{f3(r.roc_auc)}</td>
              {cv && <td className="p-2">{r.cv_f1_mean == null ? '-' : `${f3(r.cv_f1_mean)} ± ${f3(r.cv_f1_std)}`}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Roc({ results }) {
  const models = results.filter((r) => r.roc)
  return (
    <div className="h-72">
      <ResponsiveContainer>
        <LineChart margin={{ left: -10, right: 10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,.3)" />
          <XAxis type="number" dataKey="fpr" domain={[0, 1]} tick={{ fontSize: 11, fill: 'currentColor' }} label={{ value: 'False positive rate', position: 'insideBottom', offset: -2, fontSize: 11 }} />
          <YAxis type="number" domain={[0, 1]} tick={{ fontSize: 11, fill: 'currentColor' }} />
          <Tooltip formatter={(v) => v.toFixed(3)} />
          <Legend />
          {models.map((m, i) => <Line key={m.model} data={m.roc} dataKey="tpr" name={`${m.model} (AUC ${m.roc_auc.toFixed(3)})`} stroke={COLORS[i]} dot={false} strokeWidth={2} />)}
          <Line data={[{ fpr: 0, tpr: 0 }, { fpr: 1, tpr: 1 }]} dataKey="tpr" name="Chance" stroke="#94a3b8" strokeDasharray="4 4" dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

function Confusion({ m }) {
  const [[tn, fp], [fn, tp]] = m.confusion_matrix
  const cell = (v, good) => <div className={`rounded-lg p-3 text-center ${good ? 'bg-emerald-100 dark:bg-emerald-500/15' : 'bg-red-50 dark:bg-red-500/10'}`}><div className="text-xl font-bold">{v}</div></div>
  return (
    <div className="grid grid-cols-[auto_1fr_1fr] gap-2 text-xs">
      <div></div><div className="text-center text-slate-500">Pred. not placed</div><div className="text-center text-slate-500">Pred. placed</div>
      <div className="self-center text-slate-500">Actual not placed</div>{cell(tn, true)}{cell(fp, false)}
      <div className="self-center text-slate-500">Actual placed</div>{cell(fn, false)}{cell(tp, true)}
    </div>
  )
}

export default function Insights() {
  const [m, setM] = useState(null)
  useEffect(() => { api.get('/model/metrics').then((r) => setM(r.data)) }, [])
  if (!m) return <div className="muted">Loading…</div>
  const { primary, campus } = m
  const best = primary.results.find((r) => r.model === primary.selected_model)
  const eda = primary.eda
  const means = Object.entries(eda.means_by_class).map(([feature, v]) => ({ feature, Placed: v.placed, 'Not placed': v.not_placed }))
  const corr = Object.entries(eda.correlation_with_target).map(([feature, r]) => ({ feature, r })).sort((a, b) => b.r - a.r)

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Model insights</h1>
        <p className="muted">Everything here is computed by <code>backend/app/ml/train.py</code> (trained {new Date(m.trained_at).toLocaleString()}, seed {m.random_seed}).</p>
      </div>

      <div className="card">
        <h2 className="h2">Dataset: {primary.dataset.name}</h2>
        <p className="muted">By {primary.dataset.author} · <a className="text-brand-600 hover:underline" href={primary.dataset.url} target="_blank" rel="noreferrer">Kaggle</a> · {eda.rows.toLocaleString()} rows · {eda.placed.toLocaleString()} placed / {eda.not_placed.toLocaleString()} not placed · stratified 80:20 split ({eda.train_rows} / {eda.test_rows})</p>
        <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-500/30 dark:bg-amber-500/10">
          <b>Key finding:</b> the label follows a fixed rule. A student is placed when at least 3 of 4 hold: IQ &gt; 110, CGPA &gt; 8.0, Projects ≥ 2, Communication ≥ 8.
          This matches {pct(eda.label_rule_match, 2)} of rows, so the dataset is synthetic and tree models reach ≈100%.
          The real-data benchmark below shows how the same algorithms do on genuine placement records.
        </div>
      </div>

      <div className="card">
        <h2 className="h2">Model comparison (test set of {eda.test_rows} records)</h2>
        <p className="mb-3 muted">Selected: <b>{primary.selected_model}</b> · rule: {primary.selection_rule}.</p>
        <MetricsTable results={primary.results} selected={primary.selected_model} />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="card"><h2 className="h2">ROC curves</h2><Roc results={primary.results} /></div>
        <div className="card">
          <h2 className="h2">Confusion matrix · {best.model}</h2>
          <div className="mt-4"><Confusion m={best} /></div>
          <h3 className="mt-6 text-sm font-semibold">Feature importance</h3>
          <div className="h-56">
            <ResponsiveContainer>
              <BarChart data={best.feature_importance} layout="vertical" margin={{ left: 40 }}>
                <XAxis type="number" tick={{ fontSize: 11, fill: 'currentColor' }} />
                <YAxis type="category" dataKey="feature" width={140} tick={{ fontSize: 11, fill: 'currentColor' }} />
                <Tooltip formatter={(v) => v.toFixed(4)} />
                <Bar dataKey="importance" fill="#3b6ef5" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="card">
          <h2 className="h2">Correlation with placement</h2>
          <div className="h-64">
            <ResponsiveContainer>
              <BarChart data={corr} layout="vertical" margin={{ left: 40 }}>
                <XAxis type="number" domain={[-0.1, 0.5]} tick={{ fontSize: 11, fill: 'currentColor' }} />
                <YAxis type="category" dataKey="feature" width={140} tick={{ fontSize: 10, fill: 'currentColor' }} />
                <Tooltip formatter={(v) => v.toFixed(4)} />
                <Bar dataKey="r" fill="#10b981" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="card">
          <h2 className="h2">Placement rate by CGPA</h2>
          <div className="h-64">
            <ResponsiveContainer>
              <BarChart data={eda.placement_rate_by_cgpa} margin={{ left: -16 }}>
                <XAxis dataKey="bucket" tick={{ fontSize: 10, fill: 'currentColor' }} />
                <YAxis tickFormatter={(v) => `${v * 100}%`} tick={{ fontSize: 11, fill: 'currentColor' }} />
                <Tooltip formatter={(v) => pct(v)} />
                <Bar dataKey="rate" fill="#3b6ef5" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="card">
          <h2 className="h2">Placement rate by projects</h2>
          <div className="h-64">
            <ResponsiveContainer>
              <BarChart data={eda.placement_rate_by_projects} margin={{ left: -16 }}>
                <XAxis dataKey="bucket" tick={{ fontSize: 11, fill: 'currentColor' }} />
                <YAxis tickFormatter={(v) => `${v * 100}%`} tick={{ fontSize: 11, fill: 'currentColor' }} />
                <Tooltip formatter={(v) => pct(v)} />
                <Bar dataKey="rate" fill="#a855f7" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="card">
        <h2 className="h2">Feature means: placed vs not placed</h2>
        <div className="h-72">
          <ResponsiveContainer>
            <BarChart data={means} margin={{ left: -10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,.3)" vertical={false} />
              <XAxis dataKey="feature" tick={{ fontSize: 10, fill: 'currentColor' }} interval={0} angle={-15} textAnchor="end" height={50} />
              <YAxis scale="sqrt" tick={{ fontSize: 11, fill: 'currentColor' }} />
              <Tooltip /><Legend />
              <Bar dataKey="Placed" fill="#10b981" /><Bar dataKey="Not placed" fill="#94a3b8" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="card">
        <h2 className="h2">Real-data benchmark: {campus.dataset.name}</h2>
        <p className="muted">{campus.dataset.author} · <a className="text-brand-600 hover:underline" href={campus.dataset.url} target="_blank" rel="noreferrer">Kaggle</a> · {campus.dataset.rows} real students ({campus.dataset.placed} placed / {campus.dataset.not_placed} not). {campus.dataset.note}</p>
        <p className="mb-3 mt-1 muted">Selected: <b>{campus.selected_model}</b> · rule: {campus.selection_rule}. Real data is noisier, so scores are lower and more honest.</p>
        <MetricsTable results={campus.results} selected={campus.selected_model} />
        <div className="mt-4 grid gap-5 lg:grid-cols-2">
          <Roc results={campus.results} />
          <div className="rounded-lg bg-slate-50 p-4 text-sm dark:bg-slate-800/60">
            <div className="font-semibold">Salary regression ({campus.salary.model}, {campus.salary.rows} placed students)</div>
            <p className="mt-1">5-fold CV MAE ₹{Math.round(campus.salary.cv_mae).toLocaleString('en-IN')} · R² {campus.salary.cv_r2.toFixed(3)} · median-baseline MAE ₹{Math.round(campus.salary.median_baseline_mae).toLocaleString('en-IN')}</p>
            <p className="mt-2 text-slate-600 dark:text-slate-400">{campus.salary.finding}</p>
          </div>
        </div>
      </div>
    </div>
  )
}
