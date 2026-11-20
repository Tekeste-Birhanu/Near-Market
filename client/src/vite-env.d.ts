/// <reference types="vite/client" />

interface Window {
  Telegram?: {
    WebApp?: {
      initData?: string;
    };
  };
}

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
}
