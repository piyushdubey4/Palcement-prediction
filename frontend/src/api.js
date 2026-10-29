import axios from 'axios'

const api = axios.create({ baseURL: import.meta.env.VITE_API_URL || '/api' })

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err.response?.status === 401 && localStorage.getItem('token')) {
      localStorage.removeItem('token')
      window.location.assign('/login')
    }
    return Promise.reject(err)
  },
)

export function errorMessage(err) {
  const d = err?.response?.data?.detail
  if (Array.isArray(d)) return d.map((e) => `${e.loc?.slice(-1)[0]}: ${e.msg}`).join(', ')
  return d || err?.message || 'Something went wrong'
}

export default api
