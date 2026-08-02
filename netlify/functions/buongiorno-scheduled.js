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
const ALESSIO_CHAT_ID = 628218072;

// Su Netlify il canale privato e' salvato come TELEGRAM_CHAT_ID (usato dal
// webhook), NON come TELEGRAM_CHAT_ID_PRIVATO (nome usato dai secret di
// GitHub Actions). Il fallback fa funzionare la funzione qualunque nome sia
// impostato. Bug scoperto il 02/08/2026: il buongiorno risultava "inviato"
// ma non arrivava, perche' inviava a un chat_id undefined e falliva in
// silenzio (nessun controllo dell'esito prima di segnare lo stato).
const CHAT_PRIVATO = process.env.TELEGRAM_CHAT_ID_PRIVATO || process.env.TELEGRAM_CHAT_ID;
// Il canale pubblico DennyBet: fallback all'id noto se la env var non e'
// impostata su Netlify (stesso motivo del privato — vedi sopra). L'id di un
// canale non e' un segreto (a differenza del bot token), quindi si puo'
// tenere qui come rete di sicurezza.
const CHAT_PUBBLICO = process.env.TELEGRAM_CHAT_ID_PUBBLICO || "-1002381477114";

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

  // Invia al privato. Se fallisce NON segna lo stato (cosi' il tentativo
  // successivo riprova) e avvisa Alessio, invece di fallire in silenzio.
  const rispPrivato = await invia(CHAT_PRIVATO, scegli(listaPrivato));
  console.log("Privato:", JSON.stringify(rispPrivato));
  if (!rispPrivato.ok) {
    await chiamaApi("sendMessage", {
      chat_id: ALESSIO_CHAT_ID,
      text: `⚠️ Buongiorno NON inviato al canale privato: ${rispPrivato.description || "errore"}. Riprovo al prossimo controllo.`
    }).catch(() => {});
    return { statusCode: 200 };
  }

  if (CHAT_PUBBLICO) {
    const ritardoSec = 30 + Math.floor(Math.random() * 30);
    await aspetta(ritardoSec * 1000);
    const rispPubblico = await invia(CHAT_PUBBLICO, scegli(listaPubblico));
    console.log("Pubblico:", JSON.stringify(rispPubblico));
    if (!rispPubblico.ok) {
      await chiamaApi("sendMessage", {
        chat_id: ALESSIO_CHAT_ID,
        text: `⚠️ Buongiorno inviato al privato ma NON al pubblico: ${rispPubblico.description || "errore"}.`
      }).catch(() => {});
    }
  }

  // Segna "inviato" solo dopo che il privato e' andato a buon fine.
  await scriviFileJson(STATO_PATH, { data: oggi }, sha, `bot: buongiorno inviato ${oggi} (Netlify scheduled)`);
  return { statusCode: 200 };
});
