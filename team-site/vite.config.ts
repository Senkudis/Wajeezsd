import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * البناء يذهب مباشرةً إلى public_html/team ليخدمه السيرفر الرئيسي — لا نسخ يدوي
 * ولا خطوة نشر منفصلة.
 *
 * assetsDir = 'team-assets' لا 'assets' لأن نفس الملفات تُخدَم من مسارين:
 * جذر team.wajeezsd.com و wajeezsd.com/team. مسار مطلق واحد (/team-assets/…)
 * يعمل في الحالتين، بينما 'assets' يصطدم بمجلد public_html/assets القائم.
 */
export default defineConfig({
  plugins: [react()],
  base: '/',
  build: {
    outDir: '../public_html/team',
    emptyOutDir: true,
    assetsDir: 'team-assets',
    sourcemap: false
  },
  server: {
    port: 5174,
    proxy: {
      '/api': 'http://localhost:3000',
      '/uploads': 'http://localhost:3000'
    }
  }
});
