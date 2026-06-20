"""
agents/views.py — API REST pour les agents terrain et les superviseurs generaux.

Expose deux ViewSets :
  AgentTerrainViewSet       — CRUD des agents terrain (annuaire)
  SuperviseurGeneralViewSet — CRUD des superviseurs + 3 actions supplementaires :

    stats/:id/          — KPIs complets du superviseur (fiches, depenses, recettes,
                          production mensuelle, fiches recentes recolte et travaux)
    secteurs-stats/:id/ — Production par secteur pour ce superviseur
    recolteurs-stats/:id/— Performance des recolteurs pour ce superviseur

Nota bene sur le calcul des depenses dans stats/:id/ :
  total_depenses = depenses_recolte (FicheRecolte.depense_total)
                 + cout_travaux (consommables + repartitions + salaire_total)
  Ce cumul couvre l'integralite des charges operationnelles du superviseur.
"""
from datetime import date

from django.db.models import Sum, Count
from django.db.models.functions import TruncMonth
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .models import AgentTerrain, SuperviseurGeneral
from .serializers import AgentTerrainSerializer, SuperviseurGeneralSerializer
from utils.audit import log_action, snapshot, diff_fields, build_revert_meta

_AGENT_LABELS = {
    "nom":       "Nom",
    "prenom":    "Prénom",
    "matricule": "Matricule",
    "telephone": "Téléphone",
    "actif":     "Actif",
}

_SUP_LABELS = {
    "nom":       "Nom",
    "prenom":    "Prénom",
    "code":      "Code",
    "matricule": "Matricule",
    "telephone": "Téléphone",
    "actif":     "Actif",
}


def _agent_snapshot(inst):
    snap = snapshot(inst, _AGENT_LABELS)
    snap["Secteur"] = str(inst.secteur) if inst.secteur else ""
    return snap


class AgentTerrainViewSet(viewsets.ModelViewSet):
    queryset = AgentTerrain.objects.select_related("secteur").order_by("nom", "prenom")
    serializer_class = AgentTerrainSerializer

    def get_permissions(self):
        return [IsAuthenticated()]

    def create(self, request, *args, **kwargs):
        response = super().create(request, *args, **kwargs)
        if response.status_code in (200, 201):
            try:
                inst = AgentTerrain.objects.select_related("secteur").get(pk=response.data["id"])
                snap = _agent_snapshot(inst)
            except Exception:
                snap = {}
            nom = f"{response.data.get('nom', '')} {response.data.get('prenom', '')}".strip()
            log_action(request.user, "creation_agent",
                       detail=f"Agent terrain « {nom} » créé.",
                       meta={"snapshot": snap})
        return response

    def partial_update(self, request, *args, **kwargs):
        instance = self.get_object()
        pk = instance.pk
        before = _agent_snapshot(instance)
        before_raw = build_revert_meta(instance, _AGENT_LABELS, extra_fields=["secteur_id"])
        response = super().partial_update(request, *args, **kwargs)
        if response.status_code == 200:
            fresh = AgentTerrain.objects.select_related("secteur").get(pk=pk)
            after = _agent_snapshot(fresh)
            changes = diff_fields(before, after)
            nom = f"{fresh.nom} {fresh.prenom}".strip()
            log_action(request.user, "modification_agent",
                       detail=f"Agent terrain « {nom} » modifié.",
                       meta={"changes": changes, "object_id": pk, "object_type": "agent", "before_raw": before_raw})
        return response

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        snap = _agent_snapshot(instance)
        nom = f"{instance.nom} {instance.prenom}".strip()
        log_action(request.user, "suppression_agent",
                   detail=f"Agent terrain « {nom} » supprimé.",
                   meta={"snapshot": snap})
        return super().destroy(request, *args, **kwargs)


class SuperviseurGeneralViewSet(viewsets.ModelViewSet):
    queryset = SuperviseurGeneral.objects.select_related("user__profile").order_by("nom", "prenom")
    serializer_class = SuperviseurGeneralSerializer

    def get_permissions(self):
        return [IsAuthenticated()]

    def create(self, request, *args, **kwargs):
        response = super().create(request, *args, **kwargs)
        if response.status_code in (200, 201):
            try:
                inst = SuperviseurGeneral.objects.get(pk=response.data["id"])
                snap = snapshot(inst, _SUP_LABELS)
            except Exception:
                snap = {}
            nom = f"{response.data.get('nom', '')} {response.data.get('prenom', '')}".strip()
            log_action(request.user, "creation_superviseur_general",
                       detail=f"Superviseur général « {nom} » créé.",
                       meta={"snapshot": snap})
        return response

    def partial_update(self, request, *args, **kwargs):
        instance = self.get_object()
        pk = instance.pk
        before = snapshot(instance, _SUP_LABELS)
        response = super().partial_update(request, *args, **kwargs)
        if response.status_code == 200:
            fresh = SuperviseurGeneral.objects.get(pk=pk)
            after = snapshot(fresh, _SUP_LABELS)
            changes = diff_fields(before, after)
            nom = f"{fresh.nom} {fresh.prenom}".strip()
            log_action(request.user, "modification_superviseur_general",
                       detail=f"Superviseur général « {nom} » modifié.",
                       meta={"changes": changes})
        return response

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        snap = snapshot(instance, _SUP_LABELS)
        nom = f"{instance.nom} {instance.prenom}".strip()
        log_action(request.user, "suppression_superviseur_general",
                   detail=f"Superviseur général « {nom} » supprimé.",
                   meta={"snapshot": snap})
        return super().destroy(request, *args, **kwargs)

    @action(detail=True, methods=["get"], url_path="stats")
    def stats(self, request, pk=None):
        from decimal import Decimal
        from recoltes.models import FicheRecolte, FicheRecolteDetail, FicheRecuVente
        from travaux.models import FicheTravaux, ConsommableTravaux, RepartitionTache
        from django.db.models import F
        from django.db.models.expressions import ExpressionWrapper
        from django.db.models import DecimalField

        sup = self.get_object()
        user = sup.user
        fiches_qs = FicheRecolte.objects.filter(created_by=user)
        details_qs = FicheRecolteDetail.objects.filter(ligne__fiche__created_by=user)
        travaux_qs = FicheTravaux.objects.filter(created_by=user)

        cost_expr = ExpressionWrapper(
            F("quantite") * F("prix_unitaire"),
            output_field=DecimalField(max_digits=20, decimal_places=2),
        )

        # ── KPIs globaux ─────────────────────────────────────────────
        agg = fiches_qs.aggregate(nb_fiches=Count("id"), total_depenses_recolte=Sum("depense_total"))
        total_recettes = float(
            FicheRecuVente.objects.filter(fiche__created_by=user)
            .aggregate(t=Sum("montant"))["t"] or 0
        )

        # Coûts travaux
        total_cons = float(
            ConsommableTravaux.objects.filter(fiche__in=travaux_qs)
            .aggregate(t=Sum(cost_expr))["t"] or 0
        )
        total_tach = float(
            RepartitionTache.objects.filter(fiche__in=travaux_qs)
            .aggregate(t=Sum(cost_expr))["t"] or 0
        )
        total_sal_trav = float(
            travaux_qs.aggregate(t=Sum("salaire_total"))["t"] or 0
        )
        total_depenses_travaux = total_cons + total_tach + total_sal_trav
        total_depenses = float(agg["total_depenses_recolte"] or 0) + total_depenses_travaux

        total_grands = int(details_qs.filter(ligne__regime_type="grands").aggregate(t=Sum("quantite"))["t"] or 0)
        total_moyens = int(details_qs.filter(ligne__regime_type="moyens").aggregate(t=Sum("quantite"))["t"] or 0)
        total_petits = int(details_qs.filter(ligne__regime_type="petits").aggregate(t=Sum("quantite"))["t"] or 0)

        # ── Mensuel (12 derniers mois) ────────────────────────────────
        today = date.today()
        sm, sy = today.month - 11, today.year
        if sm <= 0:
            sm += 12
            sy -= 1
        start = date(sy, sm, 1)

        labels, cy, cm = [], sy, sm
        for _ in range(12):
            labels.append(date(cy, cm, 1).strftime("%b %Y"))
            cm += 1
            if cm > 12:
                cm, cy = 1, cy + 1

        monthly_qs = (
            details_qs.filter(ligne__fiche__created_by=user, ligne__fiche__date__gte=start)
            .annotate(month=TruncMonth("ligne__fiche__date"))
            .values("month", "ligne__regime_type")
            .annotate(total=Sum("quantite"))
            .order_by("month")
        )
        gm, mm_d, pm = {}, {}, {}
        for row in monthly_qs:
            key = row["month"].strftime("%b %Y")
            t = int(row["total"] or 0)
            rt = row["ligne__regime_type"]
            if rt == "grands":   gm[key]   = t
            elif rt == "moyens": mm_d[key] = t
            elif rt == "petits": pm[key]   = t

        # ── Fiches récolte récentes ───────────────────────────────────
        recent_fiches = []
        for f in fiches_qs.order_by("-date")[:10]:
            nb_rec = f.lignes.values("recolteur_id").distinct().count()
            tot = int(
                FicheRecolteDetail.objects.filter(ligne__fiche=f).aggregate(t=Sum("quantite"))["t"] or 0
            )
            recent_fiches.append({
                "id": f.id,
                "date": f.date.isoformat(),
                "statut": f.statut,
                "nb_recolteurs": nb_rec,
                "total_regimes": tot,
                "depense_total": float(f.depense_total or 0),
            })

        # ── Fiches travaux récentes ───────────────────────────────────
        recent_travaux = []
        for t in travaux_qs.order_by("-created_at")[:10]:
            c_total = float(
                ConsommableTravaux.objects.filter(fiche=t).aggregate(s=Sum(cost_expr))["s"] or 0
            )
            r_total = float(
                RepartitionTache.objects.filter(fiche=t).aggregate(s=Sum(cost_expr))["s"] or 0
            )
            cout = c_total + r_total + float(t.salaire_total or 0)
            recent_travaux.append({
                "id": t.id,
                "periode": t.periode_travaux or "",
                "nature": t.nature_travaux or "",
                "statut": t.statut,
                "statut_avancement": t.statut_avancement or "",
                "nb_personnes": t.nb_personnes,
                "salaire_total": float(t.salaire_total or 0),
                "cout_total": cout,
            })

        # ── Permissions ───────────────────────────────────────────────
        permissions = []
        try:
            permissions = list(sup.user.profile.droits.values("code", "label"))
        except Exception:
            pass

        return Response({
            "superviseur": SuperviseurGeneralSerializer(sup).data,
            "user_info": {
                "id":         sup.user.id         if sup.user else None,
                "username":   sup.user.username   if sup.user else None,
                "email":      sup.user.email      if sup.user else None,
                "first_name": sup.user.first_name if sup.user else None,
                "last_name":  sup.user.last_name  if sup.user else None,
                "is_active":  sup.user.is_active  if sup.user else False,
            },
            "kpis": {
                "nb_fiches":      agg["nb_fiches"] or 0,
                "total_depenses": total_depenses,
                "total_recettes": total_recettes,
                "total_regimes":  total_grands + total_moyens + total_petits,
            },
            "regimes": {"grands": total_grands, "moyens": total_moyens, "petits": total_petits},
            "monthly": {
                "labels": labels,
                "grands": [gm.get(l, 0)   for l in labels],
                "moyens": [mm_d.get(l, 0) for l in labels],
                "petits": [pm.get(l, 0)   for l in labels],
            },
            "recent_fiches": recent_fiches,
            "recent_travaux": recent_travaux,
            "permissions": permissions,
        })

    @action(detail=True, methods=["get"], url_path="secteurs-stats")
    def secteurs_stats(self, request, pk=None):
        from recoltes.models import FicheRecolteDetail
        from django.db.models import Sum, Q
        from django.db.models.functions import Coalesce

        sup = self.get_object()
        user = sup.user
        year = int(request.query_params.get("year", date.today().year))

        qs = (
            FicheRecolteDetail.objects.filter(
                ligne__fiche__created_by=user,
                ligne__fiche__date__year=year,
            )
            .exclude(secteur__isnull=True)
            .values("secteur__id", "secteur__code", "secteur__nom", "secteur__superficie_ha")
            .annotate(
                total=Coalesce(Sum("quantite"), 0),
                grands=Coalesce(Sum("quantite", filter=Q(ligne__regime_type="grands")), 0),
                moyens=Coalesce(Sum("quantite", filter=Q(ligne__regime_type="moyens")), 0),
                petits=Coalesce(Sum("quantite", filter=Q(ligne__regime_type="petits")), 0),
            )
            .order_by("-total")
        )
        return Response({
            "year": year,
            "superviseur_user_id": user.id if user else None,
            "secteurs": [
                {
                    "id": r["secteur__id"],
                    "code": r["secteur__code"],
                    "nom": r["secteur__nom"],
                    "superficie_ha": float(r["secteur__superficie_ha"] or 0),
                    "total_regimes": int(r["total"] or 0),
                    "grands": int(r["grands"] or 0),
                    "moyens": int(r["moyens"] or 0),
                    "petits": int(r["petits"] or 0),
                }
                for r in qs
            ],
        })

    @action(detail=True, methods=["get"], url_path="recolteurs-stats")
    def recolteurs_stats(self, request, pk=None):
        from recolteurs.models import Personnel
        from recoltes.models import FicheRecolteDetail, FicheRecolteLigne
        from django.db.models import Sum, Q
        from django.db.models.functions import Coalesce
        from decimal import Decimal

        sup = self.get_object()
        user = sup.user
        year = int(request.query_params.get("year", date.today().year))

        cb_q = Q(lignes_recolte__fiche__created_by=user, lignes_recolte__fiche__date__year=year)
        qs = (
            Personnel.objects.filter(
                lignes_recolte__fiche__created_by=user,
                lignes_recolte__fiche__date__year=year,
            )
            .annotate(
                total_regimes=Coalesce(Sum("lignes_recolte__details__quantite", filter=cb_q), 0),
                grands=Coalesce(Sum("lignes_recolte__details__quantite",
                                   filter=cb_q & Q(lignes_recolte__regime_type="grands")), 0),
                moyens=Coalesce(Sum("lignes_recolte__details__quantite",
                                   filter=cb_q & Q(lignes_recolte__regime_type="moyens")), 0),
                petits=Coalesce(Sum("lignes_recolte__details__quantite",
                                   filter=cb_q & Q(lignes_recolte__regime_type="petits")), 0),
                salaire_total=Coalesce(Sum("lignes_recolte__salaire_calcule",
                                          filter=Q(lignes_recolte__fiche__created_by=user,
                                                   lignes_recolte__fiche__date__year=year)), Decimal("0")),
            )
            .values("id", "nom", "numero_telephone", "total_regimes", "grands", "moyens", "petits", "salaire_total")
            .distinct()
            .order_by("-total_regimes")
        )
        return Response({
            "year": year,
            "superviseur_user_id": user.id if user else None,
            "recolteurs": [
                {
                    "id": r["id"],
                    "nom": r["nom"],
                    "numero_telephone": r["numero_telephone"],
                    "total_regimes": int(r["total_regimes"] or 0),
                    "grands": int(r["grands"] or 0),
                    "moyens": int(r["moyens"] or 0),
                    "petits": int(r["petits"] or 0),
                    "salaire_total": float(r["salaire_total"] or 0),
                }
                for r in qs
            ],
        })
