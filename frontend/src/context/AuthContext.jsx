import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import api from '../api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(!!localStorage.getItem('token'))

  const refresh = useCallback(async () => {
    try {
      const { data } = await api.get('/auth/me')
      setUser(data)
      return data
    } catch {
      localStorage.removeItem('token')
      setUser(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (localStorage.getItem('token')) refresh()
  }, [refresh])

  const finish = (data) => {
    localStorage.setItem('token', data.access_token)
    setUser(data.user)
    return data.user
  }
  const login = async (email, password) => finish((await api.post('/auth/login', { email, password })).data)
  const register = async (body) => finish((await api.post('/auth/register', body)).data)
  const logout = () => {
    localStorage.removeItem('token')
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, refresh, setUser }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
