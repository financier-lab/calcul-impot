/**
 * Frontalier franco-suisse — deux moteurs derrière un seul formulaire.
 * Pur, déterministe, exécutable côté client. L'impôt français est calculé
 * par le moteur publicodes du dépôt (`impot-revenu`).
 *
 * Régime A — « accord de 1983 » (VD, VS, NE, JU, BE, SO, BS, BL) : salaire
 *   imposé exclusivement en France (retour quotidien + attestation 2041-AS/ASK).
 * Régime B — Genève / cantons hors accord : impôt à la source suisse (barème
 *   officiel GE 2026 embarqué), déclaré en France avec crédit d'impôt égal à
 *   l'impôt français (art. 25 A de la convention de 1966, méthode 2047).
 *
 * Sources principales (consultées 2026-07-26, barème GE ingéré 2026-08-08) :
 *   impots.gouv.fr « Je suis frontalier franco-suisse » ; haute-savoie.gouv.fr
 *   (cas 1 / cas 2, exemple cotisation CMU) ; BOI-INT-CVB-CHE-10-20-60 ;
 *   ESTV tar26ge (barèmes source GE 2026) ; URSSAF/CNTFS (CMU 8 %, RFR N−2) ;
 *   sif.admin.ch (avenant télétravail 40 %, applicable 01.01.2026).
 *
 * SCOPE (v1) — hors périmètre, affiché comme limites : quasi-résident genevois
 * (TOU), impôt sur la fortune, rachats LPP, 3e pilier, barèmes source des
 * cantons hors accord autres que GE, année d'arrivée/départ en cours d'année.
 */

import type Engine from "publicodes";

import { creerMoteur, impotRevenu, type Situation } from "./impot-revenu";
import {
  GENEVE_BAREMES_2026,
  type CodeBaremeGE,
} from "./data/geneve-baremes-2026";

export const FRONTALIER_YEAR = 2026;

/** Taux de change fiscal CHF→EUR, revenus 2025 déclarés 2026 (form. 2047-SUISSE). */
export const FX_CHF_EUR = 1.07;

/** Cantons de l'accord du 11 avril 1983 — salaire imposé en France. */
export const CANTONS_ACCORD_1983 = [
  "VD", "VS", "NE", "JU", "BE", "SO", "BS", "BL",
] as const;

// Assurance maladie frontalier (URSSAF/CNTFS) : cotisation 8 % sur le RFR N−2
// après abattement de 25 % du PASS de l'année du revenu de référence
// (cotisation 2026 → RFR 2024 → 25 % × PASS 2024 = 46 368 €).
export const CMU_TAUX = 0.08;
export const CMU_ABATTEMENT = 11_592;

// Télétravail (informatif — bandeaux, pas de calcul en v1).
export const TELETRAVAIL_SEUIL_FISCAL = 0.40; // avenant applicable au 01.01.2026
export const TELETRAVAIL_SEUIL_SOCIAL = 0.50; // accord-cadre européen

// Cotisations sociales suisses, part salarié (estimation du net imposable FR).
const AVS_AI_APG = 0.053;
const AC = 0.011;
const AC_PLAFOND_CHF = 148_200; // salaire annuel assuré max (aussi plafond LAA)
const AANP_DEFAUT = 0.012; // accidents non professionnels — variable employeur
// LPP (2e pilier) : montants-limites 2026 (inchangés vs 2025).
const LPP_DEDUCTION_COORDINATION = 26_460;
const LPP_SALAIRE_COORDONNE_MAX = 64_260; // 90 720 − 26 460
const LPP_SEUIL_ENTREE = 22_680;
/** Taux de bonification total par tranche d'âge ; part salarié ≈ la moitié
 *  (le règlement de la caisse peut différer — tolérance affichée). */
const LPP_TAUX_PAR_AGE = {
  "25-34": 0.07,
  "35-44": 0.1,
  "45-54": 0.15,
  "55-65": 0.18,
} as const;

// Abattement de 10 % pour frais professionnels, revenus 2025 (impôt 2026) :
// plafond 14 555 € (14 426 € revenus 2024, indexé +0,9 % — recouper au BOFiP).
const ABATTEMENT_10_PLAFOND = 14_555;

// Moteur publicodes partagé : setSituation() réinitialise la situation à
// chaque appel, seule la création est coûteuse.
let moteurIR: Engine | null = null;
function irNet(input: Parameters<typeof impotRevenu>[0]): number {
  moteurIR ??= creerMoteur();
  return impotRevenu(input, moteurIR).impotNet;
}

export type CantonTravail =
  | (typeof CANTONS_ACCORD_1983)[number]
  | "GE"
  | "AUTRE";
export type TrancheAge = keyof typeof LPP_TAUX_PAR_AGE;
export type AssuranceMaladie = "CMU" | "LAMAL";

export interface FrontalierSuisseInput {
  cantonTravail: CantonTravail;
  /** Salaire brut annuel en CHF. */
  salaireBrutCHF: number;
  situation: Situation;
  nbEnfants?: number;
  /** Couple : le conjoint a-t-il un revenu ? (GE : barème B vs C). */
  conjointTravaille?: boolean;
  /** Autres revenus nets imposables du foyer, en EUR (défaut 0). */
  autresRevenusFoyerEUR?: number;
  assuranceMaladie: AssuranceMaladie;
  /** LAMal uniquement : prime mensuelle saisie (pas de barème public unique). */
  primeLamalMensuelleCHF?: number;
  /** Tranche d'âge LPP (défaut « 35-44 » — hypothèse affichée, modifiable). */
  trancheAge?: TrancheAge;
  /** Part de télétravail 0–1 : n'entre pas dans le calcul v1, déclenche des avertissements. */
  teletravailPct?: number;
}

export interface CotisationsSuisses {
  avs: number;
  ac: number;
  aanp: number;
  lpp: number;
  total: number;
  /** Net annuel CHF après cotisations (base du net imposable français). */
  netCHF: number;
}

/** Résultat d'un régime (réel ou contrefactuel), tous montants annuels. */
export interface RegimeResult {
  regime: "accord-1983" | "source-geneve" | "source-autre-canton";
  /** Retenue à la source suisse (CHF ; 0 sous l'accord ; null si canton hors
   *  accord ≠ GE — barème cantonal non embarqué, aucun chiffre affiché). */
  retenueSuisseCHF: number | null;
  /** Taux effectif du barème GE appliqué au brut (null sous l'accord). */
  tauxSourceGE: number | null;
  /** Code barème GE utilisé (null sous l'accord). */
  codeBaremeGE: CodeBaremeGE | null;
  /** Impôt français dû (EUR) — foyer entier sous l'accord ; effet de taux seul côté GE. */
  impotFranceEUR: number;
  /** Cotisation CMU ou primes LAMal (EUR). */
  maladieEUR: number;
  /** Total des prélèvements (EUR, hors cotisations sociales suisses).
   *  null si la retenue suisse est inconnue (canton hors barème). */
  totalPrelevementsEUR: number | null;
  /** Net final annuel du foyer (EUR) = net CHF converti + autres revenus − prélèvements. */
  netFinalEUR: number | null;
  /** Prélèvements / (net CHF converti + autres revenus). */
  tauxPrelevement: number | null;
}

export type Avertissement =
  | "teletravail-fiscal-40"
  | "teletravail-social-50"
  | "nuitees-45"
  | "csg-patrimoine-cmu"
  | "canton-autre-sans-bareme";

export interface FrontalierSuisseResult {
  cotisations: CotisationsSuisses;
  /** Régime applicable au canton choisi. */
  resultat: RegimeResult;
  /** Contrefactuel : même salaire sous l'autre régime (le hook de partage).
   *  null si canton AUTRE (pas de barème source embarqué hors GE). */
  contrefactuel: RegimeResult | null;
  avertissements: Avertissement[];
}

/** Cotisations sociales suisses (part salarié) et net annuel CHF. */
export function cotisationsSuisses(
  salaireBrutCHF: number,
  trancheAge: TrancheAge = "35-44",
  tauxAanp: number = AANP_DEFAUT,
): CotisationsSuisses {
  const brut = Math.max(0, salaireBrutCHF);
  const avs = brut * AVS_AI_APG;
  const plafonne = Math.min(brut, AC_PLAFOND_CHF);
  const ac = plafonne * AC;
  const aanp = plafonne * tauxAanp;
  const coordonne =
    brut < LPP_SEUIL_ENTREE
      ? 0
      : Math.min(Math.max(brut - LPP_DEDUCTION_COORDINATION, 0), LPP_SALAIRE_COORDONNE_MAX);
  const lpp = (coordonne * LPP_TAUX_PAR_AGE[trancheAge]) / 2;
  const total = avs + ac + aanp + lpp;
  return { avs, ac, aanp, lpp, total, netCHF: brut - total };
}

/** Code barème GE : A seul, B couple mono-revenu, C couple bi-revenus ; suffixe enfants (0–5). */
export function codeBaremeGeneve(
  situation: Situation,
  nbEnfants = 0,
  conjointTravaille = false,
): CodeBaremeGE {
  const n = Math.min(Math.max(0, Math.floor(nbEnfants)), 5);
  const lettre = situation === "seul" ? "A" : conjointTravaille ? "C" : "B";
  return `${lettre}${n}` as CodeBaremeGE;
}

/** Taux effectif (0–1) du barème source GE pour un brut MENSUEL. Officiel,
 *  pas d'interpolation : dernier seuil ≤ revenu (au-delà de la grille, dernier taux). */
export function tauxSourceGeneve(code: CodeBaremeGE, brutMensuelCHF: number): number {
  const flat = GENEVE_BAREMES_2026[code];
  let rate = 0;
  for (let i = 0; i < flat.length; i += 2) {
    if (brutMensuelCHF >= flat[i]) rate = flat[i + 1];
    else break;
  }
  return rate / 10_000; // % ×100 → fraction
}

/** Salaire imposable français : conversion + abattement de 10 % plafonné. */
function salaireImposableEUR(netCHF: number): number {
  const salaireEUR = netCHF * FX_CHF_EUR;
  return salaireEUR - Math.min(salaireEUR * 0.1, ABATTEMENT_10_PLAFOND);
}

function maladieEUR(input: FrontalierSuisseInput, rfrProxyEUR: number): number {
  if (input.assuranceMaladie === "LAMAL") {
    return (input.primeLamalMensuelleCHF ?? 0) * 12 * FX_CHF_EUR;
  }
  // v1 : proxy RFR N−2 ≈ revenu imposable courant du foyer (hypothèse affichée).
  return Math.max(0, rfrProxyEUR - CMU_ABATTEMENT) * CMU_TAUX;
}

function regimeAccord(
  input: FrontalierSuisseInput,
  cot: CotisationsSuisses,
): RegimeResult {
  const autres = Math.max(0, input.autresRevenusFoyerEUR ?? 0);
  const salImposable = salaireImposableEUR(cot.netCHF);
  const maladie = maladieEUR(input, salImposable + autres);
  // La cotisation CMU est déductible du revenu imposable (ligne 6DD).
  const deductionCmu = input.assuranceMaladie === "CMU" ? maladie : 0;
  const revenuFoyer = Math.max(0, salImposable + autres - deductionCmu);
  const impot = irNet({
    revenuNetImposable: revenuFoyer,
    situation: input.situation,
    nbEnfants: input.nbEnfants,
  });
  const netCHFEnEUR = cot.netCHF * FX_CHF_EUR;
  const total = impot + maladie;
  return {
    regime: "accord-1983",
    retenueSuisseCHF: 0,
    tauxSourceGE: null,
    codeBaremeGE: null,
    impotFranceEUR: impot,
    maladieEUR: Math.round(maladie),
    totalPrelevementsEUR: Math.round(total),
    netFinalEUR: Math.round(netCHFEnEUR + autres - total),
    tauxPrelevement: netCHFEnEUR + autres > 0 ? total / (netCHFEnEUR + autres) : 0,
  };
}

function regimeSource(
  input: FrontalierSuisseInput,
  cot: CotisationsSuisses,
): RegimeResult {
  const brut = Math.max(0, input.salaireBrutCHF);
  const autres = Math.max(0, input.autresRevenusFoyerEUR ?? 0);
  // Seul le barème GE est embarqué : pour les autres cantons hors accord, on
  // affiche « imposé à la source au barème du canton » sans chiffre suisse.
  const horsBareme = input.cantonTravail === "AUTRE";
  const code = horsBareme
    ? null
    : codeBaremeGeneve(
        input.situation,
        input.nbEnfants,
        input.conjointTravaille ?? false,
      );
  // Le barème GE s'applique au salaire BRUT mensuel entier (barème effectif).
  const taux = code === null ? null : tauxSourceGeneve(code, brut / 12);
  const retenueCHF = taux === null ? null : brut * taux;

  // Côté France : le salaire est déclaré (2047-SUISSE) mais pas ré-imposé —
  // crédit d'impôt égal à l'impôt français, au prorata (art. 25 A). Il ne
  // reste que l'« effet de taux » sur les autres revenus du foyer.
  const salImposable = salaireImposableEUR(cot.netCHF);
  const maladie = maladieEUR(input, salImposable + autres);
  const revenuFoyer = salImposable + autres;
  const irAvec = irNet({
    revenuNetImposable: revenuFoyer,
    situation: input.situation,
    nbEnfants: input.nbEnfants,
  });
  const credit = revenuFoyer > 0 ? irAvec * (salImposable / revenuFoyer) : 0;
  const irDu = Math.max(0, Math.round(irAvec - credit));

  const netCHFEnEUR = cot.netCHF * FX_CHF_EUR;
  const total =
    retenueCHF === null ? null : retenueCHF * FX_CHF_EUR + irDu + maladie;
  return {
    regime: horsBareme ? "source-autre-canton" : "source-geneve",
    retenueSuisseCHF: retenueCHF === null ? null : Math.round(retenueCHF),
    tauxSourceGE: taux,
    codeBaremeGE: code,
    impotFranceEUR: irDu,
    maladieEUR: Math.round(maladie),
    totalPrelevementsEUR: total === null ? null : Math.round(total),
    netFinalEUR: total === null ? null : Math.round(netCHFEnEUR + autres - total),
    tauxPrelevement:
      total === null
        ? null
        : netCHFEnEUR + autres > 0
          ? total / (netCHFEnEUR + autres)
          : 0,
  };
}

export function frontalierSuisse(
  input: FrontalierSuisseInput,
): FrontalierSuisseResult {
  const cot = cotisationsSuisses(input.salaireBrutCHF, input.trancheAge ?? "35-44");
  const accord = (CANTONS_ACCORD_1983 as readonly string[]).includes(
    input.cantonTravail,
  );

  const avertissements: Avertissement[] = [];
  const tt = input.teletravailPct ?? 0;
  if (tt > TELETRAVAIL_SEUIL_FISCAL) avertissements.push("teletravail-fiscal-40");
  if (tt >= TELETRAVAIL_SEUIL_SOCIAL) avertissements.push("teletravail-social-50");
  if (accord) avertissements.push("nuitees-45");
  if (input.assuranceMaladie === "CMU") avertissements.push("csg-patrimoine-cmu");
  if (input.cantonTravail === "AUTRE") avertissements.push("canton-autre-sans-bareme");

  const resultat = accord ? regimeAccord(input, cot) : regimeSource(input, cot);
  // Contrefactuel : même poste sous l'autre régime. Pas de chiffre suisse
  // possible pour un canton hors accord autre que GE (barème non embarqué).
  const contrefactuel =
    input.cantonTravail === "AUTRE"
      ? null
      : accord
        ? regimeSource(input, cot)
        : regimeAccord(input, cot);

  return { cotisations: cot, resultat, contrefactuel, avertissements };
}
