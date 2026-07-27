import { describe, expect, it } from "vitest";

import { creerMoteur, impotRevenu, regles, type Situation } from "../src/index";
import { impotRevenuReference } from "./reference";

// Un seul moteur partagé : setSituation() réinitialise la situation à chaque
// appel, et la création du moteur est la partie coûteuse.
const engine = creerMoteur();

describe("impotRevenu — cas de référence (barème 2026)", () => {
  it("célibataire, 30 000 € : 2 104 € (TMI 30 %)", () => {
    const r = impotRevenu({ revenuNetImposable: 30_000, situation: "seul" }, engine);
    // 11 600–29 579 @11 % = 1 977,69 ; 29 579–30 000 @30 % = 126,30 → 2 104
    expect(r.parts).toBe(1);
    expect(r.impotBrut).toBe(2104);
    expect(r.decote).toBe(0);
    expect(r.impotNet).toBe(2104);
    expect(r.tmi).toBe(0.3);
  });

  it("revenu sous la première tranche : impôt nul", () => {
    const r = impotRevenu({ revenuNetImposable: 11_000, situation: "seul" }, engine);
    expect(r.impotNet).toBe(0);
    expect(r.tmi).toBe(0);
  });

  it("couple + 2 enfants, 60 000 € : décote appliquée, QF non plafonné", () => {
    const r = impotRevenu(
      { revenuNetImposable: 60_000, situation: "couple", nbEnfants: 2 },
      engine,
    );
    // parts 3 ; barème(20 000) × 3 = 924 × 3 = 2 772 ; décote couple =
    // round(1 483 − 45,25 % × 2 772) = 229 ; net = 2 543
    expect(r.parts).toBe(3);
    expect(r.impotBrut).toBe(2772);
    expect(r.plafonnementApplique).toBe(false);
    expect(r.decote).toBe(229);
    expect(r.impotNet).toBe(2543);
    expect(r.tmi).toBe(0.11);
  });

  it("hauts revenus + enfants : le plafonnement du quotient familial joue", () => {
    const r = impotRevenu(
      { revenuNetImposable: 200_000, situation: "couple", nbEnfants: 2 },
      engine,
    );
    expect(r.plafonnementApplique).toBe(true);
    expect(r.tmi).toBe(0.3); // 200 000 / 3 parts ≈ 66 667 € → tranche à 30 %
  });

  it("taux moyen cohérent (0 < taux < TMI)", () => {
    const r = impotRevenu({ revenuNetImposable: 50_000, situation: "seul" }, engine);
    expect(r.tauxMoyen).toBeGreaterThan(0);
    expect(r.tauxMoyen).toBeLessThan(r.tmi);
  });
});

describe("impotRevenu — équivalence avec l'implémentation de référence", () => {
  const revenus = [
    0, 5_000, 11_600, 15_000, 20_000, 29_579, 30_000, 40_000, 50_000, 60_000,
    75_000, 84_577, 100_000, 120_000, 150_000, 181_917, 200_000, 250_000, 300_000,
  ];
  const situations: Situation[] = ["seul", "couple"];
  const enfants = [0, 1, 2, 3, 4];

  for (const situation of situations) {
    for (const nbEnfants of enfants) {
      it(`${situation}, ${nbEnfants} enfant(s) — balayage des revenus`, () => {
        for (const revenuNetImposable of revenus) {
          const input = { revenuNetImposable, situation, nbEnfants };
          const attendu = impotRevenuReference(input);
          const obtenu = impotRevenu(input, engine);

          expect(obtenu.parts).toBe(attendu.parts);
          expect(obtenu.plafonnementApplique).toBe(attendu.plafonnementApplique);
          expect(obtenu.tmi).toBeCloseTo(attendu.tmi, 10);
          // Tolérance de 1 € : ordres d'arrondi potentiellement différents.
          expect(Math.abs(obtenu.impotBrut - attendu.impotBrut)).toBeLessThanOrEqual(1);
          expect(Math.abs(obtenu.decote - attendu.decote)).toBeLessThanOrEqual(1);
          expect(Math.abs(obtenu.impotNet - attendu.impotNet)).toBeLessThanOrEqual(1);
        }
      });
    }
  }
});

describe("règles publicodes — références légales", () => {
  it("chaque paramètre chiffré cite au moins une référence", () => {
    const reglesACiter = [
      "impôt . droits simples",
      "impôt . plafond de l'avantage",
      "impôt . décote . forfait",
      "foyer . parts enfants",
    ];
    for (const nom of reglesACiter) {
      expect(regles[nom]?.références, `références manquantes : ${nom}`).toBeTruthy();
    }
  });
});
