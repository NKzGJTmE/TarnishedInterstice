<template>
  <div class="native-page">
    <div class="history-header">
      <h2>我的建言 <span class="header-count">{{ store.postCount }} / {{ store.effectiveLimit }}</span></h2>
      <div class="header-stat">已获好评：{{ store.myTotalUpvotes }}</div>
    </div>
    <div class="native-list">
      <div v-for="item in store.myHistoryList" :key="item.id" class="native-item">
        <div class="item-meta">
          {{ new Date(item.created_at).toLocaleString() }} 
          <br/>
          <span style="font-weight:bold">{{ item.app_name }}</span>
          <span v-if="item.title_hint" style="color:#666; margin-left:5px"> - {{ item.title_hint }}</span>
        </div>
        <div class="item-content">"{{ item.content }}"</div>
        <div class="item-stats">
          <span class="stat-tag good">好评: {{ item.upvotes || 0 }}</span>
          <span class="stat-tag bad">恶评: {{ item.downvotes || 0 }}</span>
        </div>
        <div class="item-actions">
          <button class="item-btn" :class="{ active: item.protected, disabled: store.isProtectDisabled(item) }" :disabled="store.isProtectDisabled(item)" @click="store.toggleProtect(item)">保护</button>
          <button class="item-btn danger" @click="store.deleteMessage(item.id)">删除</button>
        </div>
      </div>
      <div v-if="store.myHistoryList.length === 0" class="empty-hint">暂无建言</div>
    </div>
  </div>
</template>

<script setup>
import { onMounted } from 'vue'
import { useAppStore } from '../stores/appStore'

const store = useAppStore()

onMounted(() => {
    store.syncHistoryWithServer()
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
.history-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 15px;
    border-bottom: 1px solid #444;
    padding-bottom: 10px;
}
.history-header h2 {
    margin: 0;
    border: none;
    padding: 0;
    color: #fff;
}
.header-count {
    font-size: 16px;
    color: #aaa;
    margin-left: 10px;
    font-weight: normal;
}
.header-stat {
    font-size: 14px;
    color: #888;
    font-weight: bold;
}
.native-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.native-item {
  background: #3a3a3a;
  padding: 10px;
  border-radius: 4px;
  border: 1px solid #444;
}
.item-meta { font-size: 12px; color: #888; margin-bottom: 4px; }
.item-content { font-size: 14px; color: #eee; }
.item-stats {
    margin-top: 5px;
    display: flex;
    gap: 10px;
    font-size: 12px;
}
.stat-tag {
    padding: 2px 6px;
    border-radius: 4px;
    background: #222;
    color: #aaa;
}
.stat-tag.good { color: #aaa; background: #222; }
.stat-tag.bad { color: #aaa; background: #222; }
.item-actions { display: flex; gap: 8px; margin-top: 8px; }
.item-btn { border: 1px solid #555; background: #444; color: #eee; font-size: 12px; padding: 4px 10px; border-radius: 4px; cursor: pointer; }
.item-btn.active { background: #d4af37; color: #000; border-color: #d4af37; }
.item-btn.disabled { opacity: 0.4; cursor: not-allowed; }
.item-btn.danger { border-color: #5a3a3a; color: #dbaaaa; background: #3a2a2a; }
.empty-hint { text-align: center; color: #666; margin-top: 20px; }
</style>
