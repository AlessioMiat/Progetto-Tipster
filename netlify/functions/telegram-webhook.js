// Bot L'ISOLA — riceve gli aggiornamenti dal canale Telegram e aggiorna
// giocate.json direttamente su GitHub (che fa poi ripubblicare Netlify da solo).
//
// Variabili d'ambiente richieste (da impostare su Netlify, MAI scritte qui):
//   TELEGRAM_BOT_TOKEN   token del bot (da BotFather)
//   TELEGRAM_CHAT_ID     id del canale privato L'ISOLA (numero negativo tipo -1001234567890)
//   GITHUB_TOKEN         Personal Access Token con permesso di scrittura sul repo
//   GITHUB_REPO          es. "AlessioMiat/alessio-sistema"
//   GITHUB_BRANCH        es. "main"
//   GITHUB_FILE_PATH     es. "Alessio/Alessio/Scommesse/dashboard/giocate.json"

const GITHUB_API = "https://api.github.com";
const TIPOLOGIE_VALIDE = ["Tridente", "Marcatore", "RaddoppioAI", "Live", "QuoteBoostate", "Paracadute"];

// Sticker di risposta che segnano l'esito (file_unique_id, stabile per sticker
// anche se lo si invia da chat diverse). Aggiornati il 13/07/2026 con i due
// sticker definitivi scelti da Alessio per il canale privato (vinta/persa).
const STICKER_VINTA = "AgAD3UAAAt2OoVI";
const STICKER_PERSA = "AgAD3kAAAt2OoVI";

function estraiCampo(testo, etichetta) {
  const re = new RegExp(etichetta + "\\s*:\\s*(.+)", "i");
  const m = testo.match(re);
  return m ? m[1].trim() : null;
}

function estraiTipologia(testo) {
  return TIPOLOGIE_VALIDE.find(t => testo.includes("#" + t)) || null;
}

function parseGiocataSecca(testo, tipologia) {
  const evento = estraiCampo(testo, "Evento");
  const quotaStr = estraiCampo(testo, "Quota");
  const stakeStr = estraiCampo(testo, "Stake");
  if (!evento || !quotaStr || !stakeStr) return null;
  const codice = estraiCampo(testo, "Codice");
  const nota = estraiCampo(testo, "Nota");
  return {
    evento,
    tipologia,
    selezione: estraiCampo(testo, "Selezione") || "",
    quota: parseFloat(quotaStr.replace(",", ".")),
    stake: parseFloat(stakeStr.replace(",", ".").replace(/u\b/i, "").trim()),
    esito: "in_attesa",
    ...(codice ? { codice } : {}),
    ...(nota ? { nota } : {})
  };
}

function parseParacaduteStep(testo) {
  // Ogni step si pubblica come messaggio a sé (non si conoscono step 2/3 in
  // anticipo) — "Ciclo" collega gli step tra loro, "Step" li ordina.
  const cicloStr = estraiCampo(testo, "Ciclo");
  const stepStr = estraiCampo(testo, "Step");
  const evento = estraiCampo(testo, "Evento");
  const quotaStr = estraiCampo(testo, "Quota");
  if (!cicloStr || !stepStr || !evento || !quotaStr) return null;
  const codice = estraiCampo(testo, "Codice");
  const nota = estraiCampo(testo, "Nota");
  return {
    evento,
    tipologia: "Paracadute",
    selezione: estraiCampo(testo, "Selezione") || "",
    quota: parseFloat(quotaStr.replace(",", ".")),
    ciclo: parseInt(cicloStr, 10),
    step: parseInt(stepStr, 10),
    esito: "in_attesa",
    ...(codice ? { codice } : {}),
    ...(nota ? { nota } : {})
  };
}

async function leggiGiocateJson() {
  const url = `${GITHUB_API}/repos/${process.env.GITHUB_REPO}/contents/${process.env.GITHUB_FILE_PATH}?ref=${process.env.GITHUB_BRANCH}`;
  const res = await fetch(url, {
    headers: { Authorization: `token ${process.env.GITHUB_TOKEN}`, "User-Agent": "isola-bot" }
  });
  if (!res.ok) throw new Error("Lettura giocate.json fallita: " + res.status);
  const json = await res.json();
  const content = Buffer.from(json.content, "base64").toString("utf-8");
  return { data: JSON.parse(content), sha: json.sha };
}

async function scriviGiocateJson(data, sha, messaggioCommit) {
  const url = `${GITHUB_API}/repos/${process.env.GITHUB_REPO}/contents/${process.env.GITHUB_FILE_PATH}`;
  const contentB64 = Buffer.from(JSON.stringify(data, null, 2)).toString("base64");
  const res = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `token ${process.env.GITHUB_TOKEN}`,
      "User-Agent": "isola-bot",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ message: messaggioCommit, content: contentB64, sha, branch: process.env.GITHUB_BRANCH })
  });
  if (!res.ok) throw new Error("Scrittura giocate.json fallita: " + res.status);
}

exports.handler = async event => {
  try {
    const update = JSON.parse(event.body);
    const post = update.channel_post;
    if (!post || String(post.chat.id) !== process.env.TELEGRAM_CHAT_ID) {
      return { statusCode: 200, body: "ignorato" };
    }

    // Caso 1: nuovo post con didascalia strutturata -> nuova giocata "in_attesa"
    if (post.caption) {
      const tipologia = estraiTipologia(post.caption);
      const giocata = tipologia === "Paracadute" ? parseParacaduteStep(post.caption)
        : tipologia ? parseGiocataSecca(post.caption, tipologia)
        : null;
      if (giocata) {
        giocata.data = new Date(post.date * 1000).toISOString().slice(0, 10);
        giocata.telegram_message_id = post.message_id;
        const { data, sha } = await leggiGiocateJson();
        data.giocate.push(giocata);
        await scriviGiocateJson(data, sha, `bot: nuova giocata ${tipologia} ${giocata.data}`);
      }
      return { statusCode: 200, body: "ok" };
    }

    // Caso 2: risposta a un post -> sticker vinta/persa dedicati segnano l'esito.
    // Qualunque altro sticker o testo (commenti, contesto) viene ignorato.
    if (post.reply_to_message && post.sticker) {
      const id = post.sticker.file_unique_id;
      const esito = id === STICKER_VINTA ? "vinta" : id === STICKER_PERSA ? "persa" : null;
      if (esito) {
        const refId = post.reply_to_message.message_id;
        const { data, sha } = await leggiGiocateJson();
        const giocata = data.giocate.find(g => g.telegram_message_id === refId);
        if (giocata) {
          giocata.esito = esito;
          await scriviGiocateJson(data, sha, `bot: esito ${esito} (msg ${refId})`);
        }
      }
    }

    return { statusCode: 200, body: "ok" };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: "error" };
  }
};
