import { createClient } from '@supabase/supabase-js'

const STORAGE_KEY_ID = 'tarnished_uuid'
const STORAGE_KEY_SECRET = 'tarnished_secret'

const getOrInitCredentials = () => {
  let id = localStorage.getItem(STORAGE_KEY_ID)
  let secret = localStorage.getItem(STORAGE_KEY_SECRET)

  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

  if (!id || !uuidRegex.test(id) || !secret) {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      id = crypto.randomUUID()
    } else {
      id = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0
        const v = c === 'x' ? r : (r & 0x3) | 0x8
        return v.toString(16)
      })
    }

    const array = new Uint8Array(16)
    if (typeof crypto !== 'undefined') crypto.getRandomValues(array)
    secret = Array.from(array, (byte) => byte.toString(16).padStart(2, '0')).join('') + Date.now().toString(36)

    localStorage.setItem(STORAGE_KEY_ID, id)
    localStorage.setItem(STORAGE_KEY_SECRET, secret)
  }

  return { id, secret }
}

const { id: currentUuid, secret: currentSecret } = getOrInitCredentials()
export const myUuid = currentUuid

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY
export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY)

const buildDisabledResult = (extra = {}) => ({
  data: null,
  error: new Error('Supabase is not configured. Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY.'),
  count: 0,
  ...extra
})

const createDisabledQueryBuilder = () => {
  let result = buildDisabledResult()
  const builder = {
    select: (_columns, options) => {
      if (options && options.head && options.count === 'exact') {
        result = buildDisabledResult({ count: 0 })
      }
      return builder
    },
    eq: () => builder,
    maybeSingle: async () => buildDisabledResult(),
    insert: () => ({
      select: async () => buildDisabledResult()
    }),
    then: (onFulfilled, onRejected) => Promise.resolve(result).then(onFulfilled, onRejected),
    catch: (onRejected) => Promise.resolve(result).catch(onRejected),
    finally: (onFinally) => Promise.resolve(result).finally(onFinally)
  }
  return builder
}

const createDisabledSupabaseClient = () => ({
  from: () => createDisabledQueryBuilder(),
  rpc: async () => buildDisabledResult()
})

if (!isSupabaseConfigured) {
  console.error('[Supabase] Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. Running in degraded mode.')
}

export const supabase = isSupabaseConfigured
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: {
        headers: {
          'x-client-id': currentUuid,
          'x-client-secret': currentSecret
        }
      },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false
      }
    })
  : createDisabledSupabaseClient()

export const registerDevice = async () => {
  if (!isSupabaseConfigured) return
  try {
    const { error } = await supabase.rpc('register_device', {
      p_id: currentUuid,
      p_secret: currentSecret
    })
    if (error) console.error('Device registration failed:', error)
  } catch (e) {
    console.error('Network error during registration:', e)
  }
}
