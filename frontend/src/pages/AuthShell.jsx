export default function AuthShell({ title, subtitle, children }) {
  return (
    <div className="grid min-h-screen md:grid-cols-2">
      <div className="hidden flex-col justify-between bg-gradient-to-br from-brand-600 to-indigo-800 p-10 text-white md:flex">
        <div className="text-xl font-bold">🎓 PlaceWise</div>
        <div>
          <h1 className="text-3xl font-bold leading-tight">AI-based Student Performance &amp; Placement Prediction</h1>
          <p className="mt-4 max-w-md text-brand-100">
            Know your placement readiness early: a trained ML model, a transparent performance score,
            automatic skill-gap detection and a concrete improvement plan.
          </p>
        </div>
        <div className="text-sm text-brand-100">Department of CSE · GL Bajaj Group of Institutions, Mathura</div>
      </div>
      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white">{title}</h2>
          <p className="mt-1 muted">{subtitle}</p>
          <div className="mt-6">{children}</div>
        </div>
      </div>
    </div>
  )
}
