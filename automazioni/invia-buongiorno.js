// Pubblica il buongiorno nel canale privato, poi (30-60 secondi dopo) in
// quello pubblico. L'orario del privato punta a variare ogni giorno a caso
// tra le 08:00 e le 09:30 CEST. Se il canale pubblico non e' ancora
// collegato (manca il secret), lo salta senza errori.
//
// FINESTRA IN UTC (14/07/2026, dopo che le esecuzioni schedulate di GitHub
// sono partite con ~2h12m di ritardo rispetto al cron): la vecchia versione
// aggiungeva SEMPRE uno 0-90 min a caso partendo dal presupposto che il
// workflow fosse gia' scattato puntuale alle 06:07 UTC - se GitHub lo fa
// partire in ritardo (capita, e' un limite noto della piattaforma sotto
// carico), il ritardo si sommava a quello di GitHub invece di tenerne conto,
// facendo uscire l'invio ben oltre le 09:30. Ora lo script guarda l'ora
// reale al momento dell'esecuzione e calcola quanto aspettare per atterrare
// dentro la finestra, qualunque sia stato il ritardo di GitHub - se e' gia'
// oltre la finestra, manda subito invece di aggiungere altro ritardo.
// NOTA: quando l'Italia passa a CET (ultima domenica di ottobre), spostare
// di un'ora: 07:00-08:30 UTC invece di 06:00-07:30 UTC.
const fs = require("fs");
const path = require("path");
const https = require("https");

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_PRIVATO = process.env.TELEGRAM_CHAT_ID_PRIVATO;
const CHAT_PUBBLICO = process.env.TELEGRAM_CHAT_ID_PUBBLICO;
const isTest = process.env.GITHUB_EVENT_NAME === "workflow_dispatch";

const FINESTRA_INIZIO_MIN = 6 * 60; // 06:00 UTC = 08:00 CEST
const FINESTRA_FINE_MIN = 7 * 60 + 30; // 07:30 UTC = 09:30 CEST

function chiamaApi(metodo, corpo) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(corpo);
    const req = https.request(
      {
        hostname: "api.telegram.org",
        path: `/bot${TOKEN}/${metodo}`,
        method: "POST",
        headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data) }
      },
      res => {
        let body = "";
        res.on("data", c => (body += c));
        res.on("end", () => resolve(JSON.parse(body)));
      }
    );
    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

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

// Calcola quanti minuti aspettare per atterrare a caso dentro la finestra,
// partendo da adesso - non da un orario base presunto. Se siamo gia' fuori
// finestra (GitHub ha fatto partire il workflow in ritardo), niente attesa.
function minutiDiRitardo() {
  const ora = new Date();
  const minutiOra = ora.getUTCHours() * 60 + ora.getUTCMinutes();

  if (minutiOra < FINESTRA_INIZIO_MIN) {
    const attesaFinoAllInizio = FINESTRA_INIZIO_MIN - minutiOra;
    return attesaFinoAllInizio + Math.floor(Math.random() * (FINESTRA_FINE_MIN - FINESTRA_INIZIO_MIN));
  }
  if (minutiOra < FINESTRA_FINE_MIN) {
    return Math.floor(Math.random() * (FINESTRA_FINE_MIN - minutiOra));
  }
  return 0; // gia' oltre la finestra: meglio mandare subito che ritardare ancora
}

async function main() {
  const ritardoBaseMin = isTest ? 0 : minutiDiRitardo();
  console.log(`Ritardo: ${ritardoBaseMin} min${isTest ? " (test, nessuna attesa)" : ""}`);
  await aspetta(ritardoBaseMin * 60 * 1000);

  const listaPrivato = JSON.parse(fs.readFileSync(path.join(__dirname, "buongiorno-privato.json"), "utf8"));
  const rispPrivato = await invia(CHAT_PRIVATO, scegli(listaPrivato));
  console.log("Privato:", JSON.stringify(rispPrivato));
  if (!rispPrivato.ok) process.exitCode = 1;

  if (!CHAT_PUBBLICO) {
    console.log("TELEGRAM_CHAT_ID_PUBBLICO non impostato — canale pubblico non ancora collegato, salto.");
    return;
  }

  const ritardoExtraSec = isTest ? 0 : 30 + Math.floor(Math.random() * 30); // 30-60 secondi dopo il privato
  console.log(`Ritardo prima del pubblico: ${ritardoExtraSec} secondi`);
  await aspetta(ritardoExtraSec * 1000);

  const listaPubblico = JSON.parse(fs.readFileSync(path.join(__dirname, "buongiorno-pubblico.json"), "utf8"));
  const rispPubblico = await invia(CHAT_PUBBLICO, scegli(listaPubblico));
  console.log("Pubblico:", JSON.stringify(rispPubblico));
  if (!rispPubblico.ok) process.exitCode = 1;
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
