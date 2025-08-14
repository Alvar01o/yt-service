import express from 'express';
import fs from 'fs';
import crypto from 'crypto';
import sqlite3Module from 'sqlite3';
import ytdl from 'ytdl-core';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import path from 'path';
import { Innertube } from 'youtubei.js';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// SQLite verbose
const sqlite3 = sqlite3Module.verbose();

// Inicialización
const app = express();
const PORT = process.env.PORT || 3003;
ffmpeg.setFfmpegPath(ffmpegInstaller.path);
const ytInstance = await Innertube.create();

// se descargan desde http://localhost:3003/songs/__%202025%20_%20B%20L%20U%20E%20B%20E%20R%20R%20Y%20_%20Synthwave%20_%20Dreamwave%20__.mp3

// formato : {"message":"Ya estaba descargado.","file":"resource/__ 2025 _ B L U E B E R R Y _ Synthwave _ Dreamwave __.mp3","title":"💙 2025 | B L U E B E R R Y | Synthwave + Dreamwave 💜","hash":"4cfc2f047f6623674d8920a9e308c520"}
// Permite interpretar datos en formato JSON desde el body de las peticiones
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
      created_at TEXT
    )
  `);
});

// Utilidad para generar hash MD5
function getHash(url) {
  return crypto.createHash('md5').update(url).digest('hex');
}

// Ruta principal
app.get('/', (req, res) => {
  res.send('🎵 API para descargar canciones de YouTube en MP3');
});


/**
 * POST /api/downloadmp3
 * Recibe en el body un JSON con el campo "youtubeUrl".
 * Descarga el audio del video en formato MP3 a la carpeta ./resource/
 * {
 * "youtubeUrl": "https://www.youtube.com/watch?v=XXXXXXXXXXX"
 * }
 */
// Endpoint para convertir YouTube a MP3 con logs de auditoría, progreso y metadatos
app.post('/api/downloadmp3', async (req, res) => {
  const { youtubeUrl } = req.body;

  if (!youtubeUrl || !ytdl.validateURL(youtubeUrl)) {
    return res.status(400).json({ error: 'URL inválida o faltante.' });
  }

  const id = getHash(youtubeUrl);
  const clientIp = req.ip;
  const requestTime = new Date().toISOString();

  // Verificar si ya fue descargado
  db.get('SELECT * FROM songs WHERE id = ?', [id], async (err, row) => {
    if (err) {
      console.error('[DB ERROR]', err);
      return res.status(500).json({ error: 'Error al acceder a la base de datos.' });
    }

    if (row) {
      console.log(`[INFO] Ya descargado previamente: ${row.title}`);
      return res.json({
        message: 'Ya estaba descargado.',
        file: row.file_path,
        title: row.title,
        hash: id,
      });
    }

    try {
      const agent = ytdl.createAgent(JSON.parse(fs.readFileSync("cookies.json")));
      const info = await ytdl.getInfo(youtubeUrl, { agent });
      const videoTitle = info.videoDetails.title || 'video_sin_titulo';
      const sanitizedTitle = videoTitle.replace(/[^\w\s.-]/gi, '_');
      const outputFileName = `${sanitizedTitle}.mp3`;
      const outputDir = './resource/';
      const outputPath = path.join(outputDir, outputFileName);

      // Crear carpeta si no existe
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      const videoStream = ytdl(youtubeUrl, { filter: 'audioonly' });

      await new Promise((resolve, reject) => {
        ffmpeg(videoStream)
          .outputOptions(['-metadata', `title=${videoTitle}`])
          .audioCodec('libmp3lame')
          .audioBitrate(128)
          .save(outputPath)
          .on('end', () => {
            console.log(`[INFO] Conversión completada: ${outputPath}`);
            resolve();
          })
          .on('error', (err) => {
            console.error('[FFMPEG ERROR]', err);
            reject(err);
          });
      });

      const createdAt = new Date().toISOString();

      db.run(
        'INSERT INTO songs (id, title, file_path, created_at) VALUES (?, ?, ?, ?)',
        [id, videoTitle, outputPath, createdAt],
        (dbErr) => {
          if (dbErr) {
            console.error('[DB INSERT ERROR]', dbErr);
            return res.status(500).json({ error: 'Error al guardar en la base de datos.' });
          }

          return res.json({
            message: 'Descarga y conversión exitosas.',
            file: outputPath,
            title: videoTitle,
            hash: id,
            audit: { clientIp, requestTime, youtubeUrl },
          });
        }
      );

    } catch (error) {
      console.error('[ERROR GENERAL]', error);
      return res.status(500).json({ error: 'Ocurrió un error en la descarga.' });
    }
  });
});

app.post('/api/downloadmp3_2', async (req, res) => {
  const { youtubeUrl } = req.body;

  if (!youtubeUrl || typeof youtubeUrl !== 'string') {
    return res.status(400).json({ error: 'URL inválida o faltante.' });
  }

  const videoIdMatch = youtubeUrl.match(/(?:v=|\/)([0-9A-Za-z_-]{11})/);
  if (!videoIdMatch) {
    return res.status(400).json({ error: 'No se pudo extraer el ID del video de la URL.' });
  }

  const videoId = videoIdMatch[1];
  const id = getHash(youtubeUrl);
  const clientIp = req.ip;
  const requestTime = new Date().toISOString();

  db.get('SELECT * FROM songs WHERE id = ?', [id], async (err, row) => {
    if (err) {
      console.error('[DB ERROR]', err);
      return res.status(500).json({ error: 'Error al acceder a la base de datos.' });
    }

    if (row) {
      console.log(`[INFO] Ya descargado previamente (youtubei.js): ${row.title}`);
      return res.json({
        message: 'Ya estaba descargado.',
        file: row.file_path,
        title: row.title,
        hash: id,
      });
    }

    try {
      const info = await ytInstance.getInfo(videoId);
      const videoTitle = info.basic_info?.title || 'video_sin_titulo';
      console.log(`[INFO] Título del video: ${videoTitle}`);
      console.log('info.streamingData', info.streaming_data);
      const streamingData = info.streaming_data;
      const audioFormats = streamingData.adaptive_formats.filter(format => format.mime_type.startsWith('audio/'));
      let audioStreamUrl = undefined;
      console.log('audioFormats', audioFormats);
      if (audioFormats.length > 0) {
          audioStreamUrl = audioFormats[0].url; // Select the first available audio format or apply further filtering
          console.log('Audio Stream URL:', audioStreamUrl);
      } else {
          console.log('No audio stream found.');
      }
      const audioFormat = audioStreamUrl ? { url: audioStreamUrl } : null;
      if (!audioFormat || !audioFormat.url) {
        console.log('[ERROR] No se encontró un stream de audio disponible.', audioFormat);
        return res.status(500).json({ error: 'No se encontró un stream de audio disponible.' });
      }

      const sanitizedTitle = videoTitle.replace(/[^\w\s.-]/gi, '_');
      const metaTitle = videoTitle
        .replace(/[\r\n]/g, ' ')     // no newlines
        .replace(/[=:]/g, '-')       // ':' y '=' causan problemas
        .replace(/["']/g, '')        // comillas fuera
        .trim();      
      const outputFileName = `${sanitizedTitle}.mp3`;
      const outputDir = './resource/';
      const outputPath = path.join(outputDir, outputFileName);

      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      await new Promise((resolve, reject) => {
        ffmpeg(audioFormat.url)
          .outputOptions(['-metadata', `title=${metaTitle}`])
          .audioCodec('libmp3lame')
          .audioBitrate(128)
          .save(outputPath)
          .on('end', () => {
            console.log(`[INFO] Conversión completada con youtubei.js: ${outputPath}`);
            resolve();
          })
          .on('error', (err) => {
            console.error('[FFMPEG ERROR]', err);
            reject(err);
          });
      });

      const createdAt = new Date().toISOString();

      db.run(
        'INSERT INTO songs (id, title, file_path, created_at) VALUES (?, ?, ?, ?)',
        [id, videoTitle, outputPath, createdAt],
        (dbErr) => {
          if (dbErr) {
            console.error('[DB INSERT ERROR]', dbErr);
            return res.status(500).json({ error: 'Error al guardar en la base de datos.' });
          }

          return res.json({
            message: 'Descarga y conversión exitosas (youtubei.js).',
            file: outputPath,
            title: videoTitle,
            hash: id,
            audit: { clientIp, requestTime, youtubeUrl },
          });
        }
      );

    } catch (error) {
      console.error('[ERROR GENERAL - youtubei.js]', error);
      return res.status(500).json({ error: 'Ocurrió un error en la descarga con youtubei.js.' });
    }
  });
});

// Ejemplo de ruta para obtener todos los recursos
app.get('/api/recursos', (req, res) => {
  db.all('SELECT * FROM songs ORDER BY created_at DESC', [], (err, rows) => {
    if (err) {
      console.error('[DB ERROR]', err);
      return res.status(500).json({ error: 'Error al consultar las canciones.' });
    }

    // Opcional: agregar campo con URL pública si tenés habilitado app.use('/songs'...)
    const canciones = rows.map(row => ({
      id: row.id,
      title: row.title,
      file_path: row.file_path,
      file_url: `http://localhost:${PORT}/songs/${encodeURIComponent(path.basename(row.file_path))}`,
      created_at: row.created_at,
    }));

    res.json(canciones);
  });
});


// Ejemplo de ruta para eliminar un recurso (DELETE)
app.delete('/api/recursos/:id', (req, res) => {
  const { id } = req.params;
  // Lógica para eliminar el recurso con el id correspondiente

  res.json({
    mensaje: `Recurso con id ${id} eliminado`,
  });
});

// Levantar el servidor
const server = app.listen(PORT, () => {
  console.log(`✅ Servidor escuchando en el puerto ${PORT}`);
});

server.on('error', (err) => {
  console.error('❌ Ocurrió un error en el servidor:', err);
}); 

