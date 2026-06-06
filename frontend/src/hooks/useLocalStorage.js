import { useState } from 'react'

export function useLocalStorage(key, initialValue) {
  const [stored, setStored] = useState(() => {
    try {
      const item = localStorage.getItem(key)
      return item ? JSON.parse(item) : initialValue
    } catch {
      return initialValue
    }
  })

  function setValue(value) {
    const next = typeof value === 'function' ? value(stored) : value
    setStored(next)
    try {
      localStorage.setItem(key, JSON.stringify(next))
    } catch {}
  }

  return [stored, setValue]
}
