/**
 * Implémentation de référence (TypeScript impératif) servant d'oracle aux
 * tests : les règles publicodes doivent produire les mêmes résultats.
 * Portée identique : barème 2026, quotient familial standard, plafonnement,
 * décote.
 */

interface Tranche {
  upTo: number;
  rate: number;
}

const TRANCHES: Tranche[] = [
  { upTo: 11_600, rate: 0 },
  { upTo: 29_579, rate: 0.11 },
  { upTo: 84_577, rate: 0.3 },
  { upTo: 181_917, rate: 0.41 },
  { upTo: Infinity, rate: 0.45 },
];

const QF_PLAFOND_DEMI_PART = 1_807;
const DECOTE_SEUL = 897;
const DECOTE_COUPLE = 1_483;
const DECOTE_TAUX = 0.4525;

export type Situation = "seul" | "couple";

function bareme(revenu: number): number {
  if (revenu <= 0) return 0;
  let tax = 0;
  let prev = 0;
  for (const t of TRANCHES) {
    if (revenu <= prev) break;
    const slice = Math.min(revenu, t.upTo) - prev;
    tax += slice * t.rate;
    prev = t.upTo;
  }
  return tax;
}

function marginalRate(revenuParPart: number): number {
  let prev = 0;
  let rate = 0;
  for (const t of TRANCHES) {
    if (revenuParPart > prev) rate = t.rate;
    prev = t.upTo;
  }
  return rate;
}

export function computeParts(situation: Situation, nbEnfants = 0): number {
  const base = situation === "couple" ? 2 : 1;
  const n = Math.max(0, Math.floor(nbEnfants));
  const childParts = n <= 2 ? n * 0.5 : 1 + (n - 2);
  return base + childParts;
}

export function impotRevenuReference(input: {
  revenuNetImposable: number;
  situation: Situation;
  nbEnfants?: number;
}) {
  const revenu = Math.max(0, input.revenuNetImposable);
  const partsBase = input.situation === "couple" ? 2 : 1;
  const parts = computeParts(input.situation, input.nbEnfants);

  const irFull = bareme(revenu / parts) * parts;
  const irBase = bareme(revenu / partsBase) * partsBase;
  const nbExtraHalfParts = (parts - partsBase) / 0.5;
  const maxAdvantage = nbExtraHalfParts * QF_PLAFOND_DEMI_PART;
  const advantage = irBase - irFull;
  const plafonnementApplique = advantage > maxAdvantage;
  const impotBrut = Math.round(plafonnementApplique ? irBase - maxAdvantage : irFull);

  const forfait = input.situation === "couple" ? DECOTE_COUPLE : DECOTE_SEUL;
  const decote = Math.max(0, Math.round(forfait - DECOTE_TAUX * impotBrut));

  const impotNet = Math.max(0, impotBrut - decote);
  const tauxMoyen = revenu > 0 ? impotNet / revenu : 0;
  const tmi = marginalRate(revenu / parts);

  return { parts, impotBrut, decote, impotNet, tauxMoyen, tmi, plafonnementApplique };
}
