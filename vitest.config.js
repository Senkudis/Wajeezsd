import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    testTimeout: 30000,
    // اقصر الفحص على مجلد tests/ فقط — تجاهل الأرشيف وملفات node_modules
    include: ['tests/**/*.test.js'],
    exclude: ['node_modules/**', 'scripts/**', 'android/**'],
  },
});
