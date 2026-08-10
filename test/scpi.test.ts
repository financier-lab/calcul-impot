import { describe, expect, it } from "vitest";

import { impotRevenu } from "../src/impot-revenu";
import {
  PRELEVEMENTS_SOCIAUX,
  comparerScpiFranceEtranger,
  fiscaliteScpi,
} from "../src/scpi";

describe("SCPI française — revenus fonciers", () => {
  it("ajoute les loyers au revenu imposable et applique les prélèvements sociaux", () => {
    const r = fiscaliteScpi({
      autresRevenus: 60_000,
      situation: "seul",
      revenusFrance: 10_000,
    });

    const sans = impotRevenu({ revenuNetImposable: 60_000, situation: "seul" });
    const avec = impotRevenu({ revenuNetImposable: 70_000, situation: "seul" });

    expect(r.impotSansScpi).toBeCloseTo(sans.impotNet, 2);
    expect(r.impotAvecScpi).toBeCloseTo(avec.impotNet, 2);
    expect(r.prelevementsSociaux).toBeCloseTo(10_000 * PRELEVEMENTS_SOCIAUX, 2);
    expect(r.creditImpot).toBe(0);
  });

  it("taxe le loyer à la tranche marginale, prélèvements sociaux compris", () => {
    // Dans la tranche à 30 %, le loyer français supporte 30 % + 17,2 % = 47,2 %.
    const r = fiscaliteScpi({
      autresRevenus: 60_000,
      situation: "seul",
      revenusFrance: 5_000,
    });
    expect(r.tmi).toBeCloseTo(0.3, 4);
    expect(r.tauxPrelevementGlobal).toBeCloseTo(0.3 + PRELEVEMENTS_SOCIAUX, 3);
  });

  it("ne prélève rien en l'absence de revenus de SCPI", () => {
    const r = fiscaliteScpi({ autresRevenus: 60_000, situation: "seul" });
    expect(r.prelevementsTotaux).toBe(0);
    expect(r.tauxPrelevementGlobal).toBe(0);
  });
});

describe("les deux méthodes d'élimination donnent le même impôt sur le revenu", () => {
  // Le taux effectif exonère en conservant la progressivité ; le crédit d'impôt
  // impose puis neutralise. Les deux reviennent à IR(mondial) × part française.
  it.each([
    [40_000, 8_000],
    [90_000, 25_000],
    [150_000, 60_000],
  ])("à %i € d'autres revenus et %i € de loyers étrangers", (autres, etranger) => {
    const commun = { autresRevenus: autres, situation: "couple" as const, nbEnfants: 2 };
    const tauxEffectif = fiscaliteScpi({
      ...commun,
      revenusEtranger: etranger,
      methodeElimination: "taux effectif",
    });
    const credit = fiscaliteScpi({
      ...commun,
      revenusEtranger: etranger,
      methodeElimination: "crédit d'impôt",
    });

    expect(credit.impotAvecScpi).toBeCloseTo(tauxEffectif.impotAvecScpi, 2);
    // Le crédit n'existe que sous la seconde méthode, et vaut l'impôt du revenu étranger.
    expect(tauxEffectif.creditImpot).toBe(0);
    expect(credit.creditImpot).toBeGreaterThan(0);
  });

  it("mais pas les mêmes prélèvements sociaux par défaut", () => {
    const commun = { autresRevenus: 90_000, situation: "seul" as const, revenusEtranger: 20_000 };
    expect(
      fiscaliteScpi({ ...commun, methodeElimination: "taux effectif" }).prelevementsSociaux,
    ).toBe(0);
    expect(
      fiscaliteScpi({ ...commun, methodeElimination: "crédit d'impôt" }).prelevementsSociaux,
    ).toBeCloseTo(20_000 * PRELEVEMENTS_SOCIAUX, 2);
  });

  it("laisse forcer le traitement social, qui dépend de la situation du contribuable", () => {
    const r = fiscaliteScpi({
      autresRevenus: 90_000,
      situation: "seul",
      revenusEtranger: 20_000,
      methodeElimination: "taux effectif",
      prelevementsSociauxSurEtranger: true,
    });
    expect(r.prelevementsSociaux).toBeCloseTo(20_000 * PRELEVEMENTS_SOCIAUX, 2);
  });
});

describe("progressivité conservée", () => {
  it("le revenu étranger exonéré relève tout de même le taux des autres revenus", () => {
    // C'est tout l'intérêt de la règle du taux effectif : exonéré ne veut pas
    // dire invisible.
    const sansEtranger = impotRevenu({ revenuNetImposable: 60_000, situation: "seul" });
    const avecEtranger = fiscaliteScpi({
      autresRevenus: 60_000,
      situation: "seul",
      revenusEtranger: 40_000,
      methodeElimination: "taux effectif",
    });
    expect(avecEtranger.impotAvecScpi).toBeGreaterThan(sansEtranger.impotNet);
  });
});

describe("comparaison France / Europe à revenu distribué égal", () => {
  it("avantage la SCPI européenne à tranche marginale élevée", () => {
    const c = comparerScpiFranceEtranger({
      autresRevenus: 150_000,
      situation: "seul",
      revenusScpi: 20_000,
    });
    expect(c.ecartRevenuNet).toBeGreaterThan(0);
    expect(c.ecartTauxPrelevement).toBeGreaterThan(0);
  });

  it("réduit l'écart à tranche marginale faible", () => {
    const eleve = comparerScpiFranceEtranger({
      autresRevenus: 150_000,
      situation: "seul",
      revenusScpi: 10_000,
    });
    const faible = comparerScpiFranceEtranger({
      autresRevenus: 20_000,
      situation: "seul",
      revenusScpi: 10_000,
    });
    // L'avantage international n'existe que pour qui l'impôt français frappe le plus.
    expect(faible.ecartTauxPrelevement).toBeLessThan(eleve.ecartTauxPrelevement);
  });
});
