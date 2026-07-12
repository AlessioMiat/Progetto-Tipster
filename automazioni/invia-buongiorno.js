// Sceglie a caso un messaggio/sticker dalla lista e lo pubblica nel canale
// privato L'ISOLA. Il ritardo casuale iniziale fa si' che l'orario di invio
// vari ogni giorno dentro la finestra 08:00-10:00 (vedi workflow).
const fs = require("fs");
const path = require("path");
const https = require("https");

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID_PRIVATO;
const LISTA_FILE = process.argv[2] || path.join(__dirname, "buongiorno-privato.json");

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

async function main() {
  const ritardoMinuti = Math.floor(Math.random() * 120); // 0-120 min dopo l'orario base del workflow
  console.log(`Ritardo casuale: ${ritardoMinuti} minuti`);
  await new Promise(r => setTimeout(r, ritardoMinuti * 60 * 1000));

  const lista = JSON.parse(fs.readFileSync(LISTA_FILE, "utf8"));
  const scelto = lista[Math.floor(Math.random() * lista.length)];
  console.log("Scelto:", scelto);

  const risposta = scelto.type === "sticker"
    ? await chiamaApi("sendSticker", { chat_id: CHAT_ID, sticker: scelto.file_id })
    : await chiamaApi("sendMessage", { chat_id: CHAT_ID, text: scelto.text });

  console.log("Risposta Telegram:", JSON.stringify(risposta));
  if (!risposta.ok) process.exit(1);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
