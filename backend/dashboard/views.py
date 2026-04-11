from datetime import date

from django.db.models import F, Q, Sum, DecimalField, Value
from django.db.models.expressions import ExpressionWrapper
from django.db.models.functions import Coalesce
from rest_framework.decorators import api_view
from rest_framework.response import Response

from materiels.models import MaterielEquipement
from recoltes.models import FicheRecolte, FicheRecolteDetail, FicheRecuVente
from recolteurs.models import Recolteur
from secteurs.models import Secteur
from travaux.models import FicheTravaux, ConsommableTravaux, RepartitionTache


@api_view(["GET"])
def summary_view(request):
    today = date.today()
    selected_year = int(request.query_params.get("year", today.year))
    prev_year = selected_year - 1

    secteur_id = request.query_params.get("secteur")
    recolteur_id = request.query_params.get("recolteur")
    regime_type = (request.query_params.get("regime_type") or "").strip().lower()
    if regime_type not in {"", "grands", "moyens", "petits"}:
        regime_type = ""

    secteur_obj = None
    recolteur_obj = None
    try:
        if secteur_id:
            secteur_obj = Secteur.objects.filter(id=int(secteur_id)).first()
    except Exception:
        secteur_obj = None

    try:
        if recolteur_id:
            recolteur_obj = Recolteur.objects.filter(id=int(recolteur_id)).first()
    except Exception:
        recolteur_obj = None

    # Base details queryset (filtrable)
    details_qs = FicheRecolteDetail.objects.all()
    if secteur_obj:
        details_qs = details_qs.filter(secteur=secteur_obj)
    if recolteur_obj:
        details_qs = details_qs.filter(ligne__recolteur=recolteur_obj)
    if regime_type:
        details_qs = details_qs.filter(ligne__regime_type=regime_type)

    # Base fiches recolte (pour depenses/recus, filtrable via existence de details/lignes)
    fiches_recolte_qs = FicheRecolte.objects.all()
    if secteur_obj:
        fiches_recolte_qs = fiches_recolte_qs.filter(lignes__details__secteur=secteur_obj)
    if recolteur_obj:
        fiches_recolte_qs = fiches_recolte_qs.filter(lignes__recolteur=recolteur_obj)
    if regime_type:
        fiches_recolte_qs = fiches_recolte_qs.filter(lignes__regime_type=regime_type)
    fiches_recolte_qs = fiches_recolte_qs.distinct()

    # Stats globales (dashboard = synthese, sans IA ni paiement)
    secteurs_count_total = Secteur.objects.count()

    # KPIs sur l'annee selectionnee (et filtres eventuels)
    total_production = (
        details_qs.filter(ligne__fiche__date__year=selected_year).aggregate(total=Sum("quantite"))["total"]
        or 0
    )

    secteurs_involved = (
        details_qs.filter(ligne__fiche__date__year=selected_year)
        .values("secteur")
        .exclude(secteur__isnull=True)
        .distinct()
        .count()
    )

    recolteurs_actifs = (
        details_qs.filter(ligne__fiche__date__year=selected_year)
        .values("ligne__recolteur")
        .exclude(ligne__recolteur__isnull=True)
        .distinct()
        .count()
    )

    # Rendement moyen (regimes/ha) base sur la superficie totale des secteurs concernes
    secteur_ids_for_year = (
        details_qs.filter(ligne__fiche__date__year=selected_year)
        .values_list("secteur", flat=True)
        .exclude(secteur__isnull=True)
        .distinct()
    )
    superficie_totale = (
        Secteur.objects.filter(id__in=secteur_ids_for_year).aggregate(total=Sum("superficie_ha"))["total"]
        or 0
    )
    superficie_totale = float(superficie_totale or 0)
    rendement_moyen = round(float(total_production) / superficie_totale, 2) if superficie_totale else 0

    # Montant total des recus de vente (fcfa) sur les fiches concernees
    montant_total_ventes = (
        FicheRecuVente.objects.filter(fiche__in=fiches_recolte_qs, date__isnull=False, date__year=selected_year)
        .aggregate(total=Sum("montant"))["total"]
        or 0
    )

    # Depenses recolte (nourriture + transport)
    dep_nourriture = (
        fiches_recolte_qs.filter(date__year=selected_year).aggregate(total=Sum("depense_nourriture"))["total"] or 0
    )
    dep_transport = (
        fiches_recolte_qs.filter(date__year=selected_year).aggregate(total=Sum("depense_transport"))["total"] or 0
    )
    depenses_total_recolte = dep_nourriture + dep_transport

    # Cout total travaux (consommables + repartition taches)
    cost_expr = ExpressionWrapper(
        F("quantite") * F("prix_unitaire"),
        output_field=DecimalField(max_digits=20, decimal_places=2),
    )
    travaux_qs = FicheTravaux.objects.all()
    if secteur_obj:
        travaux_qs = travaux_qs.filter(secteurs_couverts=secteur_obj)
    travaux_qs = travaux_qs.distinct()

    total_consommables = (
        ConsommableTravaux.objects.filter(fiche__in=travaux_qs, fiche__created_at__year=selected_year)
        .aggregate(total=Sum(cost_expr))["total"]
        or 0
    )
    total_taches = (
        RepartitionTache.objects.filter(fiche__in=travaux_qs, fiche__created_at__year=selected_year)
        .aggregate(total=Sum(cost_expr))["total"]
        or 0
    )
    cout_total_travaux = total_consommables + total_taches

    fiches_recolte_count = fiches_recolte_qs.filter(date__year=selected_year).count()
    fiches_travaux_count = travaux_qs.filter(created_at__year=selected_year).count()

    # Helpers: series mensuelles (annee)
    month_labels = ["Jan", "Fev", "Mar", "Avr", "Mai", "Juin", "Juil", "Aout", "Sept", "Oct", "Nov", "Dec"]

    # 6 derniers mois (glissant) sous forme de couples (annee, mois)
    last6 = []
    m = today.month
    y = today.year
    for _ in range(6):
        last6.append((y, m, month_labels[m - 1]))
        m -= 1
        if m == 0:
            m = 12
            y -= 1
    last6.reverse()
    last6_labels = [t[2] for t in last6]

    def production_by_month(year):
        qs = (
            details_qs.filter(ligne__fiche__date__year=year)
            .values("ligne__fiche__date__month")
            .annotate(total=Sum("quantite"))
        )
        by_month = {row["ligne__fiche__date__month"]: int(row["total"] or 0) for row in qs}
        data = [by_month.get(m, 0) for m in range(1, 13)]
        return {"year": year, "labels": month_labels, "data": data}

    def ventes_by_month(year):
        qs = (
            FicheRecuVente.objects.filter(
                fiche__in=fiches_recolte_qs,
                date__isnull=False,
                date__year=year,
            )
            .values("date__month")
            .annotate(total=Sum("montant"))
        )
        by_month = {row["date__month"]: float(row["total"] or 0) for row in qs}
        data = [by_month.get(m, 0) for m in range(1, 13)]
        return {"year": year, "labels": month_labels, "data": data}

    # Production mensuelle (6 derniers mois)
    data = []
    for yy, mm, _lbl in last6:
        total = (
            details_qs.filter(
                ligne__fiche__date__year=yy,
                ligne__fiche__date__month=mm,
            ).aggregate(total=Sum("quantite"))["total"]
            or 0
        )
        data.append(int(total))

    production_annuelle = production_by_month(selected_year)
    production_compare = {
        "year": selected_year,
        "labels": month_labels,
        "current": production_by_month(selected_year)["data"],
        "previous": production_by_month(prev_year)["data"],
    }

    # Montant ventes mensuel (6 derniers mois)
    ventes_data = []
    for yy, mm, _lbl in last6:
        total = (
            FicheRecuVente.objects.filter(
                fiche__in=fiches_recolte_qs,
                date__isnull=False,
                date__year=yy,
                date__month=mm,
            ).aggregate(total=Sum("montant"))["total"]
            or 0
        )
        ventes_data.append(float(total))

    ventes_annuel = ventes_by_month(selected_year)
    ventes_compare = {
        "year": selected_year,
        "labels": month_labels,
        "current": ventes_by_month(selected_year)["data"],
        "previous": ventes_by_month(prev_year)["data"],
    }

    # Performance recolteurs (top 5)
    def perf_recolteurs_year(target_year):
        qs = (
            details_qs.filter(ligne__fiche__date__year=target_year)
            .exclude(ligne__recolteur__isnull=True)
            .values("ligne__recolteur", "ligne__recolteur__nom", "ligne__recolteur_nom")
            .annotate(total=Sum("quantite"))
            .order_by("-total")[:5]
        )
        labels = [
            (p["ligne__recolteur__nom"] or p["ligne__recolteur_nom"] or "N/A")
            for p in qs
        ]
        ids = [p["ligne__recolteur"] for p in qs]
        data = [int(p["total"] or 0) for p in qs]
        return {"labels": labels, "ids": ids, "data": data}

    def perf_recolteurs_last6():
        # Top recolteurs sur les 6 derniers mois glissants
        # On filtre par mois via un OR sur 6 couples (annee, mois)
        q = Q()
        for yy, mm, _ in last6:
            q |= Q(ligne__fiche__date__year=yy, ligne__fiche__date__month=mm)
        qs = (
            details_qs.filter(q)
            .exclude(ligne__recolteur__isnull=True)
            .values("ligne__recolteur", "ligne__recolteur__nom", "ligne__recolteur_nom")
            .annotate(total=Sum("quantite"))
            .order_by("-total")[:5]
        )
        labels = [
            (p["ligne__recolteur__nom"] or p["ligne__recolteur_nom"] or "N/A")
            for p in qs
        ]
        ids = [p["ligne__recolteur"] for p in qs]
        data = [int(p["total"] or 0) for p in qs]
        return {"labels": labels, "ids": ids, "data": data}

    perf_year = perf_recolteurs_year(selected_year)
    perf_6m = perf_recolteurs_last6()

    # Compare: on prend le top 5 de l'annee selectionnee et on recupere leurs totaux sur l'annee precedente
    q_prev = (
        details_qs.filter(ligne__fiche__date__year=prev_year, ligne__recolteur__in=perf_year["ids"])
        .values("ligne__recolteur")
        .annotate(total=Sum("quantite"))
    )
    prev_map = {row["ligne__recolteur"]: int(row["total"] or 0) for row in q_prev}
    perf_compare = {
        "year": selected_year,
        "labels": perf_year["labels"],
        "ids": perf_year["ids"],
        "current": perf_year["data"],
        "previous": [prev_map.get(i, 0) for i in perf_year["ids"]],
    }

    # Production par secteur (annee)
    def secteurs_ordered_list():
        qs = Secteur.objects.all().order_by("code")
        if secteur_obj:
            qs = qs.filter(id=secteur_obj.id)
        return list(qs.values("id", "code", "nom", "superficie_ha"))

    secteurs_ordered = secteurs_ordered_list()
    prod_labels = [s["code"] for s in secteurs_ordered]
    prod_ids = [s["id"] for s in secteurs_ordered]
    prod_names = [s["nom"] for s in secteurs_ordered]

    def production_par_secteur_year(target_year):
        qs = (
            details_qs.filter(ligne__fiche__date__year=target_year)
            .values("secteur__id", "secteur__code")
            .annotate(total=Sum("quantite"))
        )
        by_code = {row["secteur__code"]: int(row["total"] or 0) for row in qs if row["secteur__code"]}
        values = [by_code.get(code, 0) for code in prod_labels]
        return values

    def production_par_secteur_last6():
        q = Q()
        for yy, mm, _ in last6:
            q |= Q(ligne__fiche__date__year=yy, ligne__fiche__date__month=mm)
        qs = (
            details_qs.filter(q)
            .values("secteur__id", "secteur__code")
            .annotate(total=Sum("quantite"))
        )
        by_code = {row["secteur__code"]: int(row["total"] or 0) for row in qs if row["secteur__code"]}
        return [by_code.get(code, 0) for code in prod_labels]

    prod_values = production_par_secteur_year(selected_year)
    prod_values_6m = production_par_secteur_last6()
    prod_values_prev = production_par_secteur_year(prev_year)

    rendement_values = []
    for idx, s in enumerate(secteurs_ordered):
        superficie = float(s["superficie_ha"] or 0)
        val = prod_values[idx] if idx < len(prod_values) else 0
        rendement_values.append(round(float(val) / superficie, 4) if superficie else 0)

    rendement_values_6m = []
    rendement_values_prev = []
    for idx, s in enumerate(secteurs_ordered):
        superficie = float(s["superficie_ha"] or 0)
        v6 = prod_values_6m[idx] if idx < len(prod_values_6m) else 0
        vp = prod_values_prev[idx] if idx < len(prod_values_prev) else 0
        rendement_values_6m.append(round(float(v6) / superficie, 4) if superficie else 0)
        rendement_values_prev.append(round(float(vp) / superficie, 4) if superficie else 0)

    # Depenses vs production (mensuel, annee)
    zero_money = Value(0, output_field=DecimalField(max_digits=12, decimal_places=2))
    dep_qs = (
        fiches_recolte_qs.filter(date__year=selected_year)
        .values("date__month")
        .annotate(
            nourriture=Coalesce(Sum("depense_nourriture"), zero_money),
            transport=Coalesce(Sum("depense_transport"), zero_money),
        )
    )
    dep_by_month = {row["date__month"]: float(row["nourriture"] + row["transport"]) for row in dep_qs}
    depenses_mensuelles = [dep_by_month.get(m, 0.0) for m in range(1, 13)]

    production_mensuelle_annee = production_by_month(selected_year)["data"]

    # Depenses (6 derniers mois)
    dep_last6 = []
    for yy, mm, _lbl in last6:
        row = (
            fiches_recolte_qs.filter(date__year=yy, date__month=mm)
            .aggregate(
                nourriture=Coalesce(Sum("depense_nourriture"), zero_money),
                transport=Coalesce(Sum("depense_transport"), zero_money),
            )
        )
        dep_last6.append(float((row.get("nourriture") or 0) + (row.get("transport") or 0)))

    # Compare depenses
    dep_qs_prev = (
        fiches_recolte_qs.filter(date__year=prev_year)
        .values("date__month")
        .annotate(
            nourriture=Coalesce(Sum("depense_nourriture"), zero_money),
            transport=Coalesce(Sum("depense_transport"), zero_money),
        )
    )
    dep_prev_by_month = {row["date__month"]: float(row["nourriture"] + row["transport"]) for row in dep_qs_prev}
    depenses_prev = [dep_prev_by_month.get(m, 0.0) for m in range(1, 13)]

    # Cout travaux par nature (top 8) et mensuel (annee)
    def cout_travaux_par_nature_for_qs(trav_qs, year_filter=None, month_pairs=None):
        # year_filter: int, month_pairs: list[(yy,mm)]
        cons = ConsommableTravaux.objects.filter(fiche__in=trav_qs)
        taches = RepartitionTache.objects.filter(fiche__in=trav_qs)
        if year_filter is not None:
            cons = cons.filter(fiche__created_at__year=year_filter)
            taches = taches.filter(fiche__created_at__year=year_filter)
        if month_pairs is not None:
            q = Q()
            for yy, mm, _ in month_pairs:
                q |= Q(fiche__created_at__year=yy, fiche__created_at__month=mm)
            cons = cons.filter(q)
            taches = taches.filter(q)

        cons_by_nature = cons.values("fiche__nature_travaux").annotate(total=Sum(cost_expr))
        taches_by_nature = taches.values("fiche__nature_travaux").annotate(total=Sum(cost_expr))

        cost_nature_map = {}
        for row in cons_by_nature:
            key = (row["fiche__nature_travaux"] or "").strip() or "N/A"
            cost_nature_map[key] = cost_nature_map.get(key, 0) + float(row["total"] or 0)
        for row in taches_by_nature:
            key = (row["fiche__nature_travaux"] or "").strip() or "N/A"
            cost_nature_map[key] = cost_nature_map.get(key, 0) + float(row["total"] or 0)

        return cost_nature_map

    cost_nature_map = cout_travaux_par_nature_for_qs(travaux_qs, year_filter=selected_year)
    top_natures = sorted(cost_nature_map.items(), key=lambda x: x[1], reverse=True)[:8]
    cout_nature_labels = [k for k, _ in top_natures]
    cout_nature_values = [round(v, 2) for _, v in top_natures]

    # Nature (6m)
    cost_nature_map_6m = cout_travaux_par_nature_for_qs(travaux_qs, month_pairs=last6)
    top_natures_6m = sorted(cost_nature_map_6m.items(), key=lambda x: x[1], reverse=True)[:8]
    cout_nature_labels_6m = [k for k, _ in top_natures_6m]
    cout_nature_values_6m = [round(v, 2) for _, v in top_natures_6m]

    # Compare nature: top natures de l'annee selectionnee + valeurs de l'annee precedente sur ces memes natures
    cost_nature_map_prev = cout_travaux_par_nature_for_qs(travaux_qs, year_filter=prev_year)
    cout_nature_prev_values = [round(cost_nature_map_prev.get(k, 0.0), 2) for k in cout_nature_labels]

    def cout_travaux_by_month_for_year(target_year):
        cons_by_month = (
            ConsommableTravaux.objects.filter(fiche__in=travaux_qs, fiche__created_at__year=target_year)
            .values("fiche__created_at__month")
            .annotate(total=Sum(cost_expr))
        )
        taches_by_month = (
            RepartitionTache.objects.filter(fiche__in=travaux_qs, fiche__created_at__year=target_year)
            .values("fiche__created_at__month")
            .annotate(total=Sum(cost_expr))
        )
        cost_month_map = {}
        for row in cons_by_month:
            mm = row["fiche__created_at__month"]
            cost_month_map[mm] = cost_month_map.get(mm, 0) + float(row["total"] or 0)
        for row in taches_by_month:
            mm = row["fiche__created_at__month"]
            cost_month_map[mm] = cost_month_map.get(mm, 0) + float(row["total"] or 0)
        return [round(cost_month_map.get(mm, 0.0), 2) for mm in range(1, 13)]

    cout_travaux_annuel = cout_travaux_by_month_for_year(selected_year)
    cout_travaux_prev = cout_travaux_by_month_for_year(prev_year)

    # Cout travaux (6 derniers mois)
    cout_travaux_last6 = []
    for yy, mm, _lbl in last6:
        tot_cons = (
            ConsommableTravaux.objects.filter(
                fiche__in=travaux_qs,
                fiche__created_at__year=yy,
                fiche__created_at__month=mm,
            ).aggregate(total=Sum(cost_expr))["total"]
            or 0
        )
        tot_taches = (
            RepartitionTache.objects.filter(
                fiche__in=travaux_qs,
                fiche__created_at__year=yy,
                fiche__created_at__month=mm,
            ).aggregate(total=Sum(cost_expr))["total"]
            or 0
        )
        cout_travaux_last6.append(round(float(tot_cons) + float(tot_taches), 2))

    # Listes rapides
    secteurs_list = list(
        Secteur.objects.all().order_by("-id")[:5].values("code", "nom", "superficie_ha")
    )
    recoltes_list = list(
        fiches_recolte_qs.all().order_by("-date")[:5].values("id", "date")
    )
    travaux_list = list(
        travaux_qs.all()
        .order_by("-id")[:5]
        .values("id", "periode_travaux", "nature_travaux")
    )
    recus_list = list(
        FicheRecuVente.objects.filter(fiche__in=fiches_recolte_qs)
        .order_by("-id")[:5]
        .values("date", "client", "montant")
    )
    materiels_list = list(
        MaterielEquipement.objects.all()
        .order_by("-id")[:5]
        .values("numero", "designation", "quantite")
    )

    return Response(
        {
            "year": selected_year,
            "stats": {
                "total_production": int(total_production),
                "secteurs_count": secteurs_count_total,
                "secteurs_involved": secteurs_involved,
                "recolteurs_actifs": recolteurs_actifs,
                "rendement_moyen": rendement_moyen,
                "montant_total_ventes": montant_total_ventes,
                "depenses_total_recolte": depenses_total_recolte,
                "cout_total_travaux": cout_total_travaux,
                "fiches_recolte_count": fiches_recolte_count,
                "fiches_travaux_count": fiches_travaux_count,
            },
            "charts": {
                "production_mensuelle": {"labels": last6_labels, "data": data},
                "production_annuelle": production_annuelle,
                "production_compare": production_compare,
                "performance_recolteurs": {"labels": perf_year["labels"], "data": perf_year["data"], "ids": perf_year["ids"]},
                "performance_recolteurs_6m": {"labels": perf_6m["labels"], "data": perf_6m["data"], "ids": perf_6m["ids"]},
                "performance_recolteurs_compare": perf_compare,
                "montant_ventes_mensuel": {"labels": last6_labels, "data": ventes_data},
                "montant_ventes_annuel": ventes_annuel,
                "montant_ventes_compare": ventes_compare,
                "production_par_secteur": {"labels": prod_labels, "data": prod_values, "ids": prod_ids, "names": prod_names},
                "production_par_secteur_6m": {"labels": prod_labels, "data": prod_values_6m, "ids": prod_ids, "names": prod_names},
                "production_par_secteur_compare": {"year": selected_year, "labels": prod_labels, "ids": prod_ids, "names": prod_names, "current": prod_values, "previous": prod_values_prev},
                "rendement_par_secteur": {"labels": prod_labels, "data": rendement_values, "ids": prod_ids, "names": prod_names},
                "rendement_par_secteur_6m": {"labels": prod_labels, "data": rendement_values_6m, "ids": prod_ids, "names": prod_names},
                "rendement_par_secteur_compare": {"year": selected_year, "labels": prod_labels, "ids": prod_ids, "names": prod_names, "current": rendement_values, "previous": rendement_values_prev},
                "depenses_vs_production": {
                    "year": selected_year,
                    "labels": month_labels,
                    "production": production_mensuelle_annee,
                    "depenses": depenses_mensuelles,
                },
                "depenses_vs_production_6m": {"labels": last6_labels, "production": data, "depenses": dep_last6},
                "depenses_vs_production_compare": {"year": selected_year, "labels": month_labels, "production_current": production_compare["current"], "production_previous": production_compare["previous"], "depenses_current": depenses_mensuelles, "depenses_previous": depenses_prev},
                "cout_travaux_par_nature": {"labels": cout_nature_labels, "data": cout_nature_values},
                "cout_travaux_par_nature_6m": {"labels": cout_nature_labels_6m, "data": cout_nature_values_6m},
                "cout_travaux_par_nature_compare": {"year": selected_year, "labels": cout_nature_labels, "current": cout_nature_values, "previous": cout_nature_prev_values},
                "cout_travaux_annuel": {"year": selected_year, "labels": month_labels, "data": cout_travaux_annuel},
                "cout_travaux_annuel_6m": {"labels": last6_labels, "data": cout_travaux_last6},
                "cout_travaux_annuel_compare": {"year": selected_year, "labels": month_labels, "current": cout_travaux_annuel, "previous": cout_travaux_prev},
            },
            "lists": {
                "secteurs": secteurs_list,
                "recoltes": recoltes_list,
                "travaux": travaux_list,
                "recus_vente": recus_list,
                "materiels": materiels_list,
            },
            "filters": {
                "secteur": secteur_obj.id if secteur_obj else None,
                "recolteur": recolteur_obj.id if recolteur_obj else None,
                "regime_type": regime_type or None,
            },
        }
    )
