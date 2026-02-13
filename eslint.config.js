import js from '@eslint/js';
import pluginVue from 'eslint-plugin-vue';
import eslintConfigPrettier from 'eslint-config-prettier';

export default [
  {
    ignores: ['dist/*', 'dist-electron/*', 'release/*', '*.sql', 'out/*'],
  },
  js.configs.recommended,
  ...pluginVue.configs['flat/recommended'],
  eslintConfigPrettier,
  {
    rules: {
      'vue/multi-word-component-names': 'off',
      'no-unused-vars': 'warn',
      'no-undef': 'off', // 这是一个 JS 项目，可能会有很多全局变量或未定义的引用，先关掉以免报错太多
    },
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        window: 'readonly',
        document: 'readonly',
        console: 'readonly',
        process: 'readonly',
        module: 'readonly',
        require: 'readonly',
        __dirname: 'readonly',
      },
    },
  },
];
