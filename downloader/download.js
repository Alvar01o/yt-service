#!/usr/bin/env node
/**
 * Uso:
 *   node download.js <URL> [DELAY_MS]
 *
 * Requiere:
 *   npm install axios ytpl
 *
 * Comportamiento:
 * - Detecta si la URL es playlist (contiene "list=").
 * - Si NO es playlist: envía un POST con esa URL.
 * - Si ES playlist: obtiene todos los videos y envía los POST secuencialmente.
 * - El control de secuencia se hace con Promesas: cada petición dispara la siguiente
 *   al resolverse/rechazarse mediante then/catch/finally.
 */

const axios = require("axios");
const ytpl = require("ytpl");

const API_URL = "http://localhost:3003/api/downloadmp3";

// --------- Utilidades ---------
function isPlaylistUrl(url) {
  return typeof url === "string" && url.includes("list=");
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sendPost(youtubeUrl) {
  // Devuelve una Promise de axios
  console.log(`➡️  Enviando: ${youtubeUrl}`);
  return axios.post(
    API_URL,
    { youtubeUrl },
    { headers: { "Content-Type": "application/json" } }
  );
}

// Encadena las URLs secuencialmente usando reduce y Promesas
function processSequential(urls, gapMs) {
  return urls.reduce((chain, url, idx) => {
    return chain
      .then(() => {
        // “evento” de inicio implícito: comienza la promesa de envío
        return sendPost(url)
          .then((res) => {
            // “evento” then: éxito de la promesa actual
            console.log(`✅ OK (${idx + 1}/${urls.length}) -> Status ${res.status}`);
          })
          .catch((err) => {
            // “evento” catch: error de la promesa actual (no corta la cadena)
            const msg = err?.response?.data || err?.message || "Error desconocido";
            console.error(`❌ Error (${idx + 1}/${urls.length}) ->`, msg);
          })
          .finally(() => {
            // “evento” finally: se ejecuta siempre; aquí controlamos el pacing
            if (gapMs > 0 && idx < urls.length - 1) {
              return delay(gapMs);
            }
          });
      });
  }, Promise.resolve());
}

// --------- Entrada / Flujo principal ---------
if (process.argv.length < 3) {
  console.error("Uso: node download.js <URL> [DELAY_MS]");
  process.exit(1);
}

const inputUrl = process.argv[2];
const gapMs = Number.isFinite(Number(process.argv[3])) ? Number(process.argv[3]) : 0;
console.log(`🌐 URL: ${inputUrl}`);
if (!isPlaylistUrl(inputUrl)) {
  // Caso video único (secuencial trivial: una promesa)
  processSequential([inputUrl], gapMs)
    .then(() => console.log("🎉 Finalizado."))
    .catch(() => process.exit(1));
} else {
  // Caso playlist: obtener videos y encadenar
  console.log(`📜 Detectada playlist: ${inputUrl}`);
  ytpl(inputUrl, { limit: Infinity })
    .then((playlist) => {
//      console.log(playlist);
      const videos = (playlist.items || []).map((it) => it.shortUrl).filter(Boolean);
      console.log(`🔎 Se encontraron ${videos.length} videos. Envío secuencial...`);
      return processSequential(videos, gapMs);
    })
    .then(() => console.log("🎉 Finalizado."))
    .catch((err) => {
      console.error("No se pudo procesar la playlist:", err?.message || err);
      process.exit(1);
    });
}
