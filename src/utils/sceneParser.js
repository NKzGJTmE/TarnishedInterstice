// src/utils/sceneParser.js

// 使用 FNV-1a 算法，返回 8位 16进制字符串 (例如: "a1b2c3d4")
const hashString = (str) => {
  if (!str) return '00000000';
  
  // FNV-1a 32-bit constants
  let hash = 0x811c9dc5; 
  const prime = 0x01000193;

  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, prime); // 使用 Math.imul 模拟 C 语言的 32位整数乘法
  }

  // 转换为无符号整数并转 16 进制
  return (hash >>> 0).toString(16).padStart(8, '0');
};

// 常见浏览器列表 (包括主流、隐私、国产、游戏浏览器等)
const BROWSER_LIST = [
  // Chromium Based
  'chrome', 'google chrome', 'msedge', 'microsoft edge', 'chromium', 
  'brave', 'vivaldi', 'opera', 'opera gx', 'arc', 'thorium', 'iron',
  'epic', 'cent', 'sleipnir', 'yandex', 'coccoc',
  
  // Firefox Based
  'firefox', 'waterfox', 'librewolf', 'palemoon', 'seamonkey', 
  'floorp', 'zen', 'icecat', 'basilisk', 'tor browser',
  
  // macOS / Safari
  'safari', 'webkit', 'orion',
  
  // Mobile / Others
  'ucbrowser', 'qqbrowser', 'maxthon', '360se', '360chrome', 
  'metamask', 'sogouexplorer', 'liebao', 'theworld', '2345explorer',
  'min', 'qutebrowser', 'epiphany', 'konqueror'
];

// Remove invisible Unicode chars that often appear in window titles (e.g. Microsoft​ Edge).
const stripInvisibleChars = (s) =>
  (s || '').replace(/[\u200B-\u200D\uFEFF\u2060]/g, '');

const BROWSER_SUFFIX_PATTERNS = [
  // Browser brand suffix
  /\s*[-–—|]\s*(?:Google\s*Chrome|Microsoft\s*Edge|Mozilla\s*Firefox|Brave|Vivaldi|Opera(?:\s*GX)?|Tor\s*Browser|Chromium|Edge|Safari|Internet\s*Explorer)\s*$/i,
  // Profile + browser suffix (e.g. " - 个人 - Microsoft Edge", " - Person 1 - Google Chrome")
  /\s*[-–—|]\s*(?:个人|Person(?:\s+\d+)?|Profile(?:\s+\d+)?|Default)\s*[-–—|]\s*(?:Google\s*Chrome|Microsoft\s*Edge)\s*$/i,
  // Profile only suffix that may remain after one stripping pass
  /\s*[-–—|]\s*(?:个人|Person(?:\s+\d+)?|Profile(?:\s+\d+)?|Default)\s*$/i,
  // Multi-tab suffix
  /\s*(?:[-–—|]\s*)?(?:and|和另外)\s*\d+\s*(?:other\s*pages|个页面)\s*$/i
];

const sanitizeBrowserTitle = (rawTitle) => {
  let cleanTitle = stripInvisibleChars(rawTitle)
    .replace(/^[([ ]\d+[)\]]\s*/, '')
    .trim();

  // Iteratively strip stacked suffixes until title becomes stable.
  let changed = true;
  while (changed && cleanTitle) {
    changed = false;
    for (const pattern of BROWSER_SUFFIX_PATTERNS) {
      const next = cleanTitle.replace(pattern, '').trim();
      if (next !== cleanTitle) {
        cleanTitle = next;
        changed = true;
      }
    }
  }

  return cleanTitle;
};

/**
 * 解析窗口信息
 * @returns { appName: string, exactHash: string, isBrowser: boolean }
 */
export function parseSceneRequest(winInfo) {
  if (!winInfo || !winInfo.owner || !winInfo.owner.name) {
    return { appName: 'Desktop', exactHash: '', isBrowser: false };
  }

  const rawProcessName = winInfo.owner.name;
  const rawTitle = winInfo.title || '';

  // === 1. 取进程名，去后缀 ===
  let appName = rawProcessName
    .replace(/\s*\(\d+\)$/, '')       // 去除结尾的 (2), (99)
    .trim();
  
  // 统一小写用于判断是否浏览器
  const lowerAppName = appName.toLowerCase();

  // === 2. 判断是否为浏览器 ===
  const isBrowser = BROWSER_LIST.some(browser => lowerAppName.includes(browser));

  let exactHash = '';

  // === 3. 如果是浏览器，处理 Title 并 Hash ===
  let cleanTitle = ''; // 声明在外部以便返回
  if (isBrowser) {
    cleanTitle = sanitizeBrowserTitle(rawTitle);
    
    if (cleanTitle) {
      exactHash = hashString(cleanTitle);
    }
  } 

  return {
    appName,     
    exactHash,   
    isBrowser,  
    cleanTitle  
  };
}
