// Compone l'immagine brandizzata del recap pubblico: una card per ogni
// giocata vinta ieri (screenshot + evento/selezione + badge), sotto un
// header col brand L'ISOLA. Renderizzato come SVG (testo/forme) + gli
// screenshot reali incollati sopra con sharp (niente servizi esterni).
const sharp = require("sharp");

const W = 1080;
const PAD = 40;
const HEADER_H = 130;
const TILE_H = 300;
const TILE_GAP = 24;
const FOOTER_H = 70;
const IMG_INSET = 12;
const LABEL_H = 70;
const IMG_H = TILE_H - IMG_INSET * 2 - LABEL_H;

function escXml(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function altezzaTotale(n) {
  return PAD + HEADER_H + n * TILE_H + (n - 1) * TILE_GAP + FOOTER_H + PAD;
}

function buildFrameSvg(vinte) {
  const cardW = W - PAD * 2;
  const totalH = altezzaTotale(vinte.length);

  let cards = "";
  vinte.forEach((v, i) => {
    const tileY = PAD + HEADER_H + i * (TILE_H + TILE_GAP);
    const labelTop = tileY + IMG_INSET + IMG_H;
    cards += `
      <rect x="${PAD}" y="${tileY}" width="${cardW}" height="${TILE_H}" rx="18" fill="#1c150d" stroke="rgba(224,170,62,0.35)" stroke-width="1"/>
      <text x="${PAD + 24}" y="${labelTop + 30}" font-family="sans-serif" font-size="24" font-weight="800" fill="#f5ecd8">${escXml(v.evento)}</text>
      <text x="${PAD + 24}" y="${labelTop + 54}" font-family="sans-serif" font-size="16" fill="#b3a186">${escXml(v.selezione || "")}</text>
    `;
  });

  return `<svg width="${W}" height="${totalH}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <radialGradient id="g1" cx="15%" cy="-5%" r="60%">
        <stop offset="0%" stop-color="#e0aa3e" stop-opacity="0.16"/>
        <stop offset="100%" stop-color="#e0aa3e" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <rect width="${W}" height="${totalH}" fill="#0b0905"/>
    <rect width="${W}" height="${totalH}" fill="url(#g1)"/>
    <circle cx="${PAD + 35}" cy="${PAD + 55}" r="35" fill="#000" stroke="#e0aa3e" stroke-width="2"/>
    <text x="${PAD + 35}" y="${PAD + 66}" font-family="serif" font-size="32" font-weight="800" text-anchor="middle" fill="#e0aa3e">L'I</text>
    <text x="${PAD + 90}" y="${PAD + 60}" font-family="sans-serif" font-size="28" font-weight="800" letter-spacing="2" fill="#f5ecd8">L'ISOLA</text>
    <text x="${PAD + 90}" y="${PAD + 88}" font-family="sans-serif" font-size="15" fill="#7a6b52">Bilancio pubblico</text>
    ${cards}
    <line x1="${PAD}" y1="${totalH - FOOTER_H}" x2="${W - PAD}" y2="${totalH - FOOTER_H}" stroke="rgba(245,236,216,0.10)"/>
    <text x="${W / 2}" y="${totalH - FOOTER_H / 2 + 6}" text-anchor="middle" font-family="sans-serif" font-size="15" fill="#7a6b52">Nel privato le vedi PRIMA che partano</text>
  </svg>`;
}

function buildBadgeSvg() {
  return `<svg width="100" height="34" xmlns="http://www.w3.org/2000/svg">
    <rect width="100" height="34" rx="17" fill="#0f2b1c" stroke="#17c964" stroke-width="1"/>
    <text x="50" y="22" text-anchor="middle" font-family="sans-serif" font-size="14" font-weight="700" fill="#17c964">Vinta</text>
  </svg>`;
}

async function generaImmagineRecap(vinte, screenshotBuffers) {
  const cardW = W - PAD * 2;
  const frameSvg = buildFrameSvg(vinte);
  const frameBuffer = await sharp(Buffer.from(frameSvg)).png().toBuffer();
  const badgeBuffer = await sharp(Buffer.from(buildBadgeSvg())).png().toBuffer();

  const composite = [];
  for (let i = 0; i < vinte.length; i++) {
    const tileY = PAD + HEADER_H + i * (TILE_H + TILE_GAP);
    const shot = await sharp(screenshotBuffers[i]).resize(cardW - IMG_INSET * 2, IMG_H, { fit: "cover" }).png().toBuffer();
    composite.push({ input: shot, top: tileY + IMG_INSET, left: PAD + IMG_INSET });
    composite.push({ input: badgeBuffer, top: tileY + IMG_INSET + 12, left: PAD + cardW - IMG_INSET - 112 });
  }

  return sharp(frameBuffer).composite(composite).png().toBuffer();
}

module.exports = { generaImmagineRecap };
