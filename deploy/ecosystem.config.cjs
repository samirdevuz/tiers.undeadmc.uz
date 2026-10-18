// Faqat o'z VPS ingiz uchun (mcweb.uz da kerak emas — platforma ilovani o'zi ishga tushiradi).
// pm2 sozlamasi. Ishga tushirish (loyiha papkasida):
//   pm2 start deploy/ecosystem.config.cjs
//   pm2 save
//
// Bitta jarayon: SQLite, xotiradagi kesh va so'rov cheklovi shunga mo'ljallangan.
const path = require('path');

module.exports = {
  apps: [
    {
      name: 'undeadmc-tiers',
      cwd: path.resolve(__dirname, '..'),
      script: 'server.js',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        // VPS da faqat nginx orqali ochiq bo'lsin.
        HOST: '127.0.0.1'
      },
      max_memory_restart: '300M',
      time: true
    }
  ]
};
