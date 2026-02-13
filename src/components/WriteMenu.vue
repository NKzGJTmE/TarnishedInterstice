<template>
  <div class="modal-mask" @mousedown.stop @contextmenu.prevent="handleRightClick">
    
    <!-- === 主窗口 === -->
    <div 
      class="game-window main-window" 
      :style="{ 
        left: finalX + 'px', 
        top: finalY + 'px', 
        width: realWindowWidth + 'px',
        height: realWindowHeight + 'px'
      }"
    >
      <div class="window-canvas" :style="{ width: baseWindowWidth + 'px', height: baseWindowHeight + 'px', transform: `scale(${relativeScale})`, transformOrigin: 'top left' }">
      <!-- 背景层 -->
      <div class="bg-layers">
        <img :src="ui.bgSimple" class="bg-img" :class="{ active: !isComplexMode }" />
        <img :src="ui.bgComplex" class="bg-img" :class="{ active: isComplexMode }" />
      </div>

      <!-- 预览区 -->
      <div class="preview-area">
        <div class="p-line" :class="{ empty: !s1.temp }">{{ currentTextS1 }}</div>
        <div v-if="isComplexMode" class="p-line" :class="{ empty: !s2.temp }">{{ combinedTextS2 }}</div>
      </div>

      <!-- 交互热区 -->
      <div class="hotspots-container">
        <!-- 范本 1 -->
        <div class="hotspot row-1" @click="openSelector('s1-temp')" @mouseenter="hoverSlot='s1-temp'" @mouseleave="hoverSlot=''">
          <img v-show="hoverSlot==='s1-temp'" :src="ui.boxHighlight" class="glow-bar" />
          <span class="slot-text">{{ s1.temp?.text || '' }}</span>
        </div>
        
        <!-- 单字 1 -->
        <div class="hotspot row-2" @click="openSelector('s1-word')" @mouseenter="hoverSlot='s1-word'" @mouseleave="hoverSlot=''">
          <img v-show="hoverSlot==='s1-word'" :src="ui.boxHighlight" class="glow-bar" />
          <span class="slot-text">{{ s1.word || '' }}</span>
        </div>

        <!-- 复句模式 -->
        <template v-if="isComplexMode">
          <div class="hotspot row-3" @click="openSelector('conj')" @mouseenter="hoverSlot='conj'" @mouseleave="hoverSlot=''">
            <img v-show="hoverSlot==='conj'" :src="ui.boxHighlight" class="glow-bar" />
            <span class="slot-text">{{ connection?.text || '' }}</span>
          </div>
          <div class="hotspot row-4" @click="openSelector('s2-temp')" @mouseenter="hoverSlot='s2-temp'" @mouseleave="hoverSlot=''">
            <img v-show="hoverSlot==='s2-temp'" :src="ui.boxHighlight" class="glow-bar" />
            <span class="slot-text">{{ s2.temp?.text || '' }}</span>
          </div>
          <div class="hotspot row-5" @click="openSelector('s2-word')" @mouseenter="hoverSlot='s2-word'" @mouseleave="hoverSlot=''">
            <img v-show="hoverSlot==='s2-word'" :src="ui.boxHighlight" class="glow-bar" />
            <span class="slot-text">{{ s2.word || '' }}</span>
          </div>
        </template>

        <!-- 完成按钮 -->
        <div class="hotspot btn-finish" @click="handleFinish" @mouseenter="hoverSlot='finish'" @mouseleave="hoverSlot=''">
           <img :src="ui.btnFinish" class="glow-btn" :style="{ opacity: btnOpacity }" />
        </div>
      </div>

      <div class="toggle-btn" @click="toggleMode">切换讯息格式</div>
      </div>
    </div>


    <!-- === 二级选择窗口 === -->
    <div 
      v-if="selectorState.isOpen" 
      class="game-window sub-window"
      :style="{ 
        left: finalX + 'px', 
        top: finalY + 'px', 
        width: realWindowWidth + 'px',
        height: realWindowHeight + 'px'
      }"
    >
      <div class="window-canvas" :style="{ width: baseWindowWidth + 'px', height: baseWindowHeight + 'px', transform: `scale(${relativeScale})`, transformOrigin: 'top left' }">
      
      <div class="bg-layers"><img :src="selectorBg" class="bg-img active" /></div>
      <div class="sub-title">{{ selectorTitle }}</div>

      <!-- 列表容器 -->
      <div
class="list-scroll-area" 
           @wheel.prevent="handleListWheel">
        
        <!-- A. 简单列表 -->
        <template v-if="selectorState.type !== 'word'">
          <div 
            v-for="item in visibleSimpleList" :key="item.id"
            class="list-row"
            @click="handleSelect(item)"
          >
            <img 
               v-if="isItemSelected(item)"
               class="row-hover-bg active-bar" 
               :src="ui.barHighlight" 
            />
            <img class="row-hover-bg hover-bar" :src="ui.barHighlight" />
            
            <span class="row-text">{{ item.text }}</span>
          </div>
        </template>

        <!-- B. 双栏列表  -->
        <template v-else>
           
           <!-- 左栏 - 分类列表 -->
           <div
class="col-left" 
                @wheel.stop.prevent="(e) => handleScroll(e, 'cat')"
                @mouseleave="handleCategoryLeave"> 
              <div
v-for="key in visibleCategories" :key="key" 
                   class="list-row small" 
                   :class="{ 
                      active: currentCategory === key,
                      hovered: hoveredCategory === key 
                   }"
                   @mouseenter="handleCategoryChange(key)"
                   @click="handleCategoryChange(key)"> 
                 <!-- 左栏选中常亮 -->
                 <img
v-show="currentCategory === key" 
                      class="row-hover-bg active-bar" 
                      :src="ui.barHighlight" 
                 />
                 <!-- 左栏悬停临时亮 -->
                 <img
v-show="hoveredCategory === key" 
                      class="row-hover-bg hover-bar"
                      :src="ui.barHighlight" 
                 />
                 <span class="row-text">{{ categoryNames[key] }}</span>
              </div>
           </div>
           <!-- 右栏 - 词语列表 -->
           <div
class="col-right" 
                @wheel.stop.prevent="(e) => handleScroll(e, 'word')">
              <div
v-for="w in visibleWords" :key="w" 
                   class="list-row small" 
                   :class="{ active: getCurrentTarget().word === w }"
                   @click="handleSelect(w)">
                 <!-- 右栏选中常亮 -->
                 <img v-show="getCurrentTarget().word === w" class="row-hover-bg active-bar" :src="ui.barHighlight" />
                 <!-- 右栏悬停临时亮 -->
                 <img class="row-hover-bg hover-bar" :src="ui.barHighlight" />
                 <span class="row-text">{{ w }}</span>
              </div>
           </div>
        </template>
      </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { templates, words, conjunctions, categoryNames } from '../assets/wordBank'

const getImg = (name) => new URL(`../assets/ui/${name}`, import.meta.url).href
const ui = {
  bgSimple: getImg('bg_simple.png'),
  bgComplex: getImg('bg_complex.png'),
  bgListSingle: getImg('bg_list_single.png'),
  bgListDouble: getImg('bg_list_double.png'),
  barHighlight: getImg('bar_highlight.png'),
  boxHighlight: getImg('box_highlight.png'),
  btnFinish: getImg('btn_finish_highlight.png')
}

const emit = defineEmits(['close', 'submit'])

const props = defineProps({
  initialX: { type: Number, default: 0 },
  initialY: { type: Number, default: 0 }
})

const VISIBLE_ROWS = 10
const BASE_W = 1123 
const BASE_H = 660 
const TARGET_HEIGHT_RATIO = 0.35
const DESIGN_VIEW_W = 2048
const DESIGN_VIEW_H = 1152
const DESIGN_BASE_ZOOM = (DESIGN_VIEW_H * TARGET_HEIGHT_RATIO) / BASE_H

const isComplexMode = ref(false)
const hoverSlot = ref('')
const s1 = ref({ temp: null, word: null })
const s2 = ref({ temp: null, word: null })
const connection = ref(null) 
const selectorState = ref({ isOpen: false, target: '', type: '', scrollSimple: 0, scrollCat: 0, scrollWord: 0, currentCat: 'enemies' })

const offsetSimple = ref(0)
const offsetCat = ref(0) 
const offsetWord = ref(0)
const dynamicZoom = ref(1) 
const finalX = ref(0) 
const finalY = ref(0) 

const hoveredCategory = ref(null); 
const currentCategory = ref('enemies'); 
let layoutPoller = null
let lastViewportWidth = 0
let lastViewportHeight = 0
let lastDevicePixelRatio = 0

watch(() => selectorState.value.isOpen, (newVal) => {
  if (newVal && selectorState.value.type === 'word') {
    const firstCategory = Object.keys(words)[0] || 'enemies';
    currentCategory.value = firstCategory;
    hoveredCategory.value = firstCategory; 
    offsetWord.value = 0; 
  }
});


const calcLayout = () => {
  const viewportScale = Math.min(
    window.innerWidth / DESIGN_VIEW_W,
    window.innerHeight / DESIGN_VIEW_H
  )
  let z = DESIGN_BASE_ZOOM * viewportScale
  z = Math.min(Math.max(z, 0.35), 1.8)
  dynamicZoom.value = z

  const realW = BASE_W * z 
  const realH = BASE_H * z 
  
  let fx = props.initialX 
  let fy = props.initialY 
  
  if (fx + realW > window.innerWidth) fx = window.innerWidth - realW - 20
  if (fy + realH > window.innerHeight) {
    fy = props.initialY - realH
    if (fy < 0) fy = window.innerHeight - realH - 20
  }
  
  finalX.value = Math.max(fx, 20) 
  finalY.value = Math.max(fy, 20) 
}

const realWindowWidth = computed(() => BASE_W * dynamicZoom.value);
const realWindowHeight = computed(() => BASE_H * dynamicZoom.value);
const relativeScale = computed(() => dynamicZoom.value / DESIGN_BASE_ZOOM)
const baseWindowWidth = computed(() => BASE_W * DESIGN_BASE_ZOOM)
const baseWindowHeight = computed(() => BASE_H * DESIGN_BASE_ZOOM)

const selectorBg = computed(() => selectorState.value.type === 'word' ? ui.bgListDouble : ui.bgListSingle)

const currentList = computed(() => {
  if (selectorState.value.type === 'template') return templates
  if (selectorState.value.type === 'conj') return conjunctions
  return []
})
const selectorTitle = computed(() => {
  if (selectorState.value.type === 'template') return '范本'
  if (selectorState.value.type === 'conj') return '连接词'
  return '单字'
})

const currentTextS1 = computed(() => s1.value.temp ? s1.value.temp.text.replace('****', s1.value.word || '****') : '')
const combinedTextS2 = computed(() => {
  if (!isComplexMode.value) return '';
  let text = '';
  if (connection.value?.text) {
    text += connection.value.text ; 
  }
  if (s2.value.temp) {
    text += s2.value.temp.text.replace('****', s2.value.word || '****');
  }
  return text;
});

const isFormValid = computed(() => {
  const s1Valid = s1.value.temp && s1.value.word
  if(!isComplexMode.value) return s1Valid
  return s1Valid && connection.value && s2.value.temp && s2.value.word
})

const btnOpacity = computed(() => {
  if (!isFormValid.value) return 0
  return hoverSlot.value === 'finish' ? 1 : 0.8
})

const getCurrentTarget = () => selectorState.value.target.startsWith('s2') ? s2.value : s1.value

const isItemSelected = (item) => {
  if (selectorState.value.type === 'template') return getCurrentTarget().temp?.id === item.id
  if (selectorState.value.type === 'conj') return connection.value?.id === item.id
  return false
}

const visibleSimpleList = computed(() => currentList.value.slice(offsetSimple.value, offsetSimple.value + VISIBLE_ROWS))
const allCategories = computed(() => Object.keys(words))
const visibleCategories = computed(() => allCategories.value.slice(offsetCat.value, offsetCat.value + VISIBLE_ROWS))

const currentWordList = computed(() => words[hoveredCategory.value || currentCategory.value] || []);
const visibleWords = computed(() => currentWordList.value.slice(offsetWord.value, offsetWord.value + VISIBLE_ROWS))

const toggleMode = () => isComplexMode.value = !isComplexMode.value

const openSelector = (target) => {
  const type = target.includes('temp') ? 'template' : (target.includes('conj') ? 'conj' : 'word')
  selectorState.value = { isOpen: true, target, type, currentCat: 'enemies' } 
  offsetSimple.value = 0; offsetCat.value = 0; offsetWord.value = 0
  if (type === 'word') {
    const firstCategory = Object.keys(words)[0] || 'enemies';
    currentCategory.value = firstCategory;
    hoveredCategory.value = firstCategory;
  }
}

const handleRightClick = () => {
  if (selectorState.value.isOpen) selectorState.value.isOpen = false
  else emit('close')
}

const handleSelect = (item) => {
  if (selectorState.value.type === 'template') getCurrentTarget().temp = item
  else if (selectorState.value.type === 'conj') connection.value = item
  else if (selectorState.value.type === 'word') getCurrentTarget().word = item
  selectorState.value.isOpen = false
}

const handleCategoryChange = (key) => {
  if (currentCategory.value === key) return;
  currentCategory.value = key;
  hoveredCategory.value = key;
  offsetWord.value = 0;
};

const handleCategoryLeave = () => {
  // 保持当前选中状态即可，无需额外操作，因为 change 时已经 set 了
};

// 统一滚动处理 (支持滚轮)
const handleScroll = (e, type) => {
  const isUp = e.deltaY < 0;
  if (type === 'simple') {
    const max = Math.max(0, currentList.value.length - VISIBLE_ROWS);
    offsetSimple.value = isUp ? Math.max(offsetSimple.value - 1, 0) : Math.min(offsetSimple.value + 1, max);
  } else if (type === 'cat') {
    const max = Math.max(0, allCategories.value.length - VISIBLE_ROWS);
    offsetCat.value = isUp ? Math.max(offsetCat.value - 1, 0) : Math.min(offsetCat.value + 1, max);
  } else if (type === 'word') {
    const max = Math.max(0, currentWordList.value.length - VISIBLE_ROWS);
    offsetWord.value = isUp ? Math.max(offsetWord.value - 1, 0) : Math.min(offsetWord.value + 1, max);
  }
};

const handleListWheel = (e) => handleScroll(e, 'simple');


const handleFinish = () => {
  if (!isFormValid.value) return
  let final = currentTextS1.value
  if (isComplexMode.value) final += `\n${combinedTextS2.value}` 
  emit('submit', final)
}

onMounted(() => {
  calcLayout() 
  lastViewportWidth = window.innerWidth
  lastViewportHeight = window.innerHeight
  lastDevicePixelRatio = window.devicePixelRatio || 1
  window.addEventListener('resize', calcLayout)
  layoutPoller = setInterval(() => {
    const w = window.innerWidth
    const h = window.innerHeight
    const dpr = window.devicePixelRatio || 1
    if (w !== lastViewportWidth || h !== lastViewportHeight || dpr !== lastDevicePixelRatio) {
      lastViewportWidth = w
      lastViewportHeight = h
      lastDevicePixelRatio = dpr
      calcLayout()
    }
  }, 300)
  Object.values(ui).forEach(src => { const i = new Image(); i.src = src })
})
onUnmounted(() => {
  window.removeEventListener('resize', calcLayout)
  if (layoutPoller) {
    clearInterval(layoutPoller)
    layoutPoller = null
  }
})
</script>

<style scoped>
.modal-mask { 
  position: fixed; 
  top: 0; 
  left: 0; 
  width: 100vw; 
  height: 100vh; 
  z-index: 5000; 
  pointer-events: auto; 
}

.game-window {
  position: fixed; 
  background-size: contain; 
  background-repeat: no-repeat; 
  background-position: center;
  font-family: serif; color: #ccc; user-select: none;
  -webkit-font-smoothing: antialiased;
  overflow: hidden;
}

.window-canvas {
  position: absolute;
  top: 0;
  left: 0;
}

.bg-layers { position: absolute; top: 0; left: 0; width: 100%; height: 100%; z-index: -1; pointer-events: none; }
.bg-img { position: absolute; top: 0; left: 0; width: 100%; height: 100%; object-fit: fill; opacity: 0; }
.bg-img.active { opacity: 1; }

.preview-area { 
  position: absolute; 
  top: 5%; 
  width: 100%; 
  text-align: center; 
  font-size: 18px; 
  color: #fff;    
  text-shadow: 0 0 10px #fff; 
  display: flex; 
  flex-direction: column; 
  gap: 5px; 
}
.p-line { min-height: 2px; } 

.hotspots-container {
  position: absolute; 
  top: 0%;           
  left: 0;            
  width: 100%;        
  height: 100%;        
}

.hotspot { 
  position: absolute; 
  left: 34.65%; 
  transform: translateX(-50%); 
  width: 67%; 
  height: 40px; 
  display: flex; 
  align-items: center; 
  justify-content: center; 
  cursor: pointer; 
}

.row-1 { top: 25.2%; } 
.row-2 { top: 33.7%; }
.row-3 { top: 45.1%; } 
.row-4 { top: 56.4%; } 
.row-5 { top: 65%; } 


.btn-finish { position: absolute; bottom: 8.78%; left: 48.8%; transform: translateX(-50%); width: 288px; height: 60px; }
.toggle-btn { position: absolute; bottom: 5%; left: 5%; font-size: 18px; opacity: 0.7; cursor: pointer; }
.slot-text { position: relative; z-index: 2; left: 23%; font-size: 18px; color: #bbb; }

.sub-window { 
  position: absolute; 
  top: 0; 
  left: 0; 
  z-index: 10; 
} 
.sub-title { position: absolute; top: 4.5%; width: 100%; text-align: center; font-size: 20px; color: #bbb; }
.list-scroll-area { 
  position: absolute; 
  top: 16%; 
  left: 10%; /* 调整 list-scroll-area 的起始位置 */
  width: 80%; /* 调整 list-scroll-area 的总宽度，以便容纳左右两栏 */
  height: 80%; 
  overflow: hidden; 
  pointer-events: none; /* list-scroll-area 本身不接收事件 */
}

.list-row { position: relative; height: 26.3px; margin: 5px 0; display: flex; align-items: center; justify-content: center; cursor: pointer; pointer-events: auto; }
.row-text { position: relative; z-index: 2; font-size: 16px; }

.glow-bar, .glow-btn, .row-hover-bg { position: absolute; top: 0; left: 0; width: 100%; height: 100%; object-fit: fill; pointer-events: none; mix-blend-mode: screen; transition: opacity 0.2s ease; }

/* 默认情况下，所有光条都隐藏 */
.active-bar, .hover-bar { opacity: 0; }

/* 简单列表：选中项常亮 */
.list-row.active .active-bar { opacity: 1; } 
.list-row:hover .hover-bar { opacity: 1; }


.col-left { 
  position: absolute; 
  top: 0;
  left: 1%; 
  width: 40%; 
  height: 100%; 
  pointer-events: auto; 
}

.col-right { 
  position: absolute; 
  top: 0;
  left: 55.4%; 
  width: 40%; 
  height: 100%; 
  pointer-events: auto; 
}

.list-row.small { font-size: 14px; }

/* 左栏光条控制 */
.col-left .list-row .active-bar { opacity: 0; } 
.col-left .list-row.active .active-bar { opacity: 1; } 

/* 左栏 hover 光条 */
.col-left .list-row .hover-bar { opacity: 0; } /* 默认隐藏 */
.col-left .list-row.hovered .hover-bar { opacity: 1; } /* 只有当 `hoveredCategory === key` 时显示 */

/* 右栏光条控制 */
.col-right .list-row .active-bar { opacity: 0; } 
.col-right .list-row.active .active-bar { opacity: 1; } 

/* 右栏 hover 光条 */
.col-right .list-row .hover-bar { opacity: 0; } /* 默认隐藏 */
.col-right .list-row:hover .hover-bar { opacity: 1; } /* 鼠标悬停右栏时显示 */
</style>
