// Lettura/scrittura di un file qualsiasi del repo via GitHub Contents API —
// usato sia per giocate.json che per lo stato del recap.
const GITHUB_API = "https://api.github.com";

async function leggiFileJson(path) {
  const url = `${GITHUB_API}/repos/${process.env.GITHUB_REPO}/contents/${path}?ref=${process.env.GITHUB_BRANCH}`;
  const res = await fetch(url, {
    headers: { Authorization: `token ${process.env.GITHUB_TOKEN}`, "User-Agent": "isola-bot" }
  });
  if (!res.ok) throw new Error(`Lettura ${path} fallita: ` + res.status);
  const json = await res.json();
  const content = Buffer.from(json.content, "base64").toString("utf-8");
  return { data: JSON.parse(content), sha: json.sha };
}

async function scriviFileJson(path, data, sha, messaggioCommit) {
  const url = `${GITHUB_API}/repos/${process.env.GITHUB_REPO}/contents/${path}`;
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
  if (!res.ok) throw new Error(`Scrittura ${path} fallita: ` + res.status);
}

module.exports = { leggiFileJson, scriviFileJson };
