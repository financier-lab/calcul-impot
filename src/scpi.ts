/**
 * Fiscalité des revenus de SCPI — « pierre-papier » française et européenne.
 * Pur, déterministe, exécutable côté client. L'impôt français est calculé par
 * le moteur publicodes du dépôt (`impot-revenu`).
 *
 * Les loyers d'une SCPI investie en France sont des REVENUS FONCIERS : ajoutés
 * aux autres revenus du foyer, imposés à la tranche marginale, puis frappés des
 * prélèvements sociaux à 17,2 %. Quand la SCPI détient des immeubles à
 * l'étranger, les loyers relèvent de la convention fiscale du pays de situation
 * de l'immeuble, et la France élimine la double imposition par l'une de deux
 * méthodes (CGI art. 4 A et conventions bilatérales) :
 *
 *   — TAUX EFFECTIF (exonération avec progressivité) : le revenu étranger est
 *     exonéré, mais retenu pour déterminer le taux applicable au reste.
 *   — CRÉDIT D'IMPÔT ÉGAL À L'IMPÔT FRANÇAIS : le revenu est compris dans la
 *     base, l'impôt est calculé, puis un crédit égal à l'impôt français
 *     correspondant à ce revenu l'annule.
 *
 * Les deux méthodes donnent le MÊME impôt sur le revenu — les deux reviennent à
 * IR(revenu mondial) × part française. Le test le vérifie. Leur différence
 * pratique se joue sur les prélèvements sociaux, d'où le paramètre dédié.
 *
 * Sources principales : impots.gouv.fr « Imposition des revenus de source
 * étrangère » ; BOI-IR-LIQ-20-30-30 (règle du taux effectif) ; CGI art. 156
 * (revenus fonciers) ; CSS art. L. 136-6 (prélèvements sociaux sur les revenus
 * du patrimoine). Déclaration par le formulaire 2047.
 *
 * SCOPE (v1) — hors périmètre, affiché comme limites : régime du micro-foncier
 * (abattement de 30 %), déficit foncier et charges déductibles, CSG déductible
 * de 6,8 points l'année suivante, impôt étranger effectivement acquitté par la
 * SCPI en amont, SCPI détenues en assurance-vie ou démembrées, IFI. Les revenus
 * saisis sont des revenus NETS de charges, tels que reportés par la SCPI.
 */

import type Engine from "publicodes";

import { creerMoteur, impotRevenu, type Situation } from "./impot-revenu";

/** Taux global des prélèvements sociaux sur les revenus du patrimoine. */
export const PRELEVEMENTS_SOCIAUX = 0.172;

/** Méthode d'élimination de la double imposition prévue par la convention. */
export type MethodeElimination = "taux effectif" | "crédit d'impôt";

export interface ScpiFiscaliteInput {
  /** Revenu net imposable du foyer hors SCPI (salaires après abattement, etc.). */
  autresRevenus: number;
  /** seul = célibataire/divorcé/veuf ; couple = marié/pacsé. */
  situation: Situation;
  /** Enfants à charge (parts standard). */
  nbEnfants?: number;
  /** Revenus fonciers nets de source française distribués par la SCPI. */
  revenusFrance?: number;
  /** Revenus fonciers nets de source étrangère distribués par la SCPI. */
  revenusEtranger?: number;
  /** Méthode prévue par la convention du pays de situation des immeubles. */
  methodeElimination?: MethodeElimination;
  /**
   * Les revenus de source étrangère supportent-ils les prélèvements sociaux
   * français ? Dépend de la convention ET de l'affiliation sociale du
   * contribuable — à vérifier au cas par cas. Par défaut : non sous la méthode
   * du taux effectif (revenu exonéré), oui sous celle du crédit d'impôt.
   */
  prelevementsSociauxSurEtranger?: boolean;
}

export interface ScpiFiscaliteResult {
  /** Impôt sur le revenu du foyer en l'absence de revenus de SCPI. */
  impotSansScpi: number;
  /** Impôt sur le revenu dû après élimination de la double imposition. */
  impotAvecScpi: number;
  /** Supplément d'impôt sur le revenu imputable aux SCPI. */
  supplementImpotRevenu: number;
  /** Crédit d'impôt accordé (méthode du crédit d'impôt uniquement). */
  creditImpot: number;
  /** Prélèvements sociaux dus sur les revenus de SCPI. */
  prelevementsSociaux: number;
  /** Total des prélèvements imputables aux SCPI (IR + PS). */
  prelevementsTotaux: number;
  /** Revenus de SCPI encaissés, nets de tout prélèvement. */
  revenuNet: number;
  /** Part des revenus de SCPI absorbée par l'impôt et les prélèvements. */
  tauxPrelevementGlobal: number;
  /** Tranche marginale d'imposition du foyer, SCPI comprises. */
  tmi: number;
}

function assiettePS(input: ScpiFiscaliteInput): number {
  const france = Math.max(0, input.revenusFrance ?? 0);
  const etranger = Math.max(0, input.revenusEtranger ?? 0);
  const methode = input.methodeElimination ?? "taux effectif";
  const psEtranger =
    input.prelevementsSociauxSurEtranger ?? methode === "crédit d'impôt";
  return france + (psEtranger ? etranger : 0);
}

/** Impôt et prélèvements sociaux dus au titre des revenus de SCPI. */
export function fiscaliteScpi(
  input: ScpiFiscaliteInput,
  engine: Engine = creerMoteur(),
): ScpiFiscaliteResult {
  const france = Math.max(0, input.revenusFrance ?? 0);
  const etranger = Math.max(0, input.revenusEtranger ?? 0);
  const autres = Math.max(0, input.autresRevenus);
  const methode = input.methodeElimination ?? "taux effectif";
  const commun = { situation: input.situation, nbEnfants: input.nbEnfants };

  const sansScpi = impotRevenu({ revenuNetImposable: autres, ...commun }, engine);

  // Le revenu mondial sert dans les deux méthodes : il fixe le taux, que le
  // revenu étranger soit exonéré (taux effectif) ou neutralisé par un crédit.
  const revenuMondial = autres + france + etranger;
  const mondial = impotRevenu(
    { revenuNetImposable: revenuMondial, ...commun },
    creerMoteur(),
  );

  const partEtrangere = revenuMondial > 0 ? etranger / revenuMondial : 0;
  const creditImpot =
    methode === "crédit d'impôt" ? round2(mondial.impotNet * partEtrangere) : 0;

  const impotAvecScpi =
    methode === "crédit d'impôt"
      ? round2(mondial.impotNet - creditImpot)
      : // Taux effectif : l'impôt du revenu mondial, ramené à la part imposable
        // en France (BOI-IR-LIQ-20-30-30).
        round2(mondial.impotNet * (1 - partEtrangere));

  const prelevementsSociaux = round2(assiettePS(input) * PRELEVEMENTS_SOCIAUX);
  const supplementImpotRevenu = round2(impotAvecScpi - sansScpi.impotNet);
  const prelevementsTotaux = round2(supplementImpotRevenu + prelevementsSociaux);
  const brut = france + etranger;

  return {
    impotSansScpi: sansScpi.impotNet,
    impotAvecScpi,
    supplementImpotRevenu,
    creditImpot,
    prelevementsSociaux,
    prelevementsTotaux,
    revenuNet: round2(brut - prelevementsTotaux),
    tauxPrelevementGlobal: brut > 0 ? prelevementsTotaux / brut : 0,
    tmi: mondial.tmi,
  };
}

export interface ComparaisonScpi {
  /** Résultat si la totalité des revenus est de source française. */
  france: ScpiFiscaliteResult;
  /** Résultat si la totalité des revenus est de source étrangère. */
  etranger: ScpiFiscaliteResult;
  /** Écart de revenu net, en euros, en faveur de la SCPI européenne. */
  ecartRevenuNet: number;
  /** Écart de taux de prélèvement, en points. */
  ecartTauxPrelevement: number;
}

/**
 * Compare, à revenu distribué identique, une SCPI française et une SCPI
 * européenne. C'est la seule question qui compte pour l'épargnant, et l'écart
 * ne devient significatif qu'à tranche marginale élevée : à faible TMI il fond,
 * voire s'inverse.
 */
export function comparerScpiFranceEtranger(
  input: Omit<ScpiFiscaliteInput, "revenusFrance" | "revenusEtranger"> & {
    revenusScpi: number;
  },
): ComparaisonScpi {
  const { revenusScpi, ...commun } = input;
  const france = fiscaliteScpi({ ...commun, revenusFrance: revenusScpi });
  const etranger = fiscaliteScpi({ ...commun, revenusEtranger: revenusScpi });

  return {
    france,
    etranger,
    ecartRevenuNet: round2(etranger.revenuNet - france.revenuNet),
    ecartTauxPrelevement:
      france.tauxPrelevementGlobal - etranger.tauxPrelevementGlobal,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
