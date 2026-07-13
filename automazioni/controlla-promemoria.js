// Promemoria orario per Alessio: dal 1 agosto 2026 (inizio bilancio), ogni ora
// tra le 10 e le 20 circa, controlla se ha gia' risposto oggi (screenshot,
// "oggi no", qualsiasi cosa - lo segna il webhook in promemoria-stato.json) e
// se non l'ha ancora fatto gli manda un promemoria. Si ferma da solo appena
// risolto per la giornata, senza bisogno di disattivare nulla a mano.
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

async function main() {
  const oggi = new Date().toISOString().slice(0, 10);
  if (oggi < DATA_INIZIO) {
    console.log(`Ancora prima dell'inizio bilancio (${DATA_INIZIO}) — nessun promemoria.`);
    return;
  }

  const statoPath = path.join(__dirname, "promemoria-stato.json");
  const stato = JSON.parse(fs.readFileSync(statoPath, "utf8"));
  if (stato.data === oggi && stato.risolto) {
    console.log("Gia' risolto per oggi — nessun promemoria.");
    return;
  }

  const risp = await chiamaApi("sendMessage", {
    chat_id: ALESSIO_USER_ID,
    text: "Promemoria: mandami gli screenshot di ieri per il recap (o rispondimi anche solo \"oggi no\")."
  });
  console.log("Promemoria inviato:", JSON.stringify(risp));
  if (!risp.ok) process.exitCode = 1;
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
