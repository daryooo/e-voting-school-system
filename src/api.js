const API_BASE = '/api'

export async function api(path, options = {}) {
  const headers = new Headers(options.headers || {})
  headers.set('Accept', 'application/json')
  if (options.body !== undefined) headers.set('Content-Type', 'application/json')
  if (options.method && options.method !== 'GET') headers.set('X-EBOTO-Request', '1')

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
    credentials: 'same-origin',
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  })

  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    const error = new Error(data.error || 'The request could not be completed.')
    error.status = response.status
    throw error
  }
  return data
}

export function fileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('The selected photo could not be read.'))
    reader.readAsDataURL(file)
  })
}
