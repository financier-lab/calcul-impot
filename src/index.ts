/**
 * calcul-impot — moteur de calcul de l'impôt sur le revenu français,
 * fondé sur des règles publicodes référencées article par article.
 *
 * L'API haut niveau `impotRevenu()` reproduit le contrat d'un calculateur
 * classique ; `creerMoteur()` expose le moteur publicodes complet (situation,
 * évaluation rule par rule, arbre d'explication).
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import Engine from "publicodes";
import { parse } from "yaml";

const reglesPath = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "regles",
  "impot-revenu",
  "2026.yaml",
);

/** Règles publicodes (barème 2026, revenus 2025), références légales incluses. */
export const regles = parse(readFileSync(reglesPath, "utf8"));

export const IR_YEAR = 2026;

export type Situation = "seul" | "couple";

export interface ImpotRevenuInput {
  /** Revenu net imposable du foyer (après abattement de 10 %). */
  revenuNetImposable: number;
  /** seul = célibataire/divorcé/veuf ; couple = marié/pacsé (imposition commune). */
  situation: Situation;
  /** Nombre d'enfants à charge (parts standard). */
  nbEnfants?: number;
}

export interface ImpotRevenuResult {
  parts: number;
  /** Impôt brut après barème + plafonnement du quotient familial. */
  impotBrut: number;
  /** Réduction « décote » appliquée (0 si non éligible). */
  decote: number;
  /** Impôt net dû (avant réductions/crédits d'impôt). */
  impotNet: number;
  /** Taux moyen d'imposition = impotNet / revenu. */
  tauxMoyen: number;
  /** Tranche marginale d'imposition (taux de la dernière tranche atteinte). */
  tmi: number;
  /** Le plafonnement du quotient familial a-t-il joué ? */
  plafonnementApplique: boolean;
}

export function creerMoteur(): Engine {
  return new Engine(regles);
}

function evalNombre(engine: Engine, regle: string): number {
  const v = engine.evaluate(regle).nodeValue;
  return typeof v === "number" ? v : 0;
}

export function impotRevenu(
  input: ImpotRevenuInput,
  engine: Engine = creerMoteur(),
): ImpotRevenuResult {
  const revenu = Math.max(0, input.revenuNetImposable);
  const nbEnfants = Math.max(0, Math.floor(input.nbEnfants ?? 0));

  engine.setSituation({
    "foyer . revenu net imposable": `${revenu} €`,
    "foyer . imposition commune": input.situation === "couple" ? "oui" : "non",
    "foyer . enfants à charge": nbEnfants,
  });

  return {
    parts: evalNombre(engine, "foyer . parts"),
    impotBrut: evalNombre(engine, "impôt . brut"),
    decote: evalNombre(engine, "impôt . décote"),
    impotNet: evalNombre(engine, "impôt . net"),
    tauxMoyen: evalNombre(engine, "impôt . taux moyen"),
    // publicodes renvoie les pourcentages dans leur unité (30 pour « 30 % »).
    tmi: evalNombre(engine, "impôt . taux marginal") / 100,
    plafonnementApplique:
      engine.evaluate("impôt . plafonnement applicable").nodeValue === true,
  };
}
