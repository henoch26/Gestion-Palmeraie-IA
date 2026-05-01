import csv

from django.http import HttpResponse
from rest_framework import viewsets
from rest_framework.decorators import action

from .models import FicheTravaux
from .serializers import FicheTravauxSerializer


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

