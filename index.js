const express = require('express');
const app = express();
const PORT = process.env.PORT || 3003;
const fs = require("fs");

// Importar y configurar librerías para descargar/conversión de YouTube
const ytdl = require('ytdl-core');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
ffmpeg.setFfmpegPath(ffmpegPath);


// Permite interpretar datos en formato JSON desde el body de las peticiones
app.use(express.json());

// Ruta de prueba
app.get('/', (req, res) => {
  res.send('¡Hola, mundo! Esta es nuestra API con Node.js y Express.');
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
  try {
    const { youtubeUrl } = req.body;

    // Auditoría: obtener IP y hora de la solicitud
    const clientIp = req.ip;
    const requestTime = new Date().toISOString();

    console.log(`[AUDITORÍA] Solicitud recibida:
      - IP del cliente: ${clientIp}
      - Hora de la solicitud: ${requestTime}
      - URL de YouTube: ${youtubeUrl}
    `);

    // Validar que venga el parámetro youtubeUrl
    if (!youtubeUrl) {
      console.log('[ERROR] Falta el parámetro "youtubeUrl".');
      return res.status(400).json({
        error: 'Falta el parámetro "youtubeUrl" en el cuerpo de la petición.',
      });
    }

    // Verificar que la URL sea válida para YouTube
    if (!ytdl.validateURL(youtubeUrl)) {
      console.log('[ERROR] URL de YouTube no válida.');
      return res.status(400).json({
        error: 'La URL proporcionada no es válida para YouTube.',
      });
    }

    // agent should be created once if you don't want to change your cookie
    const agent = ytdl.createAgent(JSON.parse(fs.readFileSync("cookies.json")));
    // Obtener información del video (para extraer el título y usarlo tanto en el nombre del archivo como en metadatos)
    const info = await ytdl.getInfo(youtubeUrl, {agent});

    const videoTitle = info.videoDetails.title || 'video_sin_titulo';

    // Sanitizar el título para evitar caracteres no válidos en nombre de archivo
    const sanitizedTitle = videoTitle.replace(/[^\w\s.-]/gi, '_');
    // Definir la ruta de salida con el título
    const outputPath = `./resource/${sanitizedTitle}.mp3`;
    const outpath = `/resource/${sanitizedTitle}.mp3`;
    // Preparar ytdl para obtener el stream de audio
    const videoStream = ytdl(youtubeUrl, { filter: 'audioonly' });

    // Array para almacenar los logs de progreso (opcional)
    const progressLogs = [];

    progressLogs.push('download Started');

    // Escuchar evento de progreso de descarga de ytdl-core
    videoStream.on('progress', (chunkLength, downloaded, total) => {
      const percent = ((downloaded / total) * 100).toFixed(2);
      const progressMessage = `Progreso de descarga: ${percent}%`;
      if (percent == 100) {
        progressLogs.push('download complete');
      }
    });

    // Convertir a MP3 usando fluent-ffmpeg con metadatos
    await new Promise((resolve, reject) => {
      ffmpeg(videoStream)
        .outputOptions([
          '-metadata', `title=${videoTitle}`,
        ])
        .audioCodec('libmp3lame')
        .audioBitrate(128) // Ajusta el bitrate de salida según tus necesidades
        .save(outputPath)
        .on('end', () => {
          console.log(`[INFO] Conversión a MP3 finalizada. Archivo: ${outputPath}`);
          resolve();
        })
        .on('error', (err) => {
          console.error('[ERROR] Ocurrió un error en ffmpeg:', err);
          reject(err);
        });
    });

    // Respuesta final
    return res.json({
      message: 'Descarga y conversión completadas con éxito.',
      file: outpath,
      audit: {
        clientIp,
        requestTime,
        youtubeUrl,
      },
      progressLogs, // logs de progreso acumulados (opcional)
    });

  } catch (error) {
    console.error('[ERROR] General:', error);
    return res.status(500).json({
      error: 'Ocurrió un error al procesar la descarga. Revisa la consola para más detalles.',
    });
  }
});


// Ejemplo de ruta para obtener todos los recursos
app.get('/api/recursos', (req, res) => {
  // Aquí podríamos tener una lógica para obtener datos desde una base de datos, por ejemplo.
  // Para este ejemplo, retornamos un arreglo de prueba.
  const recursos = [
    { id: 1, nombre: 'Recurso A' },
    { id: 2, nombre: 'Recurso B' },
    { id: 3, nombre: 'Recurso C' },
  ];
  res.json(recursos);
});

// Ejemplo de ruta para crear un recurso (POST)
app.post('/api/recursos', (req, res) => {
  // Se asume que en el body de la petición se envía un objeto con la info del nuevo recurso
  const nuevoRecurso = req.body;
  // Lógica para guardar el recurso en una base de datos o arreglo en memoria
  
  // Como respuesta, enviamos el objeto creado.
  res.status(201).json({
    mensaje: 'Recurso creado exitosamente',
    recurso: nuevoRecurso,
  });
});

// Ejemplo de ruta para actualizar un recurso (PUT)
app.put('/api/recursos/:id', (req, res) => {
  const { id } = req.params; // Obtenemos id desde la ruta
  const datosActualizados = req.body;
  // Lógica para buscar el recurso por id y actualizarlo

  res.json({
    mensaje: `Recurso con id ${id} actualizado`,
    recurso: { id, ...datosActualizados },
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

