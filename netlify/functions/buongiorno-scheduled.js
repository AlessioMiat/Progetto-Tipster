// Buongiorno via Netlify Scheduled Functions (15/07/2026) — sostituisce lo
// scheduling con GitHub Actions dopo aver verificato che quest'ultimo, sotto
// carico, non solo ritarda ma sembra proprio SCARTARE la maggior parte dei
// trigger schedulati (9 tentativi su 10 non sono mai partiti il 15/07).
// Netlify gestisce le funzioni schedulate sulla propria infrastruttura,
// indipendente dallo scheduler condiviso di GitHub Actions.
//
// Gira ogni 15 minuti tra le 06:00 e le 07:45 UTC (08:00-09:45 CEST): il
// primo tentativo che trova lo stato "non ancora inviato oggi" manda il
// buongiorno (privato, poi 30-60s dopo il pubblico) e segna lo stato via
// GitHub Contents API — stesso file (automazioni/buongiorno-stato.json) del
// vecchio meccanismo GitHub Actions, quindi i due possono coesistere senza
// rischio di doppio invio finche' non rimuoviamo quello vecchio.
// NOTA: quando l'Italia passa a CET (ultima domenica di ottobre), spostare
// lo schedule di un'ora avanti: "*/15 7-8 * * *".
const { schedule } = require("@netlify/functions");
const { leggiFileJson, scriviFileJson } = require("./lib/github-files");
const { chiamaApi } = require("./lib/telegram");
const listaPrivato = require("../../automazioni/buongiorno-privato.json");
const listaPubblico = require("../../automazioni/buongiorno-pubblico.json");

const STATO_PATH = "automazioni/buongiorno-stato.json";

function scegli(lista) {
  return lista[Math.floor(Math.random() * lista.length)];
}

function invia(chatId, scelto) {
  return scelto.type === "sticker"
    ? chiamaApi("sendSticker", { chat_id: chatId, sticker: scelto.file_id })
    : chiamaApi("sendMessage", { chat_id: chatId, text: scelto.text });
}

function aspetta(ms) {
  return new Promise(r => setTimeout(r, ms));
}

exports.handler = schedule("*/15 6-7 * * *", async () => {
  const oggi = new Date().toISOString().slice(0, 10);
  const { data: stato, sha } = await leggiFileJson(STATO_PATH);

  if (stato.data === oggi) {
    console.log("Buongiorno gia' inviato oggi — non faccio nulla.");
    return { statusCode: 200 };
  }

  const rispPrivato = await invia(process.env.TELEGRAM_CHAT_ID_PRIVATO, scegli(listaPrivato));
  console.log("Privato:", JSON.stringify(rispPrivato));

  if (process.env.TELEGRAM_CHAT_ID_PUBBLICO) {
    const ritardoSec = 30 + Math.floor(Math.random() * 30);
    await aspetta(ritardoSec * 1000);
    const rispPubblico = await invia(process.env.TELEGRAM_CHAT_ID_PUBBLICO, scegli(listaPubblico));
    console.log("Pubblico:", JSON.stringify(rispPubblico));
  }

  await scriviFileJson(STATO_PATH, { data: oggi }, sha, `bot: buongiorno inviato ${oggi} (Netlify scheduled)`);
  return { statusCode: 200 };
});
