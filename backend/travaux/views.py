import csv

from django.http import HttpResponse
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response

from .models import FicheTravaux
from .serializers import FicheTravauxSerializer
from secteurs.models import Secteur
from utils.csv_utils import (
    clean_str,
    csv_template_response,
    parse_decimal,
    parse_int,
    read_uploaded_csv,
)


class FicheTravauxViewSet(viewsets.ModelViewSet):
    queryset = (
        FicheTravaux.objects.all()
        .prefetch_related("secteurs_couverts", "consommables", "repartitions")
        .order_by("-id")
    )
    serializer_class = FicheTravauxSerializer

    @action(detail=False, methods=["get"], url_path="export")
    def export(self, request):
        # Export CSV (consommables + repartitions)
        response = HttpResponse(content_type="text/csv")
        response["Content-Disposition"] = "attachment; filename=travaux_export.csv"

        writer = csv.writer(response)
        writer.writerow(
            [
                "fiche_id",
                "superviseur_travaux",
                "nature_travaux",
                "superficie_couverte_ha",
                "periode_travaux",
                "nb_personnes",
                "secteurs_couverts_codes",
                "type_ligne",
                "designation",
                "nom_prenom",
                "nature_taches",
                "quantite",
                "unite",
                "prix_unitaire",
                "prix_total",
            ]
        )

        for fiche in self.get_queryset():
            secteurs_codes = ", ".join(list(fiche.secteurs_couverts.values_list("code", flat=True)))

            for c in fiche.consommables.all():
                prix_total = (c.quantite or 0) * (c.prix_unitaire or 0)
                writer.writerow(
                    [
                        fiche.id,
                        fiche.superviseur_travaux or "",
                        fiche.nature_travaux or "",
                        fiche.superficie_couverte_ha or "",
                        fiche.periode_travaux or "",
                        fiche.nb_personnes or "",
                        secteurs_codes,
                        "consommable",
                        c.designation,
                        "",
                        "",
                        c.quantite,
                        c.unite,
                        c.prix_unitaire,
                        prix_total,
                    ]
                )

            for r in fiche.repartitions.all():
                prix_total = (r.quantite or 0) * (r.prix_unitaire or 0)
                writer.writerow(
                    [
                        fiche.id,
                        fiche.superviseur_travaux or "",
                        fiche.nature_travaux or "",
                        fiche.superficie_couverte_ha or "",
                        fiche.periode_travaux or "",
                        fiche.nb_personnes or "",
                        secteurs_codes,
                        "tache",
                        r.nature_taches,
                        r.nom_prenom,
                        r.nature_taches,
                        r.quantite,
                        "",
                        r.prix_unitaire,
                        prix_total,
                    ]
                )

        return response

    @action(detail=False, methods=["get"], url_path="template")
    def template(self, request):
        # Modele CSV d'import (1 ligne = 1 consommable OU 1 tache)
        return csv_template_response(
            "travaux_template.csv",
            fieldnames=[
                "fiche_ref",
                "superviseur_travaux",
                "nature_travaux",
                "periode_travaux",
                "superficie_couverte_ha",
                "nb_personnes",
                "secteurs_couverts_codes",
                "observations",
                "type_ligne",
                "designation",
                "unite",
                "quantite",
                "prix_unitaire",
                "nom_prenom",
                "nature_taches",
            ],
            example_rows=[
                {
                    "fiche_ref": "TR001",
                    "superviseur_travaux": "S. Kone",
                    "nature_travaux": "Epandage engrais",
                    "periode_travaux": "2026-01-01 - 2026-01-15",
                    "superficie_couverte_ha": "3.50",
                    "nb_personnes": "12",
                    "secteurs_couverts_codes": "GP_1, GP_2",
                    "observations": "RAS",
                    "type_ligne": "consommable",
                    "designation": "Engrais NPK",
                    "unite": "kg",
                    "quantite": "250",
                    "prix_unitaire": "450",
                    "nom_prenom": "",
                    "nature_taches": "",
                },
                {
                    "fiche_ref": "TR001",
                    "superviseur_travaux": "S. Kone",
                    "nature_travaux": "Epandage engrais",
                    "periode_travaux": "2026-01-01 - 2026-01-15",
                    "superficie_couverte_ha": "3.50",
                    "nb_personnes": "12",
                    "secteurs_couverts_codes": "GP_1, GP_2",
                    "observations": "RAS",
                    "type_ligne": "tache",
                    "designation": "",
                    "unite": "",
                    "quantite": "2",
                    "prix_unitaire": "5000",
                    "nom_prenom": "Ouedraogo A.",
                    "nature_taches": "Epandage (main d'oeuvre)",
                },
            ],
        )

    @action(
        detail=False,
        methods=["post"],
        url_path="import",
        parser_classes=[MultiPartParser, FormParser],
    )
    def import_csv(self, request):
        f = request.FILES.get("file")
        if not f:
            return Response(
                {"detail": "Fichier requis (champ 'file')"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        rows = read_uploaded_csv(f)
        if not rows:
            return Response({"ok": True, "created": 0, "updated": 0, "errors": []})

        errors = []
        groups = {}

        def parse_secteurs(codes_raw: str, line_no: int):
            s = clean_str(codes_raw).replace(";", ",")
            codes = [c.strip() for c in s.split(",") if c.strip()]
            if not codes:
                errors.append({"line": line_no, "error": "secteurs_couverts_codes requis"})
                return []

            secteurs = list(Secteur.objects.filter(code__in=codes).values("id", "code"))
            found = {row["code"] for row in secteurs}
            missing = [c for c in codes if c not in found]
            if missing:
                errors.append({"line": line_no, "error": f"Secteur(s) introuvable(s): {', '.join(missing)}"})
                return []
            return [row["id"] for row in secteurs]

        for idx, row in enumerate(rows, start=2):
            fiche_ref = clean_str(row.get("fiche_ref"))
            superviseur = clean_str(row.get("superviseur_travaux"))
            nature = clean_str(row.get("nature_travaux"))
            periode = clean_str(row.get("periode_travaux"))

            if not superviseur:
                errors.append({"line": idx, "error": "superviseur_travaux requis"})
                continue
            if not nature:
                errors.append({"line": idx, "error": "nature_travaux requise"})
                continue
            if not periode:
                errors.append({"line": idx, "error": "periode_travaux requise (AAAA-MM-JJ - AAAA-MM-JJ)"})
                continue

            secteur_ids = parse_secteurs(row.get("secteurs_couverts_codes"), idx)
            if not secteur_ids:
                continue

            base = {
                "superviseur_travaux": superviseur,
                "nature_travaux": nature,
                "periode_travaux": periode,
                "superficie_couverte_ha": parse_decimal(row.get("superficie_couverte_ha")),
                "nb_personnes": parse_int(row.get("nb_personnes"), default=None),
                "observations": clean_str(row.get("observations")),
            }

            gkey = (superviseur, nature, periode, fiche_ref or "")
            if gkey not in groups:
                groups[gkey] = {"base": base, "secteurs": set(), "consommables": [], "repartitions": []}
            group = groups[gkey]
            group["secteurs"].update(int(sid) for sid in secteur_ids)

            type_ligne = clean_str(row.get("type_ligne")).lower()
            if not type_ligne:
                continue

            if type_ligne == "consommable":
                designation = clean_str(row.get("designation"))
                if not designation:
                    errors.append({"line": idx, "error": "designation requise (consommable)"})
                    continue
                quantite = parse_decimal(row.get("quantite"))
                prix_unitaire = parse_decimal(row.get("prix_unitaire"))
                if quantite is None:
                    errors.append({"line": idx, "error": "quantite requise (consommable)"})
                    continue
                if prix_unitaire is None:
                    errors.append({"line": idx, "error": "prix_unitaire requis (consommable)"})
                    continue

                group["consommables"].append(
                    {
                        "designation": designation,
                        "quantite": quantite,
                        "unite": clean_str(row.get("unite")),
                        "prix_unitaire": prix_unitaire,
                    }
                )
                continue

            if type_ligne == "tache":
                nom_prenom = clean_str(row.get("nom_prenom"))
                nature_taches = clean_str(row.get("nature_taches")) or clean_str(row.get("designation"))
                if not nom_prenom:
                    errors.append({"line": idx, "error": "nom_prenom requis (tache)"})
                    continue
                if not nature_taches:
                    errors.append({"line": idx, "error": "nature_taches requise (tache)"})
                    continue

                quantite = parse_decimal(row.get("quantite"))
                prix_unitaire = parse_decimal(row.get("prix_unitaire"))
                if quantite is None:
                    errors.append({"line": idx, "error": "quantite requise (tache)"})
                    continue
                if prix_unitaire is None:
                    errors.append({"line": idx, "error": "prix_unitaire requis (tache)"})
                    continue

                group["repartitions"].append(
                    {
                        "nom_prenom": nom_prenom,
                        "nature_taches": nature_taches,
                        "quantite": quantite,
                        "prix_unitaire": prix_unitaire,
                    }
                )
                continue

            errors.append({"line": idx, "error": "type_ligne invalide (consommable|tache)"})

        if errors:
            return Response({"ok": False, "errors": errors}, status=status.HTTP_400_BAD_REQUEST)

        created = 0
        updated = 0
        for (_superv, _nature, _periode, _ref), group in groups.items():
            payload = dict(group["base"])
            payload["secteurs_couverts"] = sorted(group["secteurs"])
            payload["consommables"] = group["consommables"]
            payload["repartitions"] = group["repartitions"]

            existing = list(
                FicheTravaux.objects.filter(
                    superviseur_travaux=payload["superviseur_travaux"],
                    nature_travaux=payload["nature_travaux"],
                    periode_travaux=payload["periode_travaux"],
                )[:2]
            )

            if len(existing) == 1:
                serializer = FicheTravauxSerializer(existing[0], data=payload, context={"request": request})
                updated += 1
            elif len(existing) == 0:
                serializer = FicheTravauxSerializer(data=payload, context={"request": request})
                created += 1
            else:
                return Response(
                    {
                        "ok": False,
                        "errors": [
                            {
                                "line": None,
                                "error": "Plusieurs fiches existent deja pour (superviseur_travaux, nature_travaux, periode_travaux). Utilise une periode/nature unique ou supprime les doublons avant import.",
                            }
                        ],
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

            serializer.is_valid(raise_exception=True)
            serializer.save()

        return Response({"ok": True, "created": created, "updated": updated, "errors": []})
