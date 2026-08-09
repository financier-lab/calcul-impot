#!/usr/bin/env python3
"""Régénère src/data/geneve-baremes-2026.ts depuis le fichier officiel ESTV.

Usage :
    python3 scripts/generate-geneve-baremes.py

Télécharge tar26ge.zip (barèmes de l'impôt à la source GE 2026 pour systèmes
de comptabilité salariale, format fixe ESTV), extrait les codes A0–A5 (seul),
B0–B5 (couple mono-revenu), C0–C5 (couple bi-revenus), et émet une grille
compressée [seuil CHF/mois, taux %×100] (un point par changement de taux),
jusqu'à MAX_MONTHLY CHF/mois.

Format du fichier source (enregistrements « 06 ») :
    pos 4:9   code barème (ex. GEA0N)
    pos 24:33 revenu mensuel « depuis », en centimes
    pos 33:42 pas, en centimes
    pos 43:59 bloc [enfants (2) + taux %×100] — le taux s'applique au brut entier

À relancer chaque année (tarNNge.zip) ; contrôle : A0 à 7 500 CHF/mois = 12,33 %.
"""

import io
import urllib.request
import zipfile
from collections import defaultdict
from pathlib import Path

URL = "https://www.estv2.admin.ch/qst/2026/loehne/tar26ge.zip"
MAX_MONTHLY = 40_000.0
OUT = Path(__file__).resolve().parent.parent / "src" / "data" / "geneve-baremes-2026.ts"

HEADER = '''/**
 * Barèmes 2026 de perception de l'impôt à la source — canton de Genève.
 *
 * GÉNÉRÉ — ne pas éditer à la main. Source officielle : fichier ESTV/AFC
 * tar26ge.zip (barèmes pour systèmes de comptabilité salariale),
 * https://www.estv2.admin.ch/qst/2026/loehne/tar26ge.zip (état 03.12.2025),
 * référencé par ge.ch « Barèmes 2026 de perception pour salaires ».
 * Régénération : scripts/generate-geneve-baremes.py.
 *
 * Format : par code barème (A0–A5 personne seule, B0–B5 couple mono-revenu,
 * C0–C5 couple bi-revenus ; suffixe = enfants à charge), liste plate
 * [seuil CHF/mois, taux % ×100, …] compressée (un point par changement de
 * taux). Le taux s'applique au salaire BRUT mensuel entier (barème effectif).
 * Grille embarquée jusqu'à 40 000 CHF/mois ; au-delà, dernier taux connu.
 */
'''


def main() -> None:
    raw = urllib.request.urlopen(URL, timeout=60).read()
    with zipfile.ZipFile(io.BytesIO(raw)) as zf:
        text = zf.read(zf.namelist()[0]).decode("latin-1")

    rows: dict[str, list[tuple[float, int]]] = defaultdict(list)
    for line in text.splitlines():
        if not line.startswith("06"):
            continue
        code = line[6:8]  # A0…C5 (line[4:6] == "GE")
        if code[0] not in "ABC":
            continue
        income = int(line[24:33]) / 100.0
        rate = int(line[43:59][2:])  # % ×100, préfixe enfants retiré
        rows[code].append((income, rate))

    codes = sorted(rows)
    assert len(codes) == 18, codes
    lines = [HEADER, "export type CodeBaremeGE ="]
    lines.append("  " + " | ".join(f'"{c}"' for c in codes) + ";")
    lines.append("")
    lines.append("/** [seuil CHF/mois, taux %×100] aplatis par paires, seuils croissants. */")
    lines.append(
        "export const GENEVE_BAREMES_2026: Record<CodeBaremeGE, ReadonlyArray<number>> = {"
    )
    for code in codes:
        rle: list[str] = []
        prev = None
        for income, rate in sorted(rows[code]):
            if income > MAX_MONTHLY:
                break
            if rate != prev:
                rle += [f"{income:g}", str(rate)]
                prev = rate
        lines.append(f"  {code}: [{', '.join(rle)}],")
    lines.append("};")

    # contrôle : A0 à 7 500 CHF/mois = 12,33 % (repère spec / reproductions presse)
    a0 = sorted(rows["A0"])
    rate = 0
    for income, r in a0:
        if 7_500 >= income:
            rate = r
    assert rate == 1233, rate

    OUT.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"écrit {OUT} ({OUT.stat().st_size // 1024} KB, {len(codes)} codes)")


if __name__ == "__main__":
    main()
