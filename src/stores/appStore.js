import { defineStore } from 'pinia'
import { ref, reactive, computed, watch, toRaw, nextTick } from 'vue'
import { supabase, myUuid } from '../utils/supabase'
import { parseSceneRequest } from '../utils/sceneParser'
import { templates, words, conjunctions } from '../assets/wordBank' // Import wordBank for validation

export const useAppStore = defineStore('app', () => {
  // === State ===
  const config = reactive({ 
    opacity: 90, 
    cardOpacity: 90, 
    maxMessages: 10, 
    autoLaunch: false, 
    skinId: 1 
  })
  
  const pageMode = ref('')
  const globalCount = ref(0)
  
  // User Data
  const myHistoryList = ref([])
  const postLimit = ref(20)
  const postCount = ref(0)
  const myTotalUpvotes = ref(0)
  
  // Messages (Runes)
  const runesList = ref([])
  const hasMessages = ref(false)
  
  // Window Tracking
  const currentWindow = ref(null)
  const lastValidWindow = ref(null)

  // === Computed ===
  const effectiveLimit = computed(() => Math.max(1, postLimit.value || 10))
  const protectedCount = computed(() => myHistoryList.value.filter(item => item.protected).length)

  // === Actions: Config ===
  let isConfigInitialized = false

  const initConfigPersistence = async () => {
    if (isConfigInitialized) return
    isConfigInitialized = true

    if (!window.electron?.loadConfig) {
        // Browser fallback
        const localConf = localStorage.getItem('tarnished_config')
        if(localConf) { try { Object.assign(config, JSON.parse(localConf)) } catch (e) { console.error(e) } }
        watch(config, (v) => localStorage.setItem('tarnished_config', JSON.stringify(v)), { deep: true })
        window.addEventListener('storage', (e) => {
            if (e.key === 'tarnished_config') {
                try { Object.assign(config, JSON.parse(e.newValue)) } catch (error) { console.error(error) }
            }
        })
        return
    }

    // Electron Mode
    let isSyncing = false
    
    const saved = await window.electron.loadConfig()
    if (saved && Object.keys(saved).length > 0) {
        isSyncing = true
        Object.assign(config, saved)
        await nextTick()
        isSyncing = false
    }
    
    watch(config, (v) => {
        if (isSyncing) return
        window.electron.saveConfig(toRaw(v))
        // Sync autoLaunch specifically if needed
        if (window.electron?.setAutoLaunch) {
            window.electron.setAutoLaunch(v.autoLaunch)
        }
    }, { deep: true })
    
    window.electron.onConfigUpdate((c) => {
        isSyncing = true
        Object.assign(config, c)
        nextTick(() => isSyncing = false)
    })
  }

  const initAutoLaunch = async () => {
    if (window.electron?.getAutoLaunch) {
        config.autoLaunch = await window.electron.getAutoLaunch()
    }
  }

  // === Actions: History ===
  const normalizeHistoryItem = (item) => ({ ...item, protected: !!item.protected })

  const loadHistoryFromLocal = () => {
    const localHist = localStorage.getItem('my_runes_history')
    if (localHist) {
      try {
        myHistoryList.value = JSON.parse(localHist).map(normalizeHistoryItem)
      } catch {
        myHistoryList.value = []
      }
    }
    postCount.value = myHistoryList.value.length
  }

  const persistHistory = () => {
    localStorage.setItem('my_runes_history', JSON.stringify(myHistoryList.value))
    postCount.value = myHistoryList.value.length
  }

  const syncHistoryWithServer = async () => {
    try {
        const { data, error } = await supabase.from('messages').select('*').eq('user_id', myUuid)
        if (error || !data) return
        
        const localMap = new Map(myHistoryList.value.map(i => [i.id, i]))
        const newHistory = data.map(serverItem => {
            const localItem = localMap.get(serverItem.id)
            return {
                ...serverItem,
                protected: localItem ? !!localItem.protected : false,
                title_hint: localItem ? localItem.title_hint : serverItem.app_name
            }
        })
        
        newHistory.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        
        myHistoryList.value = newHistory
        persistHistory()
    } catch(e) { console.error(e) }
  }
  
  const isProtectDisabled = (item) => {
    if (item.protected) return false
    return protectedCount.value >= Math.max(effectiveLimit.value - 1, 0)
  }

  const toggleProtect = (item) => {
    if (isProtectDisabled(item)) return
    item.protected = !item.protected
    persistHistory()
  }
  
  const getHistoryTime = (item) => {
    const time = new Date(item.created_at).getTime()
    return Number.isFinite(time) ? time : 0
  }

  const findEvictionTarget = () => {
    const candidates = myHistoryList.value.filter(item => !item.protected)
    if (!candidates.length) return null
    candidates.sort((a, b) => getHistoryTime(a) - getHistoryTime(b))
    return candidates[0]
  }

  // === Actions: Post Limit & Stats ===
  const refreshPostLimit = async () => {
    try {
      const { data, error } = await supabase.rpc('get_post_limit', { p_user_id: myUuid })
      if (error) throw error
      const payload = Array.isArray(data) ? data[0] : data
      const remoteLimit = payload.post_limit ?? payload.limit
      const remoteCount = payload.post_count ?? payload.count
      
      if (typeof remoteLimit === 'number') {
        postLimit.value = remoteLimit
        postCount.value = typeof remoteCount === 'number' ? remoteCount : myHistoryList.value.length
      }
      
      const { data: repData } = await supabase.from('user_reputation').select('total_upvotes').eq('user_id', myUuid).maybeSingle()
      if (repData) {
          myTotalUpvotes.value = repData.total_upvotes || 0
      }
      return true
    } catch {
      postLimit.value = Math.max(postLimit.value || 20, 20)
      postCount.value = myHistoryList.value.length
    }
    return false
  }
  
  const updateGlobalCount = () => {
    // Disabled for now: global "建言总数" counting request.
    // supabase.from('messages').select('*', { count: 'exact', head: true }).then(res => globalCount.value = res.count || 0)
  }

  // === Actions: Messages (Runes) ===
  const formatRune = (s) => ({
    id: s.id, content: s.content, app_name: s.app_name, 
    x: s.pos_x, y: s.pos_y, 
    upvotes: s.upvotes, downvotes: s.downvotes, user_id: s.user_id
  })

  // LRU Cache for Messages
  // Key: `${appName}|${exactHash}`, Value: { data: [], timestamp: number }
  const messageCache = new Map()
  const CACHE_TTL = 60 * 1000 // 1 minute TTL
  const MAX_CACHE_SIZE = 20
  const DELETED_MESSAGE_EVENT_KEY = 'deleted_message_event'
  const SUBMIT_DEBOUNCE_MS = 3000
  const lastSubmitAt = ref(0)
  const isSubmitInFlight = ref(false)

  const invalidateCurrentContextCache = () => {
    if (!currentWindow.value) return
    const { appName, exactHash, isBrowser } = parseSceneRequest(currentWindow.value)
    const cacheKey = `${appName}|${isBrowser ? exactHash : ''}`
    messageCache.delete(cacheKey)
  }

  const processMessages = (data) => {
    if (!data || data.length === 0) return []

    let pool = [...data]
    // Shuffle
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }

    const mine = pool.filter(m => m.user_id === myUuid)
    const others = pool.filter(m => m.user_id !== myUuid)
    pool = [...mine, ...others]

    const survivors = []
    for (const item of pool) {
      const isOverlapping = survivors.some(s => {
        const dx = s.pos_x - item.pos_x
        const dy = s.pos_y - item.pos_y
        return Math.sqrt(dx*dx + dy*dy) < 0.05
      })
      if (!isOverlapping) {
        survivors.push(item)
      }
      if (survivors.length >= config.maxMessages) break
    }
    return survivors.map(formatRune)
  }

  const validWordsSet = new Set(Object.values(words).flat())
  const conjunctionTexts = conjunctions.map(c => c.text).filter(Boolean)
  const templateRegexes = templates.map(t => {
    const escaped = t.text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const pattern = '^' + escaped.replace('\\*\\*\\*\\*', '\\s*(.+)\\s*') + '$'
    return new RegExp(pattern)
  })

  const validateSentence = (sentence) => {
    if (!sentence) return false
    for (const regex of templateRegexes) {
      const match = sentence.match(regex)
      if (match && match[1]) {
        const extracted = match[1].trim()
        if (validWordsSet.has(extracted)) return true
      }
    }
    return false
  }

  const validateMessageText = (text) => {
    if (!text || typeof text !== 'string') return false
    const parts = text.split('\n')
    for (let i = 0; i < parts.length; i += 1) {
      let sentence = parts[i].trim()
      if (!sentence) continue
      if (i > 0) {
        for (const conj of conjunctionTexts) {
          if (sentence.startsWith(conj)) {
            sentence = sentence.slice(conj.length).trim()
            break
          }
        }
      }
      if (!validateSentence(sentence)) return false
    }
    return true
  }

  const fetchMessages = async (winData) => {
    const { appName, exactHash, isBrowser } = parseSceneRequest(winData)
    
    if (!appName || appName === 'Desktop') {
      runesList.value = []; hasMessages.value = false; return
    }

    // Check Cache
    const cacheKey = `${appName}|${isBrowser ? exactHash : ''}`
    const cached = messageCache.get(cacheKey)
    if (cached && (Date.now() - cached.timestamp < CACHE_TTL)) {
      messageCache.delete(cacheKey)
      messageCache.set(cacheKey, { data: cached.data, timestamp: Date.now() })
      runesList.value = processMessages(cached.data)
      hasMessages.value = runesList.value.length > 0
      return
    }

    try {
      const { data, error } = await supabase.rpc('get_mixed_messages', {
        p_app_name: appName,
        p_exact_hash: isBrowser ? exactHash : '',
        p_limit_hot: 40,
        p_limit_rand: 10
      })

      if (error) {
        runesList.value = []; hasMessages.value = false; return
      }

      // Update Cache
      if (data) {
        if (messageCache.has(cacheKey)) messageCache.delete(cacheKey)
        if (messageCache.size >= MAX_CACHE_SIZE) {
          const oldestKey = messageCache.keys().next().value
          messageCache.delete(oldestKey)
        }
        messageCache.set(cacheKey, { data: data, timestamp: Date.now() })
      }

      runesList.value = processMessages(data)
      hasMessages.value = runesList.value.length > 0
    } catch (err) { console.error(err) }
  }

  const removeLocalMessageById = (id) => {
    runesList.value = runesList.value.filter(r => r.id !== id)
    const nextHistory = myHistoryList.value.filter(r => r.id !== id)
    myHistoryList.value = nextHistory
    persistHistory()
  }

  const removeCachedMessageById = (id) => {
    if (!id) return
    for (const [key, entry] of messageCache.entries()) {
      if (!entry || !Array.isArray(entry.data)) continue
      const nextData = entry.data.filter(item => item.id !== id)
      if (nextData.length === entry.data.length) continue
      if (nextData.length === 0) {
        messageCache.delete(key)
      } else {
        messageCache.set(key, { data: nextData, timestamp: entry.timestamp })
      }
    }
  }

  const emitDeletedMessageEvent = (id) => {
    if (!id) return
    try {
      localStorage.setItem(DELETED_MESSAGE_EVENT_KEY, JSON.stringify({ id, ts: Date.now() }))
    } catch {
      // Ignore storage write failures in restricted environments.
    }
  }

  const handleExternalDeleteEvent = (id) => {
    if (!id) return
    removeLocalMessageById(id)
    removeCachedMessageById(id)
  }

  const deleteMessage = async (id, forceRelinquishCallback = null) => {
    if (forceRelinquishCallback && !pageMode.value) forceRelinquishCallback()
    
    removeLocalMessageById(id)
    removeCachedMessageById(id)
    emitDeletedMessageEvent(id)
    try {
      await supabase.rpc('delete_message', { 
        target_id: id, 
        verify_user_id: myUuid 
      })
    } catch(e) { console.error('Delete failed:', e) }
    finally {
      // updateGlobalCount()
    }
  }

  const submitMessage = async (text, rawClickPos, windowWidth, windowHeight, contextSnapshot, closeMenuCallback) => {
    if (!validateMessageText(text)) {
      return { ok: false, error: '建言格式不合法' }
    }

    const now = Date.now()
    if (isSubmitInFlight.value) {
      return { ok: false, silent: true }
    }
    if (now - lastSubmitAt.value < SUBMIT_DEBOUNCE_MS) {
      return { ok: false, silent: true }
    }

    isSubmitInFlight.value = true
    lastSubmitAt.value = now
    let tempId = null

    try {
      const { appName, exactHash, cleanTitle } = parseSceneRequest(contextSnapshot || lastValidWindow.value)

      const doc = {
        content: text,
        app_name: appName || 'Unknown',
        exact_hash: exactHash || '',
        pos_x: Number((rawClickPos.x / windowWidth).toFixed(4)),
        pos_y: Number((rawClickPos.y / windowHeight).toFixed(4)),
        user_id: myUuid
      }

      // Clear cache for this context to force refresh on next fetch
      const cacheKey = `${appName}|${exactHash || ''}`
      messageCache.delete(cacheKey)

      await refreshPostLimit()
      if (postCount.value >= effectiveLimit.value) {
        const target = findEvictionTarget()
        if (!target) return { ok: false, error: '建言数量已达上限' }
        await deleteMessage(target.id, null) // Silent delete
      }

      // Optimistic UI
      tempId = 'temp_' + Date.now()
      const uiDoc = { ...doc, id: tempId, x: doc.pos_x, y: doc.pos_y, upvotes: 0, downvotes: 0 }
      runesList.value.push(uiDoc)

      myHistoryList.value.push({ ...doc, id: tempId, created_at: new Date(), title_hint: cleanTitle, protected: false })
      persistHistory()

      if (closeMenuCallback) closeMenuCallback()

      const { data: canPost } = await supabase.rpc('check_post_limit', { p_user_id: myUuid })
      if (canPost === false) throw new Error("Message limit reached!")

      const { data, error } = await supabase.from('messages').insert(doc).select()
      if (error) throw error
      if (data && data[0]) {
        const realId = data[0].id
        const t = runesList.value.find(r => r.id === tempId); if (t) t.id = realId
        const h = myHistoryList.value.find(r => r.id === tempId); if (h) h.id = realId
        persistHistory()
      }
    } catch {
      if (tempId) {
        runesList.value = runesList.value.filter(r => r.id !== tempId)
        myHistoryList.value = myHistoryList.value.filter(r => r.id !== tempId)
        persistHistory()
      }
      return { ok: false, error: '提交失败' }
    } finally {
      isSubmitInFlight.value = false
      // updateGlobalCount()
    }
    return { ok: true }
  }

  // === Actions: Voting ===
  const getVoteKey = (id, userId) => `voted_${id}_${userId || myUuid}`
  const getVoteStatus = (id) => localStorage.getItem(getVoteKey(id, myUuid))

  const handleVote = async (id, val, forceRelinquishCallback = null) => {
    if (getVoteStatus(id)) return 

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(id)) return
    
    if (forceRelinquishCallback) forceRelinquishCallback()
    
    const target = runesList.value.find(r => r.id === id)
    if (target) {
      if (val > 0) target.upvotes = (target.upvotes || 0) + 1
      else target.downvotes = (target.downvotes || 0) + 1
    }
    
    localStorage.setItem(getVoteKey(id, myUuid), val > 0 ? 'good' : 'bad')
    invalidateCurrentContextCache()

    try { 
      const { error } = await supabase.rpc('vote_message', { 
        row_id: id, 
        val: val,
        v_user_id: myUuid 
      }) 
      if (error) throw error

      const { data: latest } = await supabase.from('messages').select('id, upvotes, downvotes').eq('id', id).maybeSingle()
      if (latest && target) {
        target.upvotes = latest.upvotes ?? target.upvotes
        target.downvotes = latest.downvotes ?? target.downvotes
      }
    } catch { 
      if (target) {
          if (val > 0) target.upvotes = (target.upvotes || 0) - 1
          else target.downvotes = (target.downvotes || 0) - 1
      }
      localStorage.removeItem(getVoteKey(id, myUuid))
    }
  }

  return {
    // State
    config,
    pageMode,
    globalCount,
    myHistoryList,
    postLimit,
    postCount,
    myTotalUpvotes,
    runesList,
    hasMessages,
    currentWindow,
    lastValidWindow,
    // Computed
    effectiveLimit,
    protectedCount,
    // Actions
    initConfigPersistence,
    initAutoLaunch,
    loadHistoryFromLocal,
    syncHistoryWithServer,
    toggleProtect,
    isProtectDisabled,
    refreshPostLimit,
    updateGlobalCount,
    fetchMessages,
    deleteMessage,
    submitMessage,
    handleVote,
    getVoteStatus,
    handleExternalDeleteEvent
  }
})



