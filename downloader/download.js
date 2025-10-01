#!/usr/bin/env node
import axios from 'axios';
import { Innertube } from 'youtubei.js';

const API_URL = 'http://localhost:3003/api/downloadmp3';

// Usa el UA real de tu máquina (según tu metadata estás en Chrome 139 en Linux)
const CHROME_UA =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36';

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

function sendPost(youtubeUrl) {
  console.log(`➡️  Enviando: ${youtubeUrl}`);
  return axios.post(API_URL, { youtubeUrl }, {
    headers: { 'Content-Type': 'application/json' },
    maxRedirects: 5,
  });
}

function processSequential(urls, gapMs) {
  return urls.reduce((chain, url, idx) =>
    chain.then(() =>
      sendPost(url)
        .then((res) => console.log(`✅ OK (${idx + 1}/${urls.length}) -> Status ${res.status}`))
        .catch((err) => {
          const msg = err?.response?.data || err?.message || 'Error desconocido';
          console.error(`❌ Error (${idx + 1}/${urls.length}) ->`, msg);
        })
        .finally(() => {
          if (gapMs > 0 && idx < urls.length - 1) return delay(gapMs);
        })
    ), Promise.resolve());
}

// --- helpers para detectar tipo ---
const isRegularPlaylist = (url) =>
  typeof url === 'string' && url.includes('list=') && !url.includes('RDAMVM') && !url.includes('RD');
const isMix = (url) =>
  typeof url === 'string' && url.includes('RDAMVM');
const isRadio = (url) =>
  typeof url === 'string' && url.includes('RD') && !url.includes('RDAMVM');

// --------- main ---------
if (process.argv.length < 3) {
  console.error('Uso: node download.js <URL> [DELAY_MS]');
  process.exit(1);
}
const inputUrl = process.argv[2].trim();
const gapMs = Number.isFinite(Number(process.argv[3])) ? Number(process.argv[3]) : 0;

console.log(`🌐 URL: ${inputUrl}`);

// ⚙️ Configurar YouTube.js para “parecer” Chrome en escritorio
const yt = await Innertube.create({
  lang: 'es',
  location: 'PY',
  user_agent: CHROME_UA,
  device_category: 'DESKTOP',
  client_type: 'WEB',
  // Opcional: cookie: process.env.YT_COOKIE
});

if (!inputUrl.includes('list=')) {
  // Es un solo video
  await processSequential([inputUrl], gapMs);
  console.log('🎉 Finalizado.');
} else if (isRegularPlaylist(inputUrl)) {
  console.log(`📜 Detectada playlist normal`);
  const playlist = await yt.getPlaylist(inputUrl);
  const videos = playlist.videos
    .map(v => v.short_url || (v.id ? `https://www.youtube.com/watch?v=${v.id}` : null))
    .filter(Boolean);
  console.log(`🔎 Se encontraron ${videos.length} videos. Envío secuencial...`);
  await processSequential(videos, gapMs);
  console.log('🎉 Finalizado.');
} else if (isMix(inputUrl) || isRadio(inputUrl)) {
  console.log(`📻 Detectado ${isMix(inputUrl) ? 'MIX' : 'RADIO'}`);
  const watch = await yt.getInfo(inputUrl);
  const mixItems = watch?.watch_next_feed || [];
  const videos = mixItems
    .map(v => v.short_url || (v.id ? `https://www.youtube.com/watch?v=${v.id}` : null))
    .filter(Boolean);
  console.log(`🔎 Se encontraron ${videos.length} videos. Envío secuencial...`);
  await processSequential(videos, gapMs);
  console.log('🎉 Finalizado.');
}
