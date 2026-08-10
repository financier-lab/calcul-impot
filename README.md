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
| Frontalier franco-suisse 2026 | [`src/frontalier-suisse.ts`](src/frontalier-suisse.ts) | Accord de 1983 (impôt en France) vs impôt à la source (barème officiel GE 2026 embarqué, [`src/data/geneve-baremes-2026.ts`](src/data/geneve-baremes-2026.ts)), cotisations suisses part salarié (AVS/AC/AANP/LPP), CMU frontalier vs LAMal, contrefactuel entre les deux régimes |
| Fiscalité des SCPI 2026 | [`src/scpi.ts`](src/scpi.ts) | Revenus fonciers français (barème + prélèvements sociaux à 17,2 %), SCPI européennes et méthodes d'élimination de la double imposition (taux effectif, crédit d'impôt égal à l'impôt français), comparatif France / Europe à revenu distribué égal |

**Les deux méthodes d'élimination donnent le même impôt sur le revenu.** Le taux
effectif exonère en conservant la progressivité, le crédit d'impôt impose puis
neutralise ; les deux reviennent à `IR(revenu mondial) × part française`. Le
[test](test/scpi.test.ts) le vérifie sur plusieurs profils. Leur différence
pratique se joue sur les **prélèvements sociaux**, d'où le paramètre dédié —
dont le traitement dépend de la convention et de l'affiliation sociale du
contribuable, et reste donc explicite plutôt que deviné.

Le barème genevois est ingéré depuis le fichier officiel ESTV
([tar26ge.zip](https://www.estv2.admin.ch/qst/2026/loehne/tar26ge.zip)) et
régénérable à l'identique : [`scripts/generate-geneve-baremes.py`](scripts/generate-geneve-baremes.py).

À venir (feuille de route) : plus-values immobilières, PFU vs barème, droits de
succession et donation, IFI, prélèvement à la source, impôt belge (IPP) et
autres comparateurs transfrontaliers (Luxembourg, Belgique, Andorre).

### Limites du périmètre actuel

Le module IR ne modélise pas encore : parent isolé (case T), demi-parts
invalidité / anciens combattants, réductions et crédits d'impôt, contribution
exceptionnelle sur les hauts revenus. Le résultat est l'impôt **avant**
réductions et crédits d'impôt. Pour une situation complète, le
[simulateur officiel de la DGFiP](https://www.impots.gouv.fr/simulateurs) fait foi.

Le module frontalier (v1) ne modélise pas : statut de quasi-résident genevois
(TOU), impôt sur la fortune, rachats LPP et 3e pilier, barèmes source des
cantons hors accord autres que Genève, année d'arrivée ou de départ en cours
d'année. Le télétravail (seuils 40 % fiscal / 50 % social) déclenche des
avertissements mais n'entre pas dans le calcul.

Le module SCPI (v1) ne modélise pas : régime du micro-foncier (abattement de
30 %), déficit foncier et charges déductibles, CSG déductible de 6,8 points
l'année suivante, impôt étranger effectivement acquitté en amont par la SCPI,
parts détenues en assurance-vie ou démembrées, IFI. Les revenus saisis sont des
revenus **nets de charges**, tels que reportés par la SCPI.

Les paramètres transverses (PASS, SMIC, prélèvements sociaux, plafonds
d'épargne réglementée) vivent dans
[`financier-lab/baremes`](https://github.com/financier-lab/baremes) ; les règles
de retraite et de prévoyance dans
[`financier-lab/regles-sociales`](https://github.com/financier-lab/regles-sociales).

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

Frontalier franco-suisse — le résultat inclut toujours le contrefactuel
(même salaire sous l'autre régime) :

```ts
import { frontalierSuisse } from "calcul-impot";

const r = frontalierSuisse({
  cantonTravail: "GE", // ou VD, VS, NE, JU, BE, SO, BS, BL (accord 1983)
  salaireBrutCHF: 90_000,
  situation: "seul",
  assuranceMaladie: "CMU",
});
// r.resultat      → régime source GE : retenue suisse (barème A0, 12,33 %),
//                   impôt français résiduel, cotisation CMU, net final EUR
// r.contrefactuel → le même poste sous le régime de l'accord de 1983
// r.avertissements → télétravail, nuitées, CSG sur revenus du patrimoine…
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

Frontalier franco-suisse :

- [Convention fiscale franco-suisse de 1966, art. 25 A](https://bofip.impots.gouv.fr/bofip/3592-PGP.html/identifiant%3DBOI-INT-CVB-CHE-10-20-60-20230222) (BOI-INT-CVB-CHE-10-20-60) — élimination de la double imposition, crédit d'impôt
- [impots.gouv.fr — « Je suis frontalier franco-suisse »](https://www.impots.gouv.fr/particulier/questions/je-suis-frontalier-franco-suisse-ou-dois-je-payer-mes-impots) — accord de 1983 vs imposition à la source
- [ESTV — barèmes de l'impôt à la source 2026](https://www.estv.admin.ch/estv/fr/accueil/impot-federal-direct/impot-a-la-source.html) — fichier officiel `tar26ge` (canton de Genève)
- [URSSAF/CNTFS — assurance maladie des frontaliers](https://www.urssaf.fr/accueil/particulier/frontalier-suisse.html) — cotisation 8 % sur le RFR N−2 après abattement

Une erreur, un paramètre obsolète, un article mal cité ? Ouvrez une issue —
c'est exactement ce pour quoi ce dépôt est public.

## Licence

[MIT](LICENSE). Les données de paramètres légaux sont des données publiques
(Légifrance / barèmes IPP sous Licence Ouverte).
