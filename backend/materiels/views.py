from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response

from .models import MaterielEquipement
from .serializers import MaterielEquipementSerializer
from utils.csv_utils import clean_str, csv_template_response, parse_int, read_uploaded_csv


class MaterielEquipementViewSet(viewsets.ModelViewSet):
    queryset = MaterielEquipement.objects.all().order_by("numero")
    serializer_class = MaterielEquipementSerializer

    @action(detail=False, methods=["get"], url_path="template")
    def template(self, request):
        return csv_template_response(
            "materiels_template.csv",
            fieldnames=["numero", "designation", "quantite", "etat_physique", "statut_utilisation"],
            example_rows=[
                {
                    "numero": "1",
                    "designation": "Houe",
                    "quantite": "5",
                    "etat_physique": "Bon",
                    "statut_utilisation": "Disponible",
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
            return Response({"detail": "Fichier requis (champ 'file')"}, status=status.HTTP_400_BAD_REQUEST)

        rows = read_uploaded_csv(f)
        created = 0
        updated = 0
        errors = []

        for idx, row in enumerate(rows, start=2):
            numero = parse_int(row.get("numero"), default=None)
            if numero is None:
                errors.append({"line": idx, "error": "numero requis (int)"})
                continue

            designation = clean_str(row.get("designation"))
            quantite = parse_int(row.get("quantite"), default=0) or 0
            etat = clean_str(row.get("etat_physique"))
            statut = clean_str(row.get("statut_utilisation"))

            obj = MaterielEquipement.objects.filter(numero=numero).first()
            if obj:
                obj.designation = designation
                obj.quantite = int(quantite)
                obj.etat_physique = etat
                obj.statut_utilisation = statut
                obj.save()
                updated += 1
            else:
                MaterielEquipement.objects.create(
                    numero=int(numero),
                    designation=designation,
                    quantite=int(quantite),
                    etat_physique=etat,
                    statut_utilisation=statut,
                )
                created += 1

        return Response({"ok": True, "created": created, "updated": updated, "errors": errors})
