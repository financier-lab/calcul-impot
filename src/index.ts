/**
 * calcul-impot — simulateurs fiscaux français open source.
 *
 * - `impot-revenu` : moteur publicodes de l'impôt sur le revenu, règles
 *   référencées article par article (CGI, BOFiP).
 * - `frontalier-suisse` : frontaliers franco-suisses — accord de 1983 vs
 *   impôt à la source (barème officiel GE 2026), avec contrefactuel.
 * - `scpi` : fiscalité des revenus de SCPI françaises et européennes —
 *   revenus fonciers, prélèvements sociaux, méthodes d'élimination de la
 *   double imposition, comparatif France / Europe à revenu égal.
 */
export * from "./impot-revenu";
export * from "./frontalier-suisse";
export * from "./scpi";
