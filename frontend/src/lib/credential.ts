// ARC Certified Credential — deterministic, client-derivable stand-in for a
// Schnorr-signed on-chain credential. Uses Web Crypto SHA-256 to produce a
// reproducible "signature" over (alias · issuer · version · timestamp-day).
// On-chain: this blob gets BIP-340-signed by the Orchestrator key and
// inscribed as an Ordinal; Lightning invoices can embed the credential ID in
// the `description_hash` field (BOLT-11) as an attestation commitment.

export type ARCCredential = {
  version: 1;
  type: "ARC_CERTIFIED";
  alias: string;
  issuer: "arc-orchestrator";
  issued_at: string;        // ISO day-truncated so it stays stable 24h
  credential_id: string;    // sha256(alias|issuer|version|day) hex
  signature: string;        // schnorr-style deterministic hex (demo)
  pubkey_x: string;         // issuer x-only key (constant in demo)
  inscription_id: string;   // <txid>i0 style deterministic stub
  embed: {
    html: string;
    js: string;
    markdown: string;
    invoice_memo: string;   // to drop into BOLT-11 memo
  };
};

const ISSUER_PUBKEY_X = "03a0c2b6e1f4b0b5e2d5f71c82b8a4e7f0d9c1a3b4e5f67890abcdef12345678";

async function sha256Hex(s: string): Promise<string> {
  const buf = new TextEncoder().encode(s);
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function mintCredential(alias: string): Promise<ARCCredential> {
  const day = new Date().toISOString().slice(0, 10);
  const normalized = alias.trim().toLowerCase();
  const message = `${normalized}|arc-orchestrator|1|${day}`;
  const credentialId = await sha256Hex(message);
  // Deterministic 64-char "signature" — real impl: schnorr.sign(issuerSk, msg)
  const signature = (await sha256Hex(`sig|${credentialId}|${ISSUER_PUBKEY_X}`)) +
                    (await sha256Hex(`nonce|${credentialId}`)).slice(0, 64);
  const inscriptionTxid = await sha256Hex(`ins|${credentialId}`);
  const inscription_id = `${inscriptionTxid}i0`;

  const badgeUrl = `https://arc-protocol-six.vercel.app/arc-certified-badge.svg?agent=${encodeURIComponent(normalized)}`;
  const dashUrl = `https://arc-protocol-six.vercel.app/badge?agent=${encodeURIComponent(normalized)}`;
  const embed = {
    html: `<a href="${dashUrl}" target="_blank" rel="noopener"><img src="${badgeUrl}" alt="ARC Certified — ${normalized}" height="28"/></a>`,
    js:   `<script src="https://arc-protocol-six.vercel.app/arc-certified.js" data-agent="${normalized}" async></script>`,
    markdown: `[![ARC Certified](${badgeUrl})](${dashUrl})`,
    invoice_memo: `ARC_CERTIFIED:${normalized}:${credentialId.slice(0, 16)}`,
  };

  return {
    version: 1,
    type: "ARC_CERTIFIED",
    alias: normalized,
    issuer: "arc-orchestrator",
    issued_at: day,
    credential_id: credentialId,
    signature: signature.slice(0, 128), // 64-byte schnorr-size hex
    pubkey_x: ISSUER_PUBKEY_X,
    inscription_id,
    embed,
  };
}
