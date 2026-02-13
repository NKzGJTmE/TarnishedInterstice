<template>
  <div>
    <!-- 符文层 -->
    <div class="rune-layer" :style="{ opacity: store.config.opacity / 100, '--rune-scale': overlayScale }">
      <TransitionGroup name="fade">
        <div
          v-for="rune in visibleRunes"
          :key="rune.id"
          class="rune-item"
          :style="{ left: rune.x * 100 + '%', top: rune.y * 100 + '%' }"
          :class="{
            'pop-down': rune.y < 0.2,
            'pop-up': rune.y >= 0.2,
            'pop-left': rune.x < 0.15,
            'pop-right': rune.x > 0.6
          }"
        >
          <img :src="runeMarkImg" class="rune-mark-img" draggable="false" @contextmenu.prevent />

          <!-- 弹窗内容 -->
          <div
            class="rune-popup"
            :style="{ '--popup-opacity': store.config.cardOpacity / 100 }"
            @contextmenu.prevent
            @click="forceRelinquishEffect"
          >
            <img :src="cardBgImg" class="popup-bg" draggable="false" />
            <div class="popup-grid">
              <div class="col-rune">
                <img :src="getRuneImg(rune.upvotes, rune.downvotes)" class="rune-level-img" draggable="false" />
              </div>
              <div class="col-info">
                <div class="info-body">{{ rune.content }}</div>

                <div v-if="rune.user_id === myUuid" class="meta-mine">
                  <span class="meta-label">好评</span><span class="meta-num">{{ rune.upvotes || 0 }}</span>
                  <span class="meta-gap"></span>
                  <span class="meta-label">恶评</span><span class="meta-num">{{ rune.downvotes || 0 }}</span>
                </div>

                <div v-else class="meta-others">
                  <span class="meta-left">
                    {{
                      store.getVoteStatus(rune.id) === 'good'
                        ? '已给好评'
                        : store.getVoteStatus(rune.id) === 'bad'
                          ? '已给恶评'
                          : ''
                    }}
                  </span>
                  <span class="meta-right">
                    总评价数 <span class="score-val">{{ (rune.upvotes || 0) + (rune.downvotes || 0) }}</span>
                  </span>
                </div>
              </div>
            </div>

            <div
              v-if="rune.user_id === myUuid"
              class="action-bar interactive"
              @mouseenter="setGlobalHover(true)"
              @mouseleave="setGlobalHover(false)"
            >
              <div class="btn-item" @click.stop="handleDelete(rune.id)">
                <span class="btn-text">删除</span>
              </div>
            </div>

            <div
              v-else
              class="action-bar interactive"
              :class="{ disabled: store.getVoteStatus(rune.id) }"
              @mouseenter="setGlobalHover(true)"
              @mouseleave="setGlobalHover(false)"
            >
              <div class="btn-item" @click.stop="handleVote(rune.id, 1)">
                <span class="btn-text" :class="{ highlight: store.getVoteStatus(rune.id) === 'good' }">好评</span>
              </div>
              <div class="btn-item" @click.stop="handleVote(rune.id, -1)">
                <span class="btn-text" :class="{ highlight: store.getVoteStatus(rune.id) === 'bad' }">恶评</span>
              </div>
            </div>
          </div>
        </div>
      </TransitionGroup>
    </div>

    <div v-if="isWritingMode" class="writing-overlay interactive" @click="handleScreenClick" @contextmenu.prevent="closeWriteMenu"></div>

    <div
      v-if="showWriteMenu"
      class="menu-wrapper interactive"
      :style="{ left: writePos.x + 'px', top: writePos.y + 'px' }"
      @mouseenter="setGlobalHover(true)"
      @mouseleave="setGlobalHover(false)"
    >
      <WriteMenu
        ref="writeMenuRef"
        :initial-x="rawClickPos.x"
        :initial-y="rawClickPos.y"
        @close="closeWriteMenu"
        @submit="submitMessage"
      />
    </div>

    <div v-if="submitError" class="submit-error">{{ submitError }}</div>

    <div
      v-show="isReady"
      ref="ballRef"
      class="interactive floating-ball"
      :class="{ 'has-messages': store.hasMessages, 'is-active': showRunes }"
      :style="{ width: ballSizePx + 'px', height: ballSizePx + 'px' }"
      @mousedown="startDrag"
      @mouseenter="setGlobalHover(true)"
      @mouseleave="setGlobalHover(false)"
      @contextmenu="enterWriteMode"
    >
      <img :src="skinImg" class="ball-icon" draggable="false" />
    </div>
  </div>
</template>

<script setup>
import { onMounted, onUnmounted, ref, reactive, watch, nextTick, computed } from 'vue'
import { useAppStore } from '../stores/appStore'
import { myUuid } from '../utils/supabase'
import WriteMenu from './WriteMenu.vue'

import runeMarkImg from '../assets/rune_mark.png'
import wizenedFingerImg from '../assets/wizened_finger.png'
import somberStoneImg from '../assets/Somber_Ancient_Dragon_Smithing_Stone.png'
import warmingStoneImg from '../assets/warming_stone.png'
import talismanImg from '../assets/Pearldrake_Talisman_3.png'

import cardBgImg from '../assets/ui/card_bg.png'
import runeLvl1 from '../assets/ui/rune_lvl_1.png'
import runeLvl2 from '../assets/ui/rune_lvl_2.png'
import runeLvl3 from '../assets/ui/rune_lvl_3.png'
import runeLvl4 from '../assets/ui/rune_lvl_4.png'
import runeLvl5 from '../assets/ui/rune_lvl_5.png'

const store = useAppStore()

const isWritingMode = ref(false)
const showWriteMenu = ref(false)
const writePos = reactive({ x: 0, y: 0 })
const rawClickPos = reactive({ x: 0, y: 0 })
const currentContextSnapshot = ref(null)
const submitError = ref('')
let submitErrorTimer = null

const BALL_BASE_SIZE = 60
const MARGIN = 20
const RUNE_DESIGN_VIEW_W = 2048
const RUNE_DESIGN_VIEW_H = 1152
const RUNE_MIN_SCALE = 0.7
const RUNE_MAX_SCALE = 1.8
const RUNE_VIEW_MARGIN = 12
const RUNE_BASE_BOX_W = 40
const RUNE_BASE_BOX_H = 40
const RUNE_MARK_W = 150
const RUNE_MARK_H = 150
const WRITE_MENU_PADDING = 20
const WRITE_MENU_BASE_W = 1123
const WRITE_MENU_BASE_H = 660
const WRITE_MENU_TARGET_HEIGHT_RATIO = 0.35
const WRITE_MENU_DESIGN_VIEW_W = 2048
const WRITE_MENU_DESIGN_VIEW_H = 1152
const WRITE_MENU_DESIGN_BASE_ZOOM = (WRITE_MENU_DESIGN_VIEW_H * WRITE_MENU_TARGET_HEIGHT_RATIO) / WRITE_MENU_BASE_H
const ballRef = ref(null)
const writeMenuRef = ref(null)

let leaveTimer = null
const storageHandler = (e) => {
  if (e.key === 'my_runes_history') {
    store.loadHistoryFromLocal()
    return
  }
  if (e.key === 'deleted_message_event' && e.newValue) {
    try {
      const payload = JSON.parse(e.newValue)
      if (payload?.id) store.handleExternalDeleteEvent(payload.id)
    } catch {}
  }
}

let x = 0
let y = 0
let startX = 0
let startY = 0
let isDragging = false
let hasMoved = false

const showRunes = ref(false)
const isGlobalHovering = ref(false)
const isReady = ref(false)
const viewportWidth = ref(2048)
const viewportHeight = ref(1152)

const overlayScale = computed(() => {
  const ratio = Math.min(viewportWidth.value / RUNE_DESIGN_VIEW_W, viewportHeight.value / RUNE_DESIGN_VIEW_H)
  return Math.min(Math.max(ratio, RUNE_MIN_SCALE), RUNE_MAX_SCALE)
})

const clamp = (value, min, max) => Math.min(Math.max(value, min), max)

const clampRunePosition = (rx = 0, ry = 0) => {
  const scale = overlayScale.value
  const leftOverflow = ((RUNE_MARK_W - RUNE_BASE_BOX_W) / 2) * scale
  const rightReach = (RUNE_BASE_BOX_W + (RUNE_MARK_W - RUNE_BASE_BOX_W) / 2) * scale
  const topOverflow = ((RUNE_MARK_H - RUNE_BASE_BOX_H) / 2) * scale
  const bottomReach = (RUNE_BASE_BOX_H + (RUNE_MARK_H - RUNE_BASE_BOX_H) / 2) * scale

  const minX = (leftOverflow + RUNE_VIEW_MARGIN) / Math.max(viewportWidth.value, 1)
  const maxX = (viewportWidth.value - rightReach - RUNE_VIEW_MARGIN) / Math.max(viewportWidth.value, 1)
  const minY = (topOverflow + RUNE_VIEW_MARGIN) / Math.max(viewportHeight.value, 1)
  const maxY = (viewportHeight.value - bottomReach - RUNE_VIEW_MARGIN) / Math.max(viewportHeight.value, 1)

  if (minX >= maxX || minY >= maxY) return { x: 0.5, y: 0.5 }
  return { x: clamp(rx, minX, maxX), y: clamp(ry, minY, maxY) }
}

const visibleRunes = computed(() => {
  if (!showRunes.value) return []
  return store.runesList.map((rune) => {
    const pos = clampRunePosition(rune.x, rune.y)
    return { ...rune, x: pos.x, y: pos.y }
  })
})

const ballScale = computed(() => Math.min(Math.max(overlayScale.value, 0.8), 1.6))
const ballSizePx = computed(() => Math.round(BALL_BASE_SIZE * ballScale.value))

const skinImg = computed(() => {
  switch (Number(store.config.skinId)) {
    case 2:
      return somberStoneImg
    case 3:
      return warmingStoneImg
    case 4:
      return talismanImg
    default:
      return wizenedFingerImg
  }
})

const getRuneImg = (up, down) => {
  const score = (up || 0) - (down || 0)
  if (score < 0 || score < 10) return runeLvl1
  if (score < 30) return runeLvl2
  if (score < 50) return runeLvl3
  if (score < 100) return runeLvl4
  return runeLvl5
}

const setGlobalHover = (flag) => {
  if (isDragging) return
  if (flag) {
    if (leaveTimer) clearTimeout(leaveTimer)
    leaveTimer = null
    isGlobalHovering.value = true
    updateInteractionState()
  } else {
    if (leaveTimer) clearTimeout(leaveTimer)
    leaveTimer = setTimeout(() => {
      isGlobalHovering.value = false
      updateInteractionState()
    }, 100)
  }
}

const forceRelinquishEffect = () => {
  isGlobalHovering.value = false
  updateInteractionState()
}

const updateInteractionState = () => {
  if (!window.electron?.setIgnoreMouseEvents) return
  if (isDragging || isWritingMode.value || showWriteMenu.value || isGlobalHovering.value) window.electron.setIgnoreMouseEvents(false)
  else window.electron.setIgnoreMouseEvents(true)
}

watch([isWritingMode, showWriteMenu, isGlobalHovering], () => {
  nextTick(() => updateInteractionState())
})

const updateBallPosition = () => {
  if (ballRef.value) ballRef.value.style.transform = `translate3d(${x}px, ${y}px, 0)`
}

const syncViewportSize = () => {
  viewportWidth.value = window.innerWidth
  viewportHeight.value = window.innerHeight
}

const calcWriteMenuSize = () => {
  const viewportScale = Math.min(window.innerWidth / WRITE_MENU_DESIGN_VIEW_W, window.innerHeight / WRITE_MENU_DESIGN_VIEW_H)
  const zoom = Math.min(Math.max(WRITE_MENU_DESIGN_BASE_ZOOM * viewportScale, 0.35), 1.8)
  return { width: WRITE_MENU_BASE_W * zoom, height: WRITE_MENU_BASE_H * zoom }
}

const calcWriteMenuPosition = (clickX, clickY) => {
  const { width, height } = calcWriteMenuSize()
  let fx = clickX
  let fy = clickY

  if (fx + width + WRITE_MENU_PADDING > window.innerWidth) fx -= width
  if (fy + height + WRITE_MENU_PADDING > window.innerHeight) fy -= height

  fx = Math.max(WRITE_MENU_PADDING, Math.min(fx, window.innerWidth - width - WRITE_MENU_PADDING))
  fy = Math.max(WRITE_MENU_PADDING, Math.min(fy, window.innerHeight - height - WRITE_MENU_PADDING))
  return { x: fx, y: fy }
}

const handleViewportResize = () => {
  syncViewportSize()
  const ballSize = ballSizePx.value
  const maxX = window.innerWidth - ballSize - MARGIN
  const maxY = window.innerHeight - ballSize - MARGIN
  x = Math.min(Math.max(x, MARGIN), Math.max(MARGIN, maxX))
  y = Math.min(Math.max(y, MARGIN), Math.max(MARGIN, maxY))
  updateBallPosition()

  if (showWriteMenu.value) {
    const nextPos = calcWriteMenuPosition(rawClickPos.x, rawClickPos.y)
    writePos.x = nextPos.x
    writePos.y = nextPos.y
  }
}

const onMouseMove = (e) => {
  if (!isDragging) return
  if (Math.abs(e.clientX - (startX + x)) > 3 || Math.abs(e.clientY - (startY + y)) > 3) hasMoved = true
  x = e.clientX - startX
  y = e.clientY - startY
  updateBallPosition()
}

const onMouseUp = () => {
  if (!isDragging) return
  isDragging = false
  if (window.electron?.endDrag) window.electron.endDrag()

  window.removeEventListener('mousemove', onMouseMove)
  window.removeEventListener('mouseup', onMouseUp)

  const ballSize = ballSizePx.value
  const mx = window.innerWidth - ballSize - MARGIN
  const my = window.innerHeight - ballSize - MARGIN
  x = Math.min(Math.max(x, MARGIN), mx)
  y = Math.min(Math.max(y, MARGIN), my)
  updateBallPosition()

  if (!hasMoved) toggleRunes()
  updateInteractionState()
}

const startDrag = (e) => {
  if (e.button !== 0) return
  e.preventDefault()

  if (window.electron?.startDrag) window.electron.startDrag()
  isDragging = true
  hasMoved = false
  startX = e.clientX - x
  startY = e.clientY - y
  if (window.electron?.setIgnoreMouseEvents) window.electron.setIgnoreMouseEvents(false)

  window.addEventListener('mousemove', onMouseMove)
  window.addEventListener('mouseup', onMouseUp)
}

const toggleRunes = async () => {
  if (store.hasMessages || showRunes.value) {
    const next = !showRunes.value
    showRunes.value = next
    if (!next) forceRelinquishEffect()
    else if (store.currentWindow) await store.fetchMessages(store.currentWindow)
  }
}

const enterWriteMode = (e) => {
  e.preventDefault()
  if (window.electron?.requestFocus) window.electron.requestFocus()

  if (store.currentWindow) currentContextSnapshot.value = JSON.parse(JSON.stringify(store.currentWindow))
  else currentContextSnapshot.value = { title: '', owner: { name: 'Desktop' } }
  isWritingMode.value = true
}

const handleScreenClick = (e) => {
  if (!isWritingMode.value || showWriteMenu.value) return
  rawClickPos.x = e.clientX
  rawClickPos.y = e.clientY

  const nextPos = calcWriteMenuPosition(e.clientX, e.clientY)
  writePos.x = nextPos.x
  writePos.y = nextPos.y

  showWriteMenu.value = true
  isWritingMode.value = false
}

const closeWriteMenu = () => {
  if (window.electron?.relinquishFocus) window.electron.relinquishFocus()
  forceRelinquishEffect()
  setTimeout(() => {
    showWriteMenu.value = false
    isWritingMode.value = false
    currentContextSnapshot.value = null
    setGlobalHover(false)
    updateInteractionState()
  }, 50)
}

const submitMessage = async (text) => {
  const result = await store.submitMessage(text, rawClickPos, window.innerWidth, window.innerHeight, currentContextSnapshot.value, closeWriteMenu)
  if (!result?.ok) {
    if (result?.silent) return
    submitError.value = result?.error || '提交失败'
    if (submitErrorTimer) clearTimeout(submitErrorTimer)
    submitErrorTimer = setTimeout(() => {
      submitError.value = ''
    }, 2000)
    return
  }
  showRunes.value = true
}

const handleDelete = (id) => {
  store.deleteMessage(id, forceRelinquishEffect)
}

const handleVote = (id, val) => {
  store.handleVote(id, val, forceRelinquishEffect)
}

let windowUpdateDisposer = null

onMounted(() => {
  syncViewportSize()
  const ballSize = ballSizePx.value
  x = window.innerWidth - ballSize - 50
  y = window.innerHeight * 0.8
  updateBallPosition()
  isReady.value = true

  store.initConfigPersistence()
  store.loadHistoryFromLocal()
  store.refreshPostLimit()
  store.initAutoLaunch()
  store.updateGlobalCount()

  if (window.electron) {
    windowUpdateDisposer = window.electron.onWindowUpdate((data) => {
      if (isDragging) return

      const app = (data?.owner?.name || '').toLowerCase()
      if (app.includes('electron') || app.includes('tarnished')) return

      store.lastValidWindow = data
      if (store.currentWindow?.title !== data.title || store.currentWindow?.owner?.name !== data.owner?.name) {
        store.currentWindow = data
        if (!isWritingMode.value && !showWriteMenu.value) store.fetchMessages(data)
      }
    })
  }

  window.addEventListener('storage', storageHandler)
  window.addEventListener('resize', handleViewportResize)
})

onUnmounted(() => {
  if (windowUpdateDisposer) {
    windowUpdateDisposer()
    windowUpdateDisposer = null
  }
  window.removeEventListener('storage', storageHandler)
  window.removeEventListener('resize', handleViewportResize)
  window.removeEventListener('mousemove', onMouseMove)
  window.removeEventListener('mouseup', onMouseUp)
  if (leaveTimer) clearTimeout(leaveTimer)
  if (submitErrorTimer) clearTimeout(submitErrorTimer)
})
</script>

<style scoped>
.interactive { pointer-events: auto !important; user-select: none; }
.floating-ball { position: fixed; width: 60px; height: 60px; background: transparent; z-index: 2000; will-change: transform; transition: transform 0.1s; display: flex; align-items: center; justify-content: center; cursor: grab; opacity: 1; filter: drop-shadow(0 2px 5px rgba(0,0,0,0.5)); }
.floating-ball.has-messages { animation: golden-breath 2s infinite ease-in-out; }
.floating-ball.is-active { transform: scale(1.1); filter: drop-shadow(0 0 5px #f0efe3) drop-shadow(0 0 15px rgba(247, 240, 203, 0.6)); animation: none; }
.floating-ball:active { cursor: grabbing; transform: scale(0.95); }
.ball-icon { width: 100%; height: 100%; object-fit: contain; -webkit-user-drag: none; }
@keyframes golden-breath { 0%, 100% { filter: drop-shadow(0 2px 5px rgba(0,0,0,0.5)); } 50% { filter: drop-shadow(0 0 15px rgba(249, 244, 215, 0.95)); } }
.rune-layer { position: fixed; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; z-index: 1000; }
.rune-item {
  position: absolute;
  width: 40px;
  height: 40px;
  display: flex;
  justify-content: center;
  align-items: center;
  transform: scale(var(--rune-scale, 1));
  transform-origin: top left;
}
.rune-mark-img { width: 150px; height: auto; opacity: 1; transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1); pointer-events: auto !important; cursor: help; }
.rune-item:hover .rune-mark-img { transform: scale(1.1); opacity: 1; }
.rune-popup { position: absolute; bottom: 80%; left: 50%; transform: translateX(-50%); width: 700px; height: 140px; z-index: 5000; pointer-events: auto !important; opacity: 0; visibility: hidden; transition: opacity 0.2s ease, transform 0.2s ease; font-family: "Garamond", "Times New Roman", serif; color: #ccc; user-select: none; }
.rune-item:hover .rune-popup { opacity: 1; visibility: visible; transform: translateX(-50%) translateY(-10px); }
.rune-popup::before { content: ''; position: absolute; top: 100%; left: 0; width: 100%; height: 60px; background: transparent; pointer-events: auto; }
.popup-bg { position: absolute; top: 0; left: 0; width: 100%; height: 100%; object-fit: fill; z-index: -1; filter: drop-shadow(0 4px 10px rgba(0,0,0,0.8)); opacity: var(--popup-opacity, 0.7); }
.popup-grid, .col-rune, .col-info { position: static; display: block; width: 100%; height: 100%; padding: 0; margin: 0; border: none; }
.rune-level-img { position: absolute; top: -5px; left: 90px; width: 110px; height: auto; opacity: 0.9; }
.info-body { position: absolute; top: 25px; left: 210px; width: 500px; white-space: pre-wrap; word-wrap: break-word; font-size: 18px; color: #e0e0e0; font-weight: bold; text-shadow: 0 0 2px rgba(0,0,0,0.5); line-height: 1.3; text-align: left; }
.meta-mine { position: absolute; top: 80px; right: 60px; display: flex; align-items: center; justify-content: flex-end; font-size: 15px; color: #e0e0e0; }
.meta-label { margin-right: 8px; opacity: 0.8; }
.meta-num { font-weight: bold; color: #fff; }
.meta-gap { width: 30px; display: inline-block; }
.meta-others { position: absolute; top: 80px; left: 230px; width: 350px; display: flex; justify-content: space-between; align-items: flex-end; font-size: 15px; color: #e0e0e0; }
.meta-left { opacity: 0.8; font-style: italic; }
.meta-right { opacity: 0.9; }
.score-val { font-size: 15px; font-weight: bold; margin-left: 5px; color: #fff; }
.action-bar { position: absolute; bottom: 6px; left: 0; width: 100%; display: flex; justify-content: center; align-items: center; gap: 25px; cursor: default; pointer-events: auto !important; }
.action-bar.disabled { pointer-events: none !important; }
.btn-item { cursor: pointer; padding: 5px 10px; display: flex; align-items: center; transition: all 0.2s ease; }
.btn-item:hover .btn-text { color: #fff; text-shadow: 0 0 5px #fff; }
.btn-text { font-size: 15px; color: #888; font-weight: bold; transition: color 0.2s; }
.btn-text.highlight { color: #fff; }
.btn-text.dimmed { opacity: 0.3; color: #888; }
.rune-item.pop-down .rune-popup { bottom: auto; top: 60%; transform: translateX(-50%) translateY(10px); }
.rune-item.pop-left .rune-popup { left: -20px; transform: translateY(-10px); }
.rune-item.pop-right .rune-popup { left: auto; right: -50px; transform: translateY(-10px); }
.fade-enter-active, .fade-leave-active { transition: opacity 0.5s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
.writing-overlay { position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; z-index: 3000; background: transparent; pointer-events: auto !important; cursor: url('../assets/cursor_finger.png') 0 0, crosshair; }
.submit-error { position: fixed; top: 20px; right: 20px; z-index: 6000; background: rgba(200, 50, 50, 0.9); color: #fff; padding: 10px 14px; border-radius: 6px; font-size: 14px; pointer-events: none; }
</style>

