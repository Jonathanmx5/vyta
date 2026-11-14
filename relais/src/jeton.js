// Vérification d'un jeton d'identité Firebase (JWT RS256) avec WebCrypto,
// sans dépendance. Les clés publiques viennent de Google.

export const URL_CLES =
  'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';
export const URL_CLES_APP_CHECK = 'https://firebaseappcheck.googleapis.com/v1/jwks';

export class JetonInvalide extends Error {}

function base64urlVersOctets(texte) {
  const b64 = texte.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64.padEnd(Math.ceil(b64.length / 4) * 4, '='));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

function lireJson(partie) {
  try {
    return JSON.parse(new TextDecoder().decode(base64urlVersOctets(partie)));
  } catch {
    throw new JetonInvalide('jeton illisible');
  }
}

/** Vérifie format et signature RS256 ; rend la charge du jeton. */
async function verifierSignature(jeton, cles) {
  const parties = (jeton ?? '').split('.');
  if (parties.length !== 3) throw new JetonInvalide('format');
  const entete = lireJson(parties[0]);
  const charge = lireJson(parties[1]);
  if (entete.alg !== 'RS256' || !entete.kid) throw new JetonInvalide('algorithme');

  const chercher = (jeu) => jeu.keys.find((k) => k.kid === entete.kid);
  // Clé absente du jeu gardé en mémoire : Google vient peut-être d'en publier
  // une nouvelle. On recharge une fois avant de refuser, sinon un jeton
  // valide serait rejeté jusqu'à l'expiration du cache (une heure).
  const jwk = chercher(await cles()) ?? chercher(await cles({ forcer: true }));
  if (!jwk) throw new JetonInvalide('clé inconnue');
  const cle = await crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify'],
  );
  const valide = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    cle,
    base64urlVersOctets(parties[2]),
    new TextEncoder().encode(`${parties[0]}.${parties[1]}`),
  );
  if (!valide) throw new JetonInvalide('signature');
  return charge;
}

/**
 * Renvoie l'uid de l'utilisateur ou lève JetonInvalide.
 * @param {string} jeton
 * @param {{projectId: string, cles: () => Promise<{keys: object[]}>, maintenant?: number}} options
 */
export async function verifierJeton(jeton, { projectId, cles, maintenant = Date.now() }) {
  const charge = await verifierSignature(jeton, cles);
  const s = Math.floor(maintenant / 1000);
  if (charge.iss !== `https://securetoken.google.com/${projectId}`) throw new JetonInvalide('émetteur');
  if (charge.aud !== projectId) throw new JetonInvalide('audience');
  if (typeof charge.exp !== 'number' || charge.exp <= s) throw new JetonInvalide('expiré');
  if (typeof charge.iat !== 'number' || charge.iat > s + 300) throw new JetonInvalide('émis dans le futur');
  if (typeof charge.sub !== 'string' || charge.sub === '') throw new JetonInvalide('sujet');
  return charge.sub;
}

/**
 * Jeton App Check (prouve que l'appel vient de la vraie application) : rend
 * l'identifiant de l'application ou lève JetonInvalide.
 * @param {{projectId: string, projectNumber: string, cles: () => Promise<{keys: object[]}>, maintenant?: number}} options
 */
export async function verifierAppCheck(
  jeton,
  { projectId, projectNumber, cles, maintenant = Date.now() },
) {
  const charge = await verifierSignature(jeton, cles);
  const s = Math.floor(maintenant / 1000);
  if (charge.iss !== `https://firebaseappcheck.googleapis.com/${projectNumber}`) {
    throw new JetonInvalide('émetteur');
  }
  const audiences = Array.isArray(charge.aud) ? charge.aud : [charge.aud];
  if (!audiences.includes(`projects/${projectNumber}`) && !audiences.includes(`projects/${projectId}`)) {
    throw new JetonInvalide('audience');
  }
  if (typeof charge.exp !== 'number' || charge.exp <= s) throw new JetonInvalide('expiré');
  if (typeof charge.sub !== 'string' || charge.sub === '') throw new JetonInvalide('sujet');
  return charge.sub;
}

/** Durée de vie d'un jeu de clés publiques en mémoire. */
const DUREE_CACHE = 3_600_000;
/**
 * Écart minimal entre deux rechargements forcés : sans lui, des jetons au
 * `kid` inventé feraient interroger Google à chaque requête.
 */
export const ECART_RECHARGEMENT = 60_000;

/**
 * Lecteur d'un jeu de clés publiques (JWKS), gardé une heure. `forcer`
 * recharge avant l'échéance, au plus une fois par minute.
 * @returns {(options?: {forcer?: boolean, fetcher?: typeof fetch, maintenant?: number}) => Promise<{keys: object[]}>}
 */
export function lecteurCles(url, messageErreur) {
  let cache = { at: 0, valeur: null };
  return async ({ forcer = false, fetcher = fetch, maintenant = Date.now() } = {}) => {
    const age = maintenant - cache.at;
    if (cache.valeur && age < (forcer ? ECART_RECHARGEMENT : DUREE_CACHE)) return cache.valeur;
    const r = await fetcher(url);
    if (!r.ok) throw new Error(messageErreur);
    cache = { at: maintenant, valeur: await r.json() };
    return cache.valeur;
  };
}

/** Clés publiques d'App Check. */
export const clesAppCheck = lecteurCles(URL_CLES_APP_CHECK, 'clés App Check indisponibles');

/** Clés publiques de Google (jetons d'identité Firebase). */
export const clesGoogle = lecteurCles(URL_CLES, 'clés indisponibles');
