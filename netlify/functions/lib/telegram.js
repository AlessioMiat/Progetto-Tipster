// Chiamate dirette all'API Bot di Telegram (testo, foto, download file).
async function chiamaApi(metodo, corpo) {
  const res = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/${metodo}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(corpo)
  });
  return res.json();
}

async function inviaFoto(chatId, buffer, caption, parseMode) {
  const form = new FormData();
  form.append("chat_id", String(chatId));
  if (caption) form.append("caption", caption);
  if (parseMode) form.append("parse_mode", parseMode);
  form.append("photo", new Blob([buffer], { type: "image/png" }), "recap.png");
  const res = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendPhoto`, {
    method: "POST",
    body: form
  });
  return res.json();
}

async function scaricaFile(fileId) {
  const info = await chiamaApi("getFile", { file_id: fileId });
  if (!info.ok) throw new Error("getFile fallita: " + JSON.stringify(info));
  const url = `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${info.result.file_path}`;
  const res = await fetch(url);
  return Buffer.from(await res.arrayBuffer());
}

module.exports = { chiamaApi, inviaFoto, scaricaFile };
