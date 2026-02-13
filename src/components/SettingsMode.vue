<template>
  <div class="native-page">
    <div class="settings-header">
        <h2>系统设置</h2>
        <div class="server-stat">建言总数: {{ store.globalCount }}</div>
    </div>
    <div class="native-group">
      <div class="native-row">
        <label>符文不透明度 ({{ store.config.opacity }}%)</label>
        <input v-model="store.config.opacity" type="range" min="20" max="100" />
      </div>
      <div class="native-row">
        <label>建言卡片不透明度 ({{ store.config.cardOpacity }}%)</label>
        <input v-model="store.config.cardOpacity" type="range" min="20" max="100" />
      </div>
      <div class="native-row">
        <label>同屏建言显示上限 ({{ store.config.maxMessages }})</label>
        <input v-model="store.config.maxMessages" type="range" min="3" max="20" />
      </div>
      <div class="native-row">
        <label>开机自启</label>
        <input v-model="store.config.autoLaunch" type="checkbox" class="toggle-switch" />
      </div>
      <div class="native-row">
         <label>悬浮球皮肤</label>
         <select v-model="store.config.skinId" class="skin-select">
             <option :value="1">褪色者老指</option>
             <option :value="2">古龙岩失色锻造石</option>
             <option :value="3">温热石</option>
             <option :value="4">珍珠龙徽护符</option>
         </select>
       </div>
       <div class="native-row" style="margin-top: 20px; border-top: 1px solid #444; padding-top: 15px;">
          <label>数据目录</label>
          <button class="action-btn" @click="openDataFolder">打开</button>
       </div>
    </div>
    <div class="status-bar">
        <div class="status-indicator" :class="{ online: isOnline }"></div>
        <span>{{ isOnline ? '网络通畅 (Online)' : '网络异常 (Offline)' }}</span>
    </div>
    <div class="native-hint">设置会自动保存。</div>
  </div>
</template>

<script setup>
import { onMounted, onUnmounted, ref } from 'vue'
import { useAppStore } from '../stores/appStore'
import { supabase } from '../utils/supabase'

const store = useAppStore()
const isOnline = ref(false)

const openDataFolder = () => {
    if (window.electron?.openDataFolder) {
        window.electron.openDataFolder()
    }
}

const checkNetwork = async () => {
    try {
        const { error } = await supabase.from('messages').select('id').limit(1)
        isOnline.value = !error
    } catch {
        isOnline.value = false
    }
}

let networkTimer = null

onMounted(() => {
    store.initConfigPersistence()
    store.initAutoLaunch()
    checkNetwork()
    networkTimer = setInterval(checkNetwork, 30000)
})

onUnmounted(() => {
    if (networkTimer) clearInterval(networkTimer)
})
</script>

<style scoped>
.native-page {
  padding: 20px;
  background: #2b2b2b;
  height: 100vh;
  box-sizing: border-box;
  font-family: system-ui, -apple-system, sans-serif;
  color: #e0e0e0;
  pointer-events: auto !important;
  overflow-y: auto !important;
}
.settings-header { display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid #444; padding-bottom: 10px; margin-bottom: 15px; }
.settings-header h2 { border: none; padding: 0; margin: 0; color: #fff; }
.server-stat { font-size: 12px; color: #aaa; font-weight: normal; }
.native-group {
  background: #3a3a3a;
  border: 1px solid #444;
  border-radius: 8px;
  padding: 15px;
  margin-bottom: 15px;
}
.native-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}
.native-row:last-child { margin-bottom: 0; }
.native-hint { color: #888; font-size: 12px; margin-top: 10px; }
.toggle-switch { width: 20px; height: 20px; cursor: pointer; }
.skin-select { padding: 4px; border-radius: 4px; border: 1px solid #555; background: #222; color: #eee; font-size: 14px; }
.action-btn { padding: 4px 12px; border: 1px solid #555; background: #444; color: #eee; border-radius: 4px; cursor: pointer; font-size: 12px; }
.action-btn:hover { background: #555; }
.status-bar { display: flex; align-items: center; gap: 8px; font-size: 13px; color: #aaa; margin-top: 10px; }
.status-indicator { width: 8px; height: 8px; border-radius: 50%; background: #666; }
.status-indicator.online { background: #4caf50; box-shadow: 0 0 4px #4caf50; }
</style>
