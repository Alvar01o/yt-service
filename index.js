import express from 'express';
import fs from 'fs';
import crypto from 'crypto';
import sqlite3Module from 'sqlite3';
import ytdl from 'ytdl-core';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename);

// SQLite verbose
const sqlite3 = sqlite3Module.verbose();

// Inicialización
const app = express();
const PORT = process.env.PORT || 3003;
ffmpeg.setFfmpegPath(ffmpegInstaller.path);

app.use(express.json());
app.use('/songs', express.static(path.join(__dirname, 'resource')));

// Inicializar base de datos SQLite
const db = new sqlite3.Database('./songs.db');
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS songs (
      id TEXT PRIMARY KEY,
      title TEXT,
      file_path TEXT,
      file_url TEXT,
      created_at TEXT
    )
  `);
});

// Utilidad para generar hash MD5
function getHash(url) {
  return crypto.createHash('md5').update(url).digest('hex');
}

// Función reutilizable para descargar y guardar en DB
async function downloadAndSave(youtubeUrl, id) {
  const UA =
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123 Safari/537.36';

  let cookies = undefined;
  try {
    if (fs.existsSync('cookies.json')) {
      cookies = JSON.parse(fs.readFileSync('cookies.json', 'utf8'));
    }
  } catch (e) {
    console.warn('[WARN] No se pudieron leer cookies.json:', e.message);
  }

  const agent = ytdl.createAgent(cookies, {
    headers: { 'user-agent': UA },
    maxRedirects: 5,
  });

  const info = await ytdl.getInfo(youtubeUrl, { agent });
  const videoTitle = info.videoDetails.title || 'video_sin_titulo';
  const sanitizedTitle = videoTitle.replace(/[^\w\s.-]/gi, '_');
  const outputDir = './resource/';
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
  const outputPath = path.join(outputDir, `${sanitizedTitle}.mp3`);

  const videoStream = ytdl(youtubeUrl, {
    agent,
    filter: 'audioonly',
    quality: 'highestaudio',
    requestOptions: {
      maxRedirects: 5,
      headers: { 'user-agent': UA },
    },
    highWaterMark: 1 << 25,
  });

  await new Promise((resolve, reject) => {
    ffmpeg(videoStream)
      .outputOptions(['-metadata', `title=${videoTitle}`])
      .audioCodec('libmp3lame')
      .audioBitrate(128)
      .save(outputPath)
      .on('end', resolve)
      .on('error', reject);
  });

  const createdAt = new Date().toISOString();
  const fileUrl = `http://localhost:${PORT}/songs/${encodeURIComponent(path.basename(outputPath))}`;

  await new Promise((resolve, reject) => {
    db.run(
      'INSERT OR REPLACE INTO songs (id, title, file_path, file_url, created_at) VALUES (?, ?, ?, ?, ?)',
      [id, videoTitle, outputPath, fileUrl, createdAt],
      (dbErr) => (dbErr ? reject(dbErr) : resolve())
    );
  });

  return { message: 'Descargado y guardado', file: outputPath, file_url: fileUrl, title: videoTitle, hash: id };
}

// --- Endpoint principal de descarga ---
app.post('/api/downloadmp3', async (req, res) => {
  const { youtubeUrl } = req.body;

  if (!youtubeUrl || !ytdl.validateURL(youtubeUrl)) {
    return res.status(400).json({ error: 'URL inválida o faltante.' });
  }

  const id = getHash(youtubeUrl);

  db.get('SELECT * FROM songs WHERE id = ?', [id], async (err, row) => {
    if (err) return res.status(500).json({ error: 'Error DB' });
    if (row) {
      return res.json({ message: 'Ya estaba descargado.', file: row.file_path, file_url: row.file_url, title: row.title, hash: id });
    }

    try {
      const result = await downloadAndSave(youtubeUrl, id);
      res.json(result);
    } catch (error) {
      console.error('[ERROR DOWNLOAD]', error);
      res.status(500).json({ error: 'Ocurrió un error en la descarga.' });
    }
  });
});

// --- Nuevo endpoint para verificar y re-descargar faltantes ---
app.post('/api/verificar-archivos', async (req, res) => {
  db.all('SELECT * FROM songs', async (err, rows) => {
    if (err) return res.status(500).json({ error: 'Error al consultar DB' });

    const resultados = [];
    for (const row of rows) {
      if (!fs.existsSync(row.file_path)) {
        console.log(`[WARN] Archivo faltante: ${row.title}`);
        try {
          const result = await downloadAndSave(row.id, row.id); // usando id como url no sirve, hay que guardar url
          resultados.push({ ...result, status: 're-descargado' });
        } catch (e) {
          resultados.push({ id: row.id, error: e.message });
        }
      } else {
        resultados.push({ id: row.id, status: 'ok' });
      }
    }
    res.json(resultados);
  });
});

// GET recursos
app.get('/api/recursos', (req, res) => {
  db.all('SELECT * FROM songs ORDER BY created_at DESC', [], (err, rows) => {
    if (err) return res.status(500).json({ error: 'Error DB' });
    res.json(rows);
  });
});

const server = app.listen(PORT, () => {
  console.log(`✅ Servidor escuchando en el puerto ${PORT}`);
});

server.on('error', (err) => {
  console.error('❌ Error en el servidor:', err);
});
