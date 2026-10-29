import { useState } from 'react'
import toast from 'react-hot-toast'
import api, { errorMessage } from '../api'
import { pct } from '../components/ui'

const FIELDS = [
  ['ssc_p', 'Class 10 %'], ['hsc_p', 'Class 12 %'], ['degree_p', 'Degree %'],
  ['etest_p', 'Employability test %'], ['mba_p', 'MBA / PG %'],
]
const inr = (v) => `₹${Math.round(v).toLocaleString('en-IN')}`

export default function Campus() {
  const [form, setForm] = useState({ ssc_p: 70, hsc_p: 70, degree_p: 68, etest_p: 72, mba_p: 63, workex: false, specialisation: 'Mkt&Fin' })
  const [res, setRes] = useState(null)
  const [busy, setBusy] = useState(false)
  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    try {
      const body = { ...form }
      for (const [k] of FIELDS) body[k] = Number(body[k])
      setRes((await api.post('/predict/campus', body)).data)
    } catch (err) { toast.error(errorMessage(err)) } finally { setBusy(false) }
  }
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Real-data placement check</h1>
        <p className="muted">A second model trained on 215 real campus-recruitment records from Jain University, Bangalore (Kaggle, Ben Roshan D). It suits PG/MBA profiles and is included to show how the approach behaves on genuine data.</p>
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <form className="card space-y-4" onSubmit={submit}>
          <div className="grid grid-cols-2 gap-3">
            {FIELDS.map(([k, label]) => (
              <div key={k}><label className="label" htmlFor={k}>{label}</label>
                <input id={k} className="input" type="number" min={0} max={100} step={0.01} required value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} /></div>
            ))}
            <div><label className="label">Specialisation</label>
              <select className="input" value={form.specialisation} onChange={(e) => setForm({ ...form, specialisation: e.target.value })}>
                <option value="Mkt&Fin">Marketing &amp; Finance</option><option value="Mkt&HR">Marketing &amp; HR</option>
              </select></div>
          </div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="accent-brand-600" checked={form.workex} onChange={(e) => setForm({ ...form, workex: e.target.checked })} /> Has work experience</label>
          <button className="btn-primary" disabled={busy}>{busy ? 'Predicting…' : 'Predict'}</button>
        </form>
        <div className="card">
          {!res ? <p className="muted">Enter scores and press Predict.</p> : (
            <div className="space-y-4">
              <div>
                <div className="text-xs uppercase tracking-wide text-slate-500">Placement probability ({res.model_name})</div>
                <div className={`text-4xl font-bold ${res.placement_probability >= 0.55 ? 'text-emerald-600' : 'text-red-600'}`}>{pct(res.placement_probability)}</div>
                <div className="text-sm">{res.placement_status}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-slate-500">Salary of the {res.similar_students} most similar placed students</div>
                <div className="mt-1 text-lg font-semibold">{inr(res.salary_range.p25)} – {inr(res.salary_range.p75)} <span className="text-sm font-normal text-slate-500">(median {inr(res.salary_range.median)} per year)</span></div>
                <p className="mt-1 text-xs text-slate-500">A descriptive range from real records, not a prediction: salary regression had negative R² on this data (see Model insights).</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
