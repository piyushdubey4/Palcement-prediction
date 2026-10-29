import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import Layout from './components/Layout'
import Login from './pages/Login'
import Register from './pages/Register'
import StudentDashboard from './pages/StudentDashboard'
import FacultyDashboard from './pages/FacultyDashboard'
import FacultyStudent from './pages/FacultyStudent'
import Insights from './pages/Insights'
import Campus from './pages/Campus'

function Protected({ role, children }) {
  const { user, loading } = useAuth()
  if (loading) return <div className="p-10 text-center muted">Loading…</div>
  if (!user) return <Navigate to="/login" replace />
  if (role && user.role !== role) return <Navigate to="/" replace />
  return children
}

function Home() {
  const { user } = useAuth()
  return <Navigate to={user?.role === 'faculty' ? '/faculty' : '/dashboard'} replace />
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route element={<Protected><Layout /></Protected>}>
        <Route index element={<Home />} />
        <Route path="/dashboard/*" element={<Protected role="student"><StudentDashboard /></Protected>} />
        <Route path="/faculty" element={<Protected role="faculty"><FacultyDashboard /></Protected>} />
        <Route path="/faculty/students/:id" element={<Protected role="faculty"><FacultyStudent /></Protected>} />
        <Route path="/insights" element={<Insights />} />
        <Route path="/campus" element={<Campus />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
