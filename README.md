# calcul-impot

[![CI](https://github.com/financier-lab/calcul-impot/actions/workflows/ci.yml/badge.svg)](https://github.com/financier-lab/calcul-impot/actions/workflows/ci.yml)

**Simulateurs fiscaux français open source, cités article par article.**

Ce dépôt contient les règles de calcul qui alimentent les simulateurs de
[calcul-impot.com](https://calcul-impot.com). Les règles sont écrites en
[publicodes](https://publi.codes) — le langage déclaratif utilisé par
[mon-entreprise.urssaf.fr](https://mon-entreprise.urssaf.fr) et le
[Code du travail numérique](https://code.travail.gouv.fr) — ce qui garantit
deux propriétés :

1. **Chaque paramètre cite sa source légale.** Tranche du barème, plafond du
   quotient familial, forfait de décote : chaque règle porte ses `références:`
   vers l'article du CGI sur Légifrance, le BOFiP ou service-public.fr.
2. **Chaque résultat est explicable.** Le moteur publicodes produit l'arbre de
   calcul complet, pas seulement le montant final.

## Pourquoi

Les simulateurs d'impôt disponibles en ligne sont des boîtes noires : aucun ne
publie son code de calcul, rares sont ceux qui citent leurs sources. Ce dépôt
prend le parti inverse — le même que la DGFiP, qui publie le
[code source M de sa calculette](https://framagit.org/dgfip/ir-calcul), et que
l'[Institut des Politiques Publiques](https://www.ipp.eu/en/ipp-tax-and-benefit-tables/),
qui documente chaque barème avec sa référence au JORF.

## Contenu

| Module | Règles | Périmètre |
|---|---|---|
| Impôt sur le revenu 2026 (revenus 2025) | [`regles/impot-revenu/2026.yaml`](regles/impot-revenu/2026.yaml) | Barème progressif, quotient familial (parts standard), plafonnement de l'avantage, décote |

À venir (feuille de route) : plus-values immobilières, PFU vs barème, droits de
succession et donation, IFI, prélèvement à la source, impôt belge (IPP) et
comparateurs transfrontaliers (Suisse, Luxembourg, Belgique, Andorre).

### Limites du périmètre actuel

Le module IR ne modélise pas encore : parent isolé (case T), demi-parts
invalidité / anciens combattants, réductions et crédits d'impôt, contribution
exceptionnelle sur les hauts revenus. Le résultat est l'impôt **avant**
réductions et crédits d'impôt. Pour une situation complète, le
[simulateur officiel de la DGFiP](https://www.impots.gouv.fr/simulateurs) fait foi.

## Utilisation

```ts
import { impotRevenu } from "calcul-impot";

const r = impotRevenu({
  revenuNetImposable: 60_000,
  situation: "couple",
  nbEnfants: 2,
});
// { parts: 3, impotBrut: 2772, decote: 229, impotNet: 2543,
//   tmi: 0.11, tauxMoyen: 0.042…, plafonnementApplique: false }
```

Ou directement avec le moteur publicodes, pour accéder à l'arbre d'explication :

```ts
import Engine from "publicodes";
import { regles } from "calcul-impot";

const engine = new Engine(regles);
engine.setSituation({ "foyer . revenu net imposable": "60000 €" });
engine.evaluate("impôt . net");
```

## Validation

- Les cas de référence sont vérifiés à l'euro près contre une implémentation
  de référence indépendante (TypeScript impératif), plus un balayage de
  190 combinaisons revenu × situation × enfants (`npm test`).
- Feuille de route : validation continue contre le
  [simulateur officiel](https://simulateur-ir-ifi.impots.gouv.fr/calcul_impot/2026/)
  et l'API [OpenFisca-France](https://github.com/openfisca/openfisca-france),
  avec [ir-calcul](https://framagit.org/dgfip/ir-calcul) (le code source de la
  calculette DGFiP) comme référence ultime.

## Sources de paramètres

- [CGI, art. 197](https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000051212954) — barème, plafonnement du quotient familial, décote
- [CGI, art. 193](https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000033844057) et [art. 194](https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000033817781) — quotient familial et parts
- [Barèmes IPP](https://www.ipp.eu/en/ipp-tax-and-benefit-tables/) — historique des paramètres socio-fiscaux, référencé au JORF
- [BOFiP](https://bofip.impots.gouv.fr/) — doctrine administrative

Une erreur, un paramètre obsolète, un article mal cité ? Ouvrez une issue —
c'est exactement ce pour quoi ce dépôt est public.

## Licence

[MIT](LICENSE). Les données de paramètres légaux sont des données publiques
(Légifrance / barèmes IPP sous Licence Ouverte).
