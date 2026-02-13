import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      lib: {
        entry: 'electron/main.js'
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      lib: {
        entry: 'electron/preload.cjs'
      }
    }
  },
  renderer: {
    root: '.', 
    build: {
      rollupOptions: {
        input: 'index.html'
      }
    },
    resolve: {
      alias: {
        '@renderer': resolve('src')
      }
    },
    plugins: [vue()]
  }
})