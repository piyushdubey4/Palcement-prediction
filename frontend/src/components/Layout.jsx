import { useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

function useTheme() {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'))
  const toggle = () => {
    const next = !dark
    document.documentElement.classList.toggle('dark', next)
    try { localStorage.setItem('theme', next ? 'dark' : 'light') } catch { /* private mode */ }
    setDark(next)
  }
  return [dark, toggle]
}

const link = ({ isActive }) =>
  `rounded-lg px-3 py-2 text-sm font-medium ${isActive ? 'bg-brand-50 text-brand-700 dark:bg-brand-600/20 dark:text-brand-100' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'}`

export default function Layout() {
  const { user, logout } = useAuth()
  const [dark, toggle] = useTheme()
  const nav = useNavigate()
  const [open, setOpen] = useState(false)
  const items = user.role === 'faculty'
    ? [['/faculty', 'Faculty overview']]
    : [['/dashboard', 'My dashboard']]
  items.push(['/insights', 'Model insights'], ['/campus', 'Real-data check'])

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur dark:border-slate-800 dark:bg-slate-900/90">
        <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-3">
          <button className="text-lg font-bold text-brand-600" onClick={() => nav('/')}>🎓 PlaceWise</button>
          <nav className="hidden gap-1 md:flex">
            {items.map(([to, label]) => <NavLink key={to} to={to} end={to === '/faculty'} className={link}>{label}</NavLink>)}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <button className="btn-ghost px-3" onClick={toggle} title="Toggle dark mode" aria-label="Toggle dark mode">{dark ? '☀️' : '🌙'}</button>
            <div className="hidden text-right sm:block">
              <div className="text-sm font-medium">{user.name}</div>
              <div className="text-xs capitalize text-slate-500">{user.role}</div>
            </div>
            <button className="btn-ghost" onClick={() => { logout(); nav('/login') }}>Log out</button>
            <button className="btn-ghost md:hidden" onClick={() => setOpen(!open)} aria-label="Menu">☰</button>
          </div>
        </div>
        {open && (
          <nav className="flex flex-col gap-1 border-t border-slate-200 px-4 py-2 md:hidden dark:border-slate-800">
            {items.map(([to, label]) => <NavLink key={to} to={to} className={link} onClick={() => setOpen(false)}>{label}</NavLink>)}
          </nav>
        )}
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6"><Outlet /></main>
      <footer className="mx-auto max-w-7xl px-4 pb-8 text-xs text-slate-400">
        Models trained on the Kaggle “College Student Placement Factors” dataset (sahilislam007) and the Jain University
        “Campus Recruitment” dataset (Ben Roshan D). Predictions are guidance, not guarantees.
      </footer>
    </div>
  )
}
