export const languageOptions = [
  { value: 'en', label: 'English' },
  { value: 'ko', label: '한국어' },
  { value: 'ja', label: '日本語' },
  { value: 'zh', label: '中文' }
];

const messages = {
  en: {
    setupTitle: 'Local Process setup',
    settingsTitle: 'Local Process settings',
    language: 'Language',
    autoStart: 'Start automatically at login',
    autoUpdate: 'Check and install updates automatically',
    refreshInterval: 'Refresh interval',
    showAiStatus: 'Show local AI CLI status in GUI',
    openBrowserOnStart: 'Open browser when server starts',
    back: 'Back',
    save: 'Save and continue',
    quit: 'Quit',
    yes: 'Yes',
    no: 'No',
    enabled: 'Enabled',
    disabled: 'Disabled',
    serverReady: 'Local Process is running',
    aiTools: 'AI tools shown in GUI'
  },
  ko: {
    setupTitle: 'Local Process 초기 설정',
    settingsTitle: 'Local Process 설정',
    language: '언어',
    autoStart: 'PC 부팅/로그인 시 자동 시작',
    autoUpdate: '업데이트 자동 확인 및 설치',
    refreshInterval: '새로고침 주기',
    showAiStatus: 'GUI에 로컬 AI CLI 상태 표시',
    openBrowserOnStart: '서버 시작 시 브라우저 열기',
    back: '뒤로',
    save: '저장하고 계속',
    quit: '종료',
    yes: '예',
    no: '아니오',
    enabled: '켜짐',
    disabled: '꺼짐',
    serverReady: 'Local Process 실행 중',
    aiTools: 'GUI에 표시할 AI 도구'
  },
  ja: {
    setupTitle: 'Local Process 初期設定',
    settingsTitle: 'Local Process 設定',
    language: '言語',
    autoStart: 'ログイン時に自動起動',
    autoUpdate: 'アップデートを自動確認してインストール',
    refreshInterval: '更新間隔',
    showAiStatus: 'GUIにローカルAI CLI状態を表示',
    openBrowserOnStart: 'サーバー起動時にブラウザーを開く',
    back: '戻る',
    save: '保存して続行',
    quit: '終了',
    yes: 'はい',
    no: 'いいえ',
    enabled: '有効',
    disabled: '無効',
    serverReady: 'Local Process 実行中',
    aiTools: 'GUIに表示するAIツール'
  },
  zh: {
    setupTitle: 'Local Process 初始设置',
    settingsTitle: 'Local Process 设置',
    language: '语言',
    autoStart: '登录时自动启动',
    autoUpdate: '自动检查并安装更新',
    refreshInterval: '刷新间隔',
    showAiStatus: '在GUI显示本地AI CLI状态',
    openBrowserOnStart: '服务器启动时打开浏览器',
    back: '返回',
    save: '保存并继续',
    quit: '退出',
    yes: '是',
    no: '否',
    enabled: '开启',
    disabled: '关闭',
    serverReady: 'Local Process 正在运行',
    aiTools: '在GUI显示的AI工具'
  }
};

export function t(language, key) {
  return messages[language]?.[key] || messages.en[key] || key;
}
