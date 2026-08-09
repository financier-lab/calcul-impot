import { describe, expect, it } from "vitest";
import {
  CANTONS_ACCORD_1983,
  FX_CHF_EUR,
  codeBaremeGeneve,
  cotisationsSuisses,
  frontalierSuisse,
  tauxSourceGeneve,
} from "../src/index";

describe("tauxSourceGeneve (barème officiel ESTV 2026)", () => {
  it("A0 à 7 500 CHF/mois (90 000/an) = 12,33 % — repère de contrôle du générateur", () => {
    expect(tauxSourceGeneve("A0", 7_500)).toBeCloseTo(0.1233, 6);
  });

  it("est nul sous le seuil d'entrée du barème", () => {
    expect(tauxSourceGeneve("A0", 2_000)).toBe(0);
    expect(tauxSourceGeneve("B2", 5_000)).toBe(0);
  });

  it("croît avec le revenu et décroît avec les enfants", () => {
    expect(tauxSourceGeneve("A0", 12_000)).toBeGreaterThan(tauxSourceGeneve("A0", 7_500));
    expect(tauxSourceGeneve("A2", 7_500)).toBeLessThan(tauxSourceGeneve("A0", 7_500));
    expect(tauxSourceGeneve("B2", 10_000)).toBeLessThan(tauxSourceGeneve("C2", 10_000));
  });

  it("au-delà de la grille embarquée, applique le dernier taux connu", () => {
    expect(tauxSourceGeneve("A0", 60_000)).toBeGreaterThanOrEqual(
      tauxSourceGeneve("A0", 39_950),
    );
  });
});

describe("codeBaremeGeneve", () => {
  it("route seul→A, couple mono-revenu→B, couple bi-revenus→C, enfants plafonnés à 5", () => {
    expect(codeBaremeGeneve("seul", 0)).toBe("A0");
    expect(codeBaremeGeneve("couple", 2, false)).toBe("B2");
    expect(codeBaremeGeneve("couple", 2, true)).toBe("C2");
    expect(codeBaremeGeneve("seul", 9)).toBe("A5");
  });
});

describe("cotisationsSuisses", () => {
  it("applique AVS non plafonnée, AC/AANP plafonnées à 148 200 CHF", () => {
    const c = cotisationsSuisses(200_000, "35-44");
    expect(c.avs).toBeCloseTo(200_000 * 0.053, 2);
    expect(c.ac).toBeCloseTo(148_200 * 0.011, 2);
    expect(c.aanp).toBeCloseTo(148_200 * 0.012, 2);
  });

  it("LPP : nulle sous le seuil d'entrée, salaire coordonné plafonné, croît avec l'âge", () => {
    expect(cotisationsSuisses(20_000).lpp).toBe(0);
    const jeune = cotisationsSuisses(100_000, "25-34").lpp;
    const senior = cotisationsSuisses(100_000, "55-65").lpp;
    expect(senior).toBeGreaterThan(jeune);
    // 100 000 − 26 460 = 73 540 > plafond 64 260 → coordonné plafonné
    expect(cotisationsSuisses(100_000, "35-44").lpp).toBeCloseTo((64_260 * 0.1) / 2, 2);
  });
});

describe("frontalierSuisse — régime accord 1983", () => {
  const base = {
    salaireBrutCHF: 100_000,
    situation: "seul" as const,
    assuranceMaladie: "CMU" as const,
  };

  it("VD : aucune retenue suisse, impôt français dû, CMU calculée", () => {
    const r = frontalierSuisse({ ...base, cantonTravail: "VD" });
    expect(r.resultat.regime).toBe("accord-1983");
    expect(r.resultat.retenueSuisseCHF).toBe(0);
    expect(r.resultat.impotFranceEUR).toBeGreaterThan(0);
    expect(r.resultat.maladieEUR).toBeGreaterThan(0);
    expect(r.avertissements).toContain("nuitees-45");
    expect(r.avertissements).toContain("csg-patrimoine-cmu");
  });

  it("le contrefactuel est le régime source GE, sur le même net", () => {
    const r = frontalierSuisse({ ...base, cantonTravail: "NE" });
    expect(r.contrefactuel?.regime).toBe("source-geneve");
    expect(r.contrefactuel?.retenueSuisseCHF).toBeGreaterThan(0);
  });

  it("LAMal : la cotisation maladie est la prime saisie, convertie", () => {
    const r = frontalierSuisse({
      ...base,
      cantonTravail: "VD",
      assuranceMaladie: "LAMAL",
      primeLamalMensuelleCHF: 300,
    });
    expect(r.resultat.maladieEUR).toBe(Math.round(300 * 12 * FX_CHF_EUR));
  });

  it("tous les cantons de l'accord routent sur le moteur France", () => {
    for (const canton of CANTONS_ACCORD_1983) {
      expect(frontalierSuisse({ ...base, cantonTravail: canton }).resultat.regime).toBe(
        "accord-1983",
      );
    }
  });
});

describe("frontalierSuisse — régime source (Genève)", () => {
  const base = {
    cantonTravail: "GE" as const,
    salaireBrutCHF: 90_000,
    situation: "seul" as const,
    assuranceMaladie: "CMU" as const,
  };

  it("applique le barème A0 au brut : 90 000 × 12,33 %", () => {
    const r = frontalierSuisse(base);
    expect(r.resultat.regime).toBe("source-geneve");
    expect(r.resultat.codeBaremeGE).toBe("A0");
    expect(r.resultat.tauxSourceGE).toBeCloseTo(0.1233, 6);
    expect(r.resultat.retenueSuisseCHF).toBe(Math.round(90_000 * 0.1233));
  });

  it("sans autres revenus, le crédit d'impôt annule l'impôt français", () => {
    expect(frontalierSuisse(base).resultat.impotFranceEUR).toBe(0);
  });

  it("avec d'autres revenus, il reste l'effet de taux (0 < IR dû < IR total)", () => {
    const r = frontalierSuisse({ ...base, autresRevenusFoyerEUR: 20_000 });
    expect(r.resultat.impotFranceEUR).toBeGreaterThan(0);
    const irSeul = frontalierSuisse({
      ...base,
      salaireBrutCHF: 0,
      autresRevenusFoyerEUR: 20_000,
    });
    expect(r.resultat.impotFranceEUR).toBeLessThan(
      irSeul.contrefactuel!.impotFranceEUR + r.resultat.retenueSuisseCHF!,
    );
  });

  it("le contrefactuel accord permet la comparaison sur le même salaire", () => {
    const r = frontalierSuisse(base);
    expect(r.contrefactuel?.regime).toBe("accord-1983");
    expect(r.contrefactuel?.netFinalEUR).not.toBeNull();
  });
});

describe("frontalierSuisse — canton hors accord ≠ GE", () => {
  it("aucun chiffre suisse inventé : retenue et totaux null, avertissement dédié", () => {
    const r = frontalierSuisse({
      cantonTravail: "AUTRE",
      salaireBrutCHF: 120_000,
      situation: "couple",
      conjointTravaille: true,
      assuranceMaladie: "LAMAL",
      primeLamalMensuelleCHF: 400,
    });
    expect(r.resultat.regime).toBe("source-autre-canton");
    expect(r.resultat.retenueSuisseCHF).toBeNull();
    expect(r.resultat.totalPrelevementsEUR).toBeNull();
    expect(r.resultat.netFinalEUR).toBeNull();
    expect(r.contrefactuel).toBeNull();
    expect(r.avertissements).toContain("canton-autre-sans-bareme");
  });
});

describe("avertissements télétravail", () => {
  it("> 40 % fiscal, ≥ 50 % social", () => {
    const base = {
      cantonTravail: "GE" as const,
      salaireBrutCHF: 90_000,
      situation: "seul" as const,
      assuranceMaladie: "LAMAL" as const,
    };
    expect(frontalierSuisse({ ...base, teletravailPct: 0.3 }).avertissements).not.toContain(
      "teletravail-fiscal-40",
    );
    const r45 = frontalierSuisse({ ...base, teletravailPct: 0.45 }).avertissements;
    expect(r45).toContain("teletravail-fiscal-40");
    expect(r45).not.toContain("teletravail-social-50");
    expect(frontalierSuisse({ ...base, teletravailPct: 0.5 }).avertissements).toContain(
      "teletravail-social-50",
    );
  });
});
