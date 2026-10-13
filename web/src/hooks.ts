import { useCallback, useEffect, useRef, useState } from 'react'

/** Basit veri yükleme kancası. deps değişince yeniden çeker; reload() ile elle tetiklenir. */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[], opts?: { interval?: number }) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<unknown>(null)
  const [loading, setLoading] = useState(true)
  const fnRef = useRef(fn); fnRef.current = fn
  const tick = useRef(0)

  const load = useCallback(async (silent = false) => {
    const my = ++tick.current
    if (!silent) setLoading(true)
    try {
      const r = await fnRef.current()
      if (my === tick.current) { setData(r); setError(null) }
    } catch (e) {
      if (my === tick.current) setError(e)
    } finally {
      if (my === tick.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
    if (opts?.interval) {
      const id = setInterval(() => load(true), opts.interval)
      return () => clearInterval(id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  return { data, error, loading, reload: () => load(true), setData }
}
