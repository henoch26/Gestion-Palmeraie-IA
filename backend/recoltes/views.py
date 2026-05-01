import csv
from datetime import date as dt_date

from django.http import HttpResponse
from django.db.models import Sum, Count, Max, Q
from django.db.models.functions import Coalesce
from django.utils import timezone
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework import status
from rest_framework.parsers import FormParser, MultiPartParser

from recolteurs.models import Recolteur
from secteurs.models import Secteur
from .models import FicheRecolte, FicheRecolteDetail
from .serializers import FicheRecolteSerializer
from utils.csv_utils import clean_str, csv_template_response, parse_decimal, parse_int, read_uploaded_csv


class FicheRecolteViewSet(viewsets.ModelViewSet):
    # CRUD complet pour les fiches de recolte (avec prefetch)
    queryset = FicheRecolte.objects.all().prefetch_related(
        "superviseurs_adjoints",
        "lignes__details",
        "recus",
    ).order_by("-id")
    serializer_class = FicheRecolteSerializer

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        if instance.paiements.filter(statut="paye").exists():
            return Response(
                {"detail": "Fiche deja payee: suppression interdite"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return super().destroy(request, *args, **kwargs)

    @action(detail=False, methods=["get"], url_path="analytics")
    def analytics(self, request):
        # Stats globales + comparaisons annuelles
        today = timezone.now().date()
        year = int(request.query_params.get("year", today.year))
        prev_year = year - 1

        def monthly_totals(target_year):
            qs = (
                FicheRecolteDetail.objects.filter(ligne__fiche__date__year=target_year)
                .values("ligne__fiche__date__month")
                .annotate(total=Sum("quantite"))
            )
            totals_by_month = {row["ligne__fiche__date__month"]: row["total"] or 0 for row in qs}
            labels = ["Jan", "Fev", "Mar", "Avr", "Mai", "Juin", "Juil", "Aout", "Sept", "Oct", "Nov", "Dec"]
            data = [int(totals_by_month.get(m, 0)) for m in range(1, 13)]
            return {"labels": labels, "data": data}

        # Totaux par annee (5 ans glissants)
        start_year = year - 4
        yearly_qs = (
            FicheRecolteDetail.objects.filter(ligne__fiche__date__year__gte=start_year)
            .values("ligne__fiche__date__year")
            .annotate(total=Sum("quantite"))
            .order_by("ligne__fiche__date__year")
        )
        yearly_map = {row["ligne__fiche__date__year"]: row["total"] or 0 for row in yearly_qs}
        yearly_labels = list(range(start_year, year + 1))
        yearly_data = [int(yearly_map.get(y, 0)) for y in yearly_labels]

        # Stats par recolteur (grands / moyens / petits)
        recolteurs = (
            Recolteur.objects.annotate(
                grands=Coalesce(
                    Sum(
                        "lignes_recolte__details__quantite",
                        filter=Q(
                            lignes_recolte__fiche__date__year=year,
                            lignes_recolte__regime_type="grands",
                        ),
                    ),
                    0,
                ),
                moyens=Coalesce(
                    Sum(
                        "lignes_recolte__details__quantite",
                        filter=Q(
                            lignes_recolte__fiche__date__year=year,
                            lignes_recolte__regime_type="moyens",
                        ),
                    ),
                    0,
                ),
                petits=Coalesce(
                    Sum(
                        "lignes_recolte__details__quantite",
                        filter=Q(
                            lignes_recolte__fiche__date__year=year,
                            lignes_recolte__regime_type="petits",
                        ),
                    ),
                    0,
                ),
                total_regimes=Coalesce(
                    Sum(
                        "lignes_recolte__details__quantite",
                        filter=Q(lignes_recolte__fiche__date__year=year),
                    ),
                    0,
                ),
                fiches_count=Count(
                    "lignes_recolte__fiche",
                    distinct=True,
                    filter=Q(lignes_recolte__fiche__date__year=year),
                ),
                last_recolte=Max(
                    "lignes_recolte__fiche__date",
                    filter=Q(lignes_recolte__fiche__date__year=year),
                ),
            )
            .values(
                "id",
                "code",
                "nom",
                "lieu_residence",
                "grands",
                "moyens",
                "petits",
                "total_regimes",
                "fiches_count",
                "last_recolte",
            )
            .order_by("-total_regimes", "nom")
        )

        return Response(
            {
                "year": year,
                "monthly": {
                    "current": monthly_totals(year),
                    "previous": monthly_totals(prev_year),
                },
                "yearly": {"labels": yearly_labels, "data": yearly_data},
                "recolteurs": list(recolteurs),
            }
        )

    @action(detail=False, methods=["get"], url_path="export")
    def export(self, request):
        # Export CSV des details de recolte
        response = HttpResponse(content_type="text/csv")
        response["Content-Disposition"] = "attachment; filename=recoltes_export.csv"

        writer = csv.writer(response)
        writer.writerow(
            [
                "date",
                "recolteur_code",
                "recolteur_nom",
                "regime_type",
                "secteur_code",
                "quantite",
                "fiche_id",
            ]
        )

        details = (
            FicheRecolteDetail.objects.select_related(
                "ligne__fiche", "ligne__recolteur", "secteur"
            )
            .values(
                "ligne__fiche__date",
                "ligne__recolteur__code",
                "ligne__recolteur__nom",
                "ligne__recolteur_nom",
                "ligne__regime_type",
                "secteur__code",
                "secteur_code",
                "quantite",
                "ligne__fiche__id",
            )
            .order_by("ligne__fiche__date")
        )

        for row in details:
            recolteur_nom = row["ligne__recolteur__nom"] or row["ligne__recolteur_nom"] or ""
            secteur_code = row["secteur__code"] or row["secteur_code"] or ""
            writer.writerow(
                [
                    row["ligne__fiche__date"],
                    row["ligne__recolteur__code"] or "",
                    recolteur_nom,
                    row["ligne__regime_type"],
                    secteur_code,
                    row["quantite"] or 0,
                    row["ligne__fiche__id"],
                ]
            )

        return response

    @action(detail=False, methods=["get"], url_path="template")
    def template(self, request):
        # Modele CSV d'import de recoltes (1 ligne = 1 detail secteur pour un recolteur/regime)
        return csv_template_response(
            "recoltes_template.csv",
            fieldnames=[
                "fiche_ref",
                "date",
                "superviseur_general",
                "bareme_grands",
                "bareme_moyens",
                "bareme_petits",
                "depense_nourriture",
                "depense_transport",
                "observations",
                "recolteur_code",
                "recolteur_nom",
                "lieu_residence",
                "regime_type",
                "secteur_code",
                "quantite",
                "recu_date",
                "recu_client",
                "recu_pesee_kg",
                "recu_non_conformes_pct",
                "recu_montant",
            ],
            example_rows=[
                {
                    "fiche_ref": "F001",
                    "date": "2026-01-15",
                    "superviseur_general": "S. Traore",
                    "bareme_grands": "60",
                    "bareme_moyens": "50",
                    "bareme_petits": "25",
                    "depense_nourriture": "12000",
                    "depense_transport": "6000",
                    "observations": "RAS",
                    "recolteur_code": "REC-001",
                    "recolteur_nom": "",
                    "lieu_residence": "",
                    "regime_type": "grands",
                    "secteur_code": "GP_1",
                    "quantite": "18",
                    "recu_date": "2026-01-15",
                    "recu_client": "SAPH",
                    "recu_pesee_kg": "2500",
                    "recu_non_conformes_pct": "2",
                    "recu_montant": "1200000",
                }
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
            return Response({"ok": True, "created_fiches": 0, "errors": []})

        errors = []
        groups = {}

        def get_group(key, base):
            if key not in groups:
                groups[key] = {
                    "base": base,
                    "lines": {},  # (recolteur_id, regime_type) -> {recolteur, recolteur_nom, regime_type, details{secteur_id:qty}}
                    "recu": None,
                }
            return groups[key]

        for idx, row in enumerate(rows, start=2):
            fiche_ref = clean_str(row.get("fiche_ref"))
            date_s = clean_str(row.get("date"))
            superviseur = clean_str(row.get("superviseur_general"))

            if not date_s:
                errors.append({"line": idx, "error": "date requise (YYYY-MM-DD)"})
                continue
            try:
                dt_date.fromisoformat(date_s)
            except ValueError:
                errors.append({"line": idx, "error": "date invalide (YYYY-MM-DD)"})
                continue

            if not superviseur:
                errors.append({"line": idx, "error": "superviseur_general requis"})
                continue

            secteur_code = clean_str(row.get("secteur_code"))
            if not secteur_code:
                errors.append({"line": idx, "error": "secteur_code requis"})
                continue
            secteur = Secteur.objects.filter(code=secteur_code).first()
            if not secteur:
                errors.append({"line": idx, "error": f"Secteur introuvable: {secteur_code}"})
                continue

            regime_type = clean_str(row.get("regime_type")).lower()
            if regime_type not in {"grands", "moyens", "petits"}:
                errors.append(
                    {"line": idx, "error": "regime_type invalide (grands|moyens|petits)"}
                )
                continue

            quantite = parse_int(row.get("quantite"), default=None)
            if quantite is None:
                errors.append({"line": idx, "error": "quantite requise (int)"})
                continue
            if quantite <= 0:
                continue

            recolteur_code = clean_str(row.get("recolteur_code"))
            recolteur_nom = clean_str(row.get("recolteur_nom"))
            lieu = clean_str(row.get("lieu_residence")) or "N/A"

            recolteur = None
            if recolteur_code:
                recolteur = Recolteur.objects.filter(code=recolteur_code).first()
            if not recolteur and recolteur_nom:
                recolteur = Recolteur.objects.filter(nom__iexact=recolteur_nom).first()
            if not recolteur:
                if not recolteur_nom:
                    errors.append(
                        {"line": idx, "error": "recolteur_code ou recolteur_nom requis"}
                    )
                    continue
                recolteur = Recolteur.objects.create(nom=recolteur_nom, lieu_residence=lieu)

            base = {
                "date": date_s,
                "superviseur_general": superviseur,
                "bareme_grands": parse_int(row.get("bareme_grands"), default=60),
                "bareme_moyens": parse_int(row.get("bareme_moyens"), default=50),
                "bareme_petits": parse_int(row.get("bareme_petits"), default=25),
                "depense_nourriture": parse_decimal(row.get("depense_nourriture")) or 0,
                "depense_transport": parse_decimal(row.get("depense_transport")) or 0,
                "observations": clean_str(row.get("observations")),
            }

            gkey = (date_s, superviseur, fiche_ref or "")
            group = get_group(gkey, base)

            # Recu (facultatif)
            if group["recu"] is None:
                recu_montant = parse_decimal(row.get("recu_montant"))
                recu_date = clean_str(row.get("recu_date"))
                recu_client = clean_str(row.get("recu_client"))
                recu_pesee = parse_decimal(row.get("recu_pesee_kg"))
                recu_non_conf = parse_decimal(row.get("recu_non_conformes_pct"))
                if recu_date or (recu_montant and recu_montant > 0):
                    group["recu"] = {
                        "date": recu_date or None,
                        "client": recu_client,
                        "pesee_kg": recu_pesee or 0,
                        "non_conformes_pct": recu_non_conf or 0,
                        "montant": recu_montant or 0,
                    }

            line_key = (recolteur.id, regime_type)
            if line_key not in group["lines"]:
                group["lines"][line_key] = {
                    "recolteur": recolteur,
                    "recolteur_nom": recolteur.nom,
                    "regime_type": regime_type,
                    "details": {},
                }

            details = group["lines"][line_key]["details"]
            details[secteur.id] = int(details.get(secteur.id, 0)) + int(quantite)

        if errors:
            return Response({"ok": False, "errors": errors}, status=status.HTTP_400_BAD_REQUEST)

        created_fiches = 0
        created_lines = 0
        created_details = 0

        for _key, group in groups.items():
            payload = dict(group["base"])
            payload["lignes"] = []
            if group.get("recu"):
                payload["recus"] = [group["recu"]]

            for (_recolteur_id, _reg), line in group["lines"].items():
                payload["lignes"].append(
                    {
                        "recolteur": line["recolteur"].id,
                        "recolteur_nom": line["recolteur_nom"],
                        "regime_type": line["regime_type"],
                        "details": [
                            {"secteur": sid, "quantite": qty}
                            for sid, qty in line["details"].items()
                            if int(qty or 0) > 0
                        ],
                    }
                )
                created_lines += 1
                created_details += len(line["details"])

            serializer = FicheRecolteSerializer(data=payload, context={"request": request})
            serializer.is_valid(raise_exception=True)
            serializer.save()
            created_fiches += 1

        return Response(
            {
                "ok": True,
                "created_fiches": created_fiches,
                "created_lines": created_lines,
                "created_details": created_details,
                "errors": [],
            }
        )
