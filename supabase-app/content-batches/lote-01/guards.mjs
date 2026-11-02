// Travas de conexão do executor do lote 01. Funções puras: não abrem rede nem leem segredos.
import fs from "node:fs";

export const EXPECTED = Object.freeze({
  ref: "pmmxjohixttivxbmdnhp",
  host: "aws-1-sa-east-1.pooler.supabase.com",   // pooler da homologação (região sa-east-1), igual ao da CLI vinculada
  user: "postgres.pmmxjohixttivxbmdnhp",
  database: "postgres",
  ports: [5432, 6543],
});

/** Valida a URL do pooler registrada pela CLI e devolve { host, port, user }. Recusa qualquer outro destino. */
export function parsePooler(urlString) {
  let u;
  try { u = new URL(String(urlString).trim()); } catch { throw new Error("BLOQUEADO: URL do pooler ilegível"); }
  if (u.protocol !== "postgresql:" && u.protocol !== "postgres:") throw new Error("BLOQUEADO: protocolo inesperado no pooler");
  if (u.hostname !== EXPECTED.host) throw new Error("BLOQUEADO: host do banco (" + u.hostname + ") não é o da homologação (" + EXPECTED.host + ")");
  const user = decodeURIComponent(u.username);
  if (user !== EXPECTED.user) throw new Error("BLOQUEADO: usuário do banco não é o da homologação (" + EXPECTED.user + ")");
  const port = Number(u.port || 5432);
  if (!EXPECTED.ports.includes(port)) throw new Error("BLOQUEADO: porta inesperada: " + port);
  const db = u.pathname.replace(/^\//, "") || EXPECTED.database;
  if (db !== EXPECTED.database) throw new Error("BLOQUEADO: banco inesperado: " + db);
  return { host: u.hostname, port, user, database: db };
}

/** TLS com verificação de certificado SEMPRE ligada. Exige o arquivo da CA (PEM) informado pelo usuário. */
export function tlsOptions(caPath) {
  if (!caPath) throw new Error("BLOQUEADO: informe a CA do banco (--ca <arquivo.crt> ou FSL_DB_CA). A verificação do certificado TLS é obrigatória.");
  if (!fs.existsSync(caPath)) throw new Error("BLOQUEADO: arquivo da CA não encontrado: " + caPath);
  const pem = fs.readFileSync(caPath, "utf8");
  if (!/-----BEGIN CERTIFICATE-----/.test(pem) || /PRIVATE KEY/.test(pem)) throw new Error("BLOQUEADO: o arquivo da CA não é um certificado PEM público");
  return { rejectUnauthorized: true, ca: pem, servername: EXPECTED.host };
}

export function checkLinkedRef(linked) {
  if (String(linked).trim() !== EXPECTED.ref) throw new Error("BLOQUEADO: a CLI não está vinculada à homologação esperada");
}
