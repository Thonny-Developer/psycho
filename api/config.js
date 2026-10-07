// Публичные настройки для браузера. Anon key Supabase публичный по замыслу:
// доступ к данным ограничивают политики Row Level Security, а не секретность ключа.

import { supabaseConfig } from './_lib/auth.js';

export default function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Метод не поддерживается' });
  }
  const config = supabaseConfig();
  res.setHeader('Cache-Control', 'public, max-age=300');
  return res.status(200).json(config
    ? { accounts: true, supabaseUrl: config.url, supabaseAnonKey: config.anonKey }
    : { accounts: false });
}
