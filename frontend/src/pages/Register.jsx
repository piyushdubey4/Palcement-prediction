import { useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { useAuth } from '../context/AuthContext'
import { errorMessage } from '../api'
import AuthShell from './AuthShell'

export default function Register() {
  const { user, register } = useAuth()
  const nav = useNavigate()
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'student', roll_no: '', branch: 'CSE', year: 3, faculty_code: '' })
  const [busy, setBusy] = useState(false)
  if (user) return <Navigate to="/" replace />
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    try {
      const body = { ...form, year: Number(form.year) || null }
      if (body.role === 'student') delete body.faculty_code
      for (const k of ['roll_no', 'branch']) if (!body[k]) body[k] = null
      const u = await register(body)
      toast.success('Account created')
      nav(u.role === 'faculty' ? '/faculty' : '/dashboard')
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthShell title="Create account" subtitle="Students get predictions; faculty see the class overview.">
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-2 gap-2">
          {['student', 'faculty'].map((r) => (
            <button type="button" key={r} onClick={() => setForm({ ...form, role: r })}
              className={`btn capitalize ${form.role === r ? 'bg-brand-600 text-white' : 'btn-ghost'}`}>{r}</button>
          ))}
        </div>
        <div><label className="label">Full name</label><input required minLength={2} className="input" value={form.name} onChange={set('name')} /></div>
        <div><label className="label">Email</label><input required type="email" className="input" value={form.email} onChange={set('email')} /></div>
        <div><label className="label">Password (min 6 characters)</label><input required minLength={6} maxLength={72} type="password" className="input" value={form.password} onChange={set('password')} /></div>
        {form.role === 'student' ? (
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-3 sm:col-span-1"><label className="label">Roll no.</label><input className="input" value={form.roll_no} onChange={set('roll_no')} /></div>
            <div><label className="label">Branch</label>
              <select className="input" value={form.branch} onChange={set('branch')}>
                {['CSE', 'IT', 'CSE (AI&ML)', 'CSE (DS)', 'ECE', 'EE', 'ME', 'CE'].map((b) => <option key={b}>{b}</option>)}
              </select>
            </div>
            <div><label className="label">Year</label>
              <select className="input" value={form.year} onChange={set('year')}>{[1, 2, 3, 4].map((y) => <option key={y}>{y}</option>)}</select>
            </div>
          </div>
        ) : (
          <div><label className="label">Faculty registration code</label><input required className="input" value={form.faculty_code} onChange={set('faculty_code')} />
            <p className="mt-1 text-xs text-slate-500">Set by the administrator in backend/.env (FACULTY_SIGNUP_CODE).</p></div>
        )}
        <button className="btn-primary w-full" disabled={busy}>{busy ? 'Creating…' : 'Create account'}</button>
      </form>
      <p className="mt-4 muted">Already registered? <Link className="text-brand-600 hover:underline" to="/login">Sign in</Link></p>
    </AuthShell>
  )
}
