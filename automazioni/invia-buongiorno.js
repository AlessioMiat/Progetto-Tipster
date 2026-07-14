// Pubblica il buongiorno nel canale privato, poi (30-60 secondi dopo) in
// quello pubblico. Se il canale pubblico non e' ancora collegato (manca il
// secret), lo salta senza errori.
//
// AFFIDABILITA' DELL'ORARIO (14/07/2026): niente piu' un singolo cron con
// un'attesa a caso dentro lo script - GitHub Actions puo' far partire un
// "schedule" trigger in ritardo (a volte anche di ore, sotto carico), e
// un'attesa aggiuntiva interna si sommava al ritardo invece di comprensarlo.
// Ora il workflow ha PIU' orari fissi ogni 10 minuti dentro la finestra
// 08:00-09:30 CEST (vedi buongiorno-privato.yml): ad ogni tentativo, questo
// script controlla se ha gia' mandato il buongiorno oggi (automazioni/
// buongiorno-stato.json) - se si', non fa nulla; se no, manda subito e
// segna lo stato. Il PRIMO tentativo che riesce a partire in orario manda
// il messaggio, tutti gli altri quel giorno sono no-op: molto piu' probabile
// che ALMENO UNO dei tentativi cada dentro la finestra, anche se GitHub ne
// ritarda qualcuno.
const fs = require("fs");
const path = require("path");
const https = require("https");

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_PRIVATO = process.env.TELEGRAM_CHAT_ID_PRIVATO;
const CHAT_PUBBLICO = process.env.TELEGRAM_CHAT_ID_PUBBLICO;
const isTest = process.env.GITHUB_EVENT_NAME === "workflow_dispatch";
const STATO_PATH = path.join(__dirname, "buongiorno-stato.json");

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
  const oggi = new Date().toISOString().slice(0, 10);
  const stato = JSON.parse(fs.readFileSync(STATO_PATH, "utf8"));

  if (!isTest && stato.data === oggi) {
    console.log("Buongiorno gia' inviato oggi da un tentativo precedente — non faccio nulla.");
    return;
  }

  const listaPrivato = JSON.parse(fs.readFileSync(path.join(__dirname, "buongiorno-privato.json"), "utf8"));
  const rispPrivato = await invia(CHAT_PRIVATO, scegli(listaPrivato));
  console.log("Privato:", JSON.stringify(rispPrivato));
  if (!rispPrivato.ok) process.exitCode = 1;

  if (CHAT_PUBBLICO) {
    const ritardoExtraSec = isTest ? 0 : 30 + Math.floor(Math.random() * 30); // 30-60 secondi dopo il privato
    console.log(`Ritardo prima del pubblico: ${ritardoExtraSec} secondi`);
    await aspetta(ritardoExtraSec * 1000);

    const listaPubblico = JSON.parse(fs.readFileSync(path.join(__dirname, "buongiorno-pubblico.json"), "utf8"));
    const rispPubblico = await invia(CHAT_PUBBLICO, scegli(listaPubblico));
    console.log("Pubblico:", JSON.stringify(rispPubblico));
    if (!rispPubblico.ok) process.exitCode = 1;
  } else {
    console.log("TELEGRAM_CHAT_ID_PUBBLICO non impostato — canale pubblico non ancora collegato, salto.");
  }

  if (!isTest) {
    fs.writeFileSync(STATO_PATH, JSON.stringify({ data: oggi }, null, 2) + "\n");
    console.log("Stato aggiornato: buongiorno inviato per", oggi);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
