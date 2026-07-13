// Promemoria orario per Alessio: dal 1 agosto 2026 (inizio bilancio), ogni ora
// tra le 10 e le 20 circa, controlla a che punto e' il recap del canale
// pubblico (stato in recap-stato.json, gestito dal webhook - vedi
// netlify/functions/lib/recap.js) e gli ricorda cosa manca. Si ferma da solo
// appena il recap e' concluso per la giornata (pubblicato/annullato/nessuna
// vinta), senza bisogno di disattivare nulla a mano.
const fs = require("fs");
const path = require("path");
const https = require("https");

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ALESSIO_USER_ID = 628218072;
const DATA_INIZIO = "2026-08-01";

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

function messaggioPerFase(stato) {
  switch (stato.fase) {
    case "raccolta_screenshot":
      return `Promemoria: mandami gli screenshot di ieri per il recap (siamo a ${stato.screenshotRicevuti.length}/${stato.vinte.length}), o scrivimi "oggi no".`;
    case "raccolta_testo":
      return "Promemoria: mancano solo il tuo testo per il post del recap.";
    case "anteprima":
      return "Promemoria: l'anteprima del recap ti aspetta — rispondi OK per pubblicarla o ANNULLA.";
    default:
      return 'Promemoria: mandami gli screenshot di ieri per il recap (o rispondimi anche solo "oggi no").';
  }
}

async function main() {
  const oggi = new Date().toISOString().slice(0, 10);
  if (oggi < DATA_INIZIO) {
    console.log(`Ancora prima dell'inizio bilancio (${DATA_INIZIO}) — nessun promemoria.`);
    return;
  }

  const statoPath = path.join(__dirname, "recap-stato.json");
  const stato = JSON.parse(fs.readFileSync(statoPath, "utf8"));
  if (stato.data === oggi && stato.risolto) {
    console.log("Recap gia' concluso per oggi — nessun promemoria.");
    return;
  }

  const testo = stato.data === oggi ? messaggioPerFase(stato) : messaggioPerFase({ fase: null });
  const risp = await chiamaApi("sendMessage", { chat_id: ALESSIO_USER_ID, text: testo });
  console.log("Promemoria inviato:", JSON.stringify(risp));
  if (!risp.ok) process.exitCode = 1;
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
