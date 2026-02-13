<template>
  <div id="app" :data-page-mode="store.pageMode">
    <SettingsMode v-if="store.pageMode === 'settings'" />
    <HistoryMode v-else-if="store.pageMode === 'history'" />
    <OverlayMode v-else />
  </div>
</template>

<script setup>
import { onMounted } from 'vue'
import { useAppStore } from './stores/appStore'
import { registerDevice } from './utils/supabase'

import SettingsMode from './components/SettingsMode.vue'
import HistoryMode from './components/HistoryMode.vue'
import OverlayMode from './components/OverlayMode.vue'

const store = useAppStore()

onMounted(() => {
  // === 路由判断 ===
  const searchParams = new URLSearchParams(window.location.search)
  store.pageMode = searchParams.get('page') || '' // '' 为默认 overlay

  // 注册设备（确保后端认得我们）
  registerDevice()
})
</script>

<style>
/* Global resets or shared styles if any */
body {
  margin: 0;
  padding: 0;
  overflow: hidden; /* Overlay mode needs this, native pages override it */
}
</style>
