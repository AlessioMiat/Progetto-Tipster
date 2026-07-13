// Pubblica il buongiorno nel canale privato, poi (30-60 secondi dopo) in
// quello pubblico. L'orario del privato varia ogni giorno a caso tra le
// 08:00 e le 09:30 (vedi ritardoBase + cron nel workflow). Se il canale
// pubblico non e' ancora collegato (manca il secret), lo salta senza errori.
const fs = require("fs");
const path = require("path");
const https = require("https");

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_PRIVATO = process.env.TELEGRAM_CHAT_ID_PRIVATO;
const CHAT_PUBBLICO = process.env.TELEGRAM_CHAT_ID_PUBBLICO;
const isTest = process.env.GITHUB_EVENT_NAME === "workflow_dispatch";

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

async function main() {
  // Finestra 08:00-09:30 CEST = 0-90 minuti dopo l'orario base del workflow (06:00 UTC).
  // Nessuna attesa se lanciato a mano ("Run workflow"), comodo per i test.
  const ritardoBaseMin = isTest ? 0 : Math.floor(Math.random() * 90);
  console.log(`Ritardo base: ${ritardoBaseMin} min${isTest ? " (test, nessuna attesa)" : ""}`);
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
