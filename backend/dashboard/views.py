from datetime import date
from decimal import Decimal

from django.db.models import F, Q, Sum, DecimalField, Value
from django.db.models.expressions import ExpressionWrapper
from django.db.models.functions import Coalesce
from rest_framework.decorators import api_view
from rest_framework.response import Response

from materiels.models import MaterielEquipement
from recoltes.models import FicheRecolte, FicheRecolteDetail, FicheRecuVente, FicheRecolteLigne
from recolteurs.models import Personnel
from secteurs.models import Secteur
from travaux.models import FicheTravaux, ConsommableTravaux, RepartitionTache


def _is_admin(user):
    try:
        return user.profile.is_admin
    except AttributeError:
        return False


@api_view(["GET"])
def summary_view(request):
    today = date.today()
    selected_year = int(request.query_params.get("year", today.year))
    prev_year = selected_year - 1
    prev2_year = selected_year - 2

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
        pass
    try:
        if recolteur_id:
            recolteur_obj = Personnel.objects.filter(id=int(recolteur_id)).first()
    except Exception:
        pass

    # ── Base querysets ────────────────────────────────────────────────────────
    # Superviseur : uniquement ses propres fiches ; admin : tout
    user_is_admin = _is_admin(request.user)

    details_qs = FicheRecolteDetail.objects.all()
    if not user_is_admin:
        details_qs = details_qs.filter(ligne__fiche__created_by=request.user)

    fiches_recolte_qs = FicheRecolte.objects.all()
    if not user_is_admin:
        fiches_recolte_qs = fiches_recolte_qs.filter(created_by=request.user)

    travaux_qs = FicheTravaux.objects.all()
    if not user_is_admin:
        travaux_qs = travaux_qs.filter(created_by=request.user)

    # Filtres optionnels (secteur / recolteur / regime)
    if secteur_obj:
        details_qs = details_qs.filter(secteur=secteur_obj)
    if recolteur_obj:
        details_qs = details_qs.filter(ligne__recolteur=recolteur_obj)
    if regime_type:
        details_qs = details_qs.filter(ligne__regime_type=regime_type)

    if secteur_obj:
        fiches_recolte_qs = fiches_recolte_qs.filter(lignes__details__secteur=secteur_obj)
    if recolteur_obj:
        fiches_recolte_qs = fiches_recolte_qs.filter(lignes__recolteur=recolteur_obj)
    if regime_type:
        fiches_recolte_qs = fiches_recolte_qs.filter(lignes__regime_type=regime_type)
    fiches_recolte_qs = fiches_recolte_qs.distinct()

    # ── KPIs année sélectionnée ───────────────────────────────────────────────
    secteurs_count_total = Secteur.objects.count()
    secteurs_actifs = Secteur.objects.filter(statut="actif").count()

    total_production = int(
        details_qs.filter(ligne__fiche__date__year=selected_year).aggregate(total=Sum("quantite"))["total"] or 0
    )
    # Production du jour et du mois courant
    prod_today = int(
        details_qs.filter(ligne__fiche__date=today).aggregate(t=Sum("quantite"))["t"] or 0
    )
    prod_month = int(
        details_qs.filter(
            ligne__fiche__date__year=today.year, ligne__fiche__date__month=today.month
        ).aggregate(t=Sum("quantite"))["t"] or 0
    )
    # Évolution % vs N-1
    total_production_prev = int(
        details_qs.filter(ligne__fiche__date__year=prev_year).aggregate(t=Sum("quantite"))["t"] or 0
    )
    if total_production_prev:
        evolution_pct = round((total_production - total_production_prev) / total_production_prev * 100, 1)
    else:
        evolution_pct = None

    secteurs_involved = (
        details_qs.filter(ligne__fiche__date__year=selected_year)
        .values("secteur").exclude(secteur__isnull=True).distinct().count()
    )
    recolteurs_actifs = (
        details_qs.filter(ligne__fiche__date__year=selected_year)
        .values("ligne__recolteur").exclude(ligne__recolteur__isnull=True).distinct().count()
    )

    # Rendement moyen régimes/ha
    secteur_ids_for_year = (
        details_qs.filter(ligne__fiche__date__year=selected_year)
        .values_list("secteur", flat=True).exclude(secteur__isnull=True).distinct()
    )
    superficie_totale = float(
        Secteur.objects.filter(id__in=secteur_ids_for_year).aggregate(total=Sum("superficie_ha"))["total"] or 0
    )
    rendement_moyen = round(float(total_production) / superficie_totale, 2) if superficie_totale else 0

    # Ventes
    montant_total_ventes = (
        FicheRecuVente.objects.filter(fiche__in=fiches_recolte_qs, date__isnull=False, date__year=selected_year)
        .aggregate(total=Sum("montant"))["total"] or 0
    )
    total_kg = float(
        FicheRecuVente.objects.filter(fiche__in=fiches_recolte_qs, date__isnull=False, date__year=selected_year)
        .aggregate(total=Sum("pesee_kg"))["total"] or 0
    )
    poids_moyen_regime = round(total_kg / float(total_production), 3) if total_production else 0

    # Coûts travaux (calculés en premier pour alimenter depenses_totales)
    cost_expr = ExpressionWrapper(
        F("quantite") * F("prix_unitaire"),
        output_field=DecimalField(max_digits=20, decimal_places=2),
    )
    if secteur_obj:
        travaux_qs = travaux_qs.filter(secteurs_couverts=secteur_obj)
    travaux_qs = travaux_qs.distinct()

    total_consommables = float(
        ConsommableTravaux.objects.filter(fiche__in=travaux_qs, fiche__created_at__year=selected_year)
        .aggregate(total=Sum(cost_expr))["total"] or 0
    )
    total_taches = float(
        RepartitionTache.objects.filter(fiche__in=travaux_qs, fiche__created_at__year=selected_year)
        .aggregate(total=Sum(cost_expr))["total"] or 0
    )
    cout_total_travaux = total_consommables + total_taches

    # Dépenses récolte
    qs_year = fiches_recolte_qs.filter(date__year=selected_year)
    dep_nourriture = float(qs_year.aggregate(t=Sum("depense_nourriture"))["t"] or 0)
    dep_transport  = float(qs_year.aggregate(t=Sum("depense_transport"))["t"] or 0)
    from recoltes.models import FicheRecolteLigne as _LigneYear
    dep_salaires = float(
        _LigneYear.objects.filter(fiche__in=qs_year)
        .aggregate(t=Sum("salaire_calcule"))["t"] or 0
    )
    depenses_total_recolte = dep_nourriture + dep_transport + dep_salaires
    # Dépenses totales d'exploitation = récolte + travaux
    depenses_totales = depenses_total_recolte + cout_total_travaux

    # KPIs financiers supplémentaires
    nb_ventes = FicheRecuVente.objects.filter(
        fiche__in=fiches_recolte_qs, date__isnull=False, date__year=selected_year
    ).count()
    ca_mois = float(
        FicheRecuVente.objects.filter(
            fiche__in=fiches_recolte_qs, date__isnull=False,
            date__year=selected_year, date__month=today.month,
        ).aggregate(t=Sum("montant"))["t"] or 0
    )
    prix_moyen_kg = round(float(montant_total_ventes) / total_kg, 0) if total_kg else 0
    cout_moyen_kg = round(depenses_totales / total_kg, 0) if total_kg else 0
    benefice = float(montant_total_ventes) - depenses_totales
    marge_pct = round(benefice / float(montant_total_ventes) * 100, 1) if float(montant_total_ventes) else 0
    rendement_kg_ha = round(total_kg / superficie_totale, 2) if superficie_totale else 0

    fiches_recolte_count = fiches_recolte_qs.filter(date__year=selected_year).count()
    fiches_travaux_count = travaux_qs.filter(created_at__year=selected_year).count()

    # Répartition production par type de régime
    def repartition_par_regime(target_year):
        result = {}
        for rtype in ("grands", "moyens", "petits"):
            val = details_qs.filter(
                ligne__fiche__date__year=target_year, ligne__regime_type=rtype
            ).aggregate(t=Sum("quantite"))["t"] or 0
            result[rtype] = int(val)
        return result

    # ── Helpers séries mensuelles ─────────────────────────────────────────────
    month_labels = ["Jan", "Fev", "Mar", "Avr", "Mai", "Juin", "Juil", "Aout", "Sept", "Oct", "Nov", "Dec"]

    last6 = []
    m, y = today.month, today.year
    for _ in range(6):
        last6.append((y, m, month_labels[m - 1]))
        m -= 1
        if m == 0:
            m = 12; y -= 1
    last6.reverse()
    last6_labels = [t[2] for t in last6]

    def production_by_month(target_year):
        qs = (
            details_qs.filter(ligne__fiche__date__year=target_year)
            .values("ligne__fiche__date__month").annotate(total=Sum("quantite"))
        )
        by_month = {r["ligne__fiche__date__month"]: int(r["total"] or 0) for r in qs}
        return {"year": target_year, "labels": month_labels, "data": [by_month.get(m, 0) for m in range(1, 13)]}

    def ventes_by_month(target_year):
        qs = (
            FicheRecuVente.objects.filter(fiche__in=fiches_recolte_qs, date__isnull=False, date__year=target_year)
            .values("date__month").annotate(total=Sum("montant"))
        )
        by_month = {r["date__month"]: float(r["total"] or 0) for r in qs}
        return {"year": target_year, "labels": month_labels, "data": [by_month.get(m, 0) for m in range(1, 13)]}

    # Production 6 derniers mois
    prod_last6 = []
    for yy, mm, _ in last6:
        val = details_qs.filter(ligne__fiche__date__year=yy, ligne__fiche__date__month=mm)\
                        .aggregate(t=Sum("quantite"))["t"] or 0
        prod_last6.append(int(val))

    # Ventes 6 derniers mois
    ventes_last6 = []
    for yy, mm, _ in last6:
        val = FicheRecuVente.objects.filter(
            fiche__in=fiches_recolte_qs, date__isnull=False, date__year=yy, date__month=mm
        ).aggregate(t=Sum("montant"))["t"] or 0
        ventes_last6.append(float(val))

    # Comparaisons N / N-1 / N-2
    production_annuelle = production_by_month(selected_year)
    production_compare = {
        "year": selected_year,
        "labels": month_labels,
        "current": production_by_month(selected_year)["data"],
        "previous": production_by_month(prev_year)["data"],
        "prev2": production_by_month(prev2_year)["data"],
    }
    ventes_annuel = ventes_by_month(selected_year)
    ventes_compare = {
        "year": selected_year,
        "labels": month_labels,
        "current": ventes_by_month(selected_year)["data"],
        "previous": ventes_by_month(prev_year)["data"],
        "prev2": ventes_by_month(prev2_year)["data"],
    }

    # Performance récolteurs (top 5)
    def perf_recolteurs_year(target_year):
        qs = (
            details_qs.filter(ligne__fiche__date__year=target_year)
            .exclude(ligne__recolteur__isnull=True)
            .values("ligne__recolteur", "ligne__recolteur__nom", "ligne__recolteur_nom")
            .annotate(total=Sum("quantite")).order_by("-total")[:5]
        )
        labels = [(p["ligne__recolteur__nom"] or p["ligne__recolteur_nom"] or "N/A") for p in qs]
        ids = [p["ligne__recolteur"] for p in qs]
        return {"labels": labels, "ids": ids, "data": [int(p["total"] or 0) for p in qs]}

    def perf_recolteurs_last6():
        q = Q()
        for yy, mm, _ in last6:
            q |= Q(ligne__fiche__date__year=yy, ligne__fiche__date__month=mm)
        qs = (
            details_qs.filter(q)
            .exclude(ligne__recolteur__isnull=True)
            .values("ligne__recolteur", "ligne__recolteur__nom", "ligne__recolteur_nom")
            .annotate(total=Sum("quantite")).order_by("-total")[:5]
        )
        labels = [(p["ligne__recolteur__nom"] or p["ligne__recolteur_nom"] or "N/A") for p in qs]
        ids = [p["ligne__recolteur"] for p in qs]
        return {"labels": labels, "ids": ids, "data": [int(p["total"] or 0) for p in qs]}

    perf_year = perf_recolteurs_year(selected_year)
    perf_6m = perf_recolteurs_last6()

    q_prev = (
        details_qs.filter(ligne__fiche__date__year=prev_year, ligne__recolteur__in=perf_year["ids"])
        .values("ligne__recolteur").annotate(total=Sum("quantite"))
    )
    prev_map = {r["ligne__recolteur"]: int(r["total"] or 0) for r in q_prev}
    perf_compare = {
        "year": selected_year, "labels": perf_year["labels"], "ids": perf_year["ids"],
        "current": perf_year["data"],
        "previous": [prev_map.get(i, 0) for i in perf_year["ids"]],
    }

    # Production par secteur
    secteurs_ordered = list(Secteur.objects.all().order_by("code")
                             .filter(**({} if not secteur_obj else {"id": secteur_obj.id}))
                             .values("id", "code", "nom", "superficie_ha", "statut"))
    prod_labels = [s["code"] for s in secteurs_ordered]
    prod_ids = [s["id"] for s in secteurs_ordered]
    prod_names = [s["nom"] for s in secteurs_ordered]

    def production_par_secteur_year(target_year):
        qs = (
            details_qs.filter(ligne__fiche__date__year=target_year)
            .values("secteur__id", "secteur__code").annotate(total=Sum("quantite"))
        )
        by_code = {r["secteur__code"]: int(r["total"] or 0) for r in qs if r["secteur__code"]}
        return [by_code.get(code, 0) for code in prod_labels]

    def production_par_secteur_last6():
        q = Q()
        for yy, mm, _ in last6:
            q |= Q(ligne__fiche__date__year=yy, ligne__fiche__date__month=mm)
        qs = (
            details_qs.filter(q)
            .values("secteur__id", "secteur__code").annotate(total=Sum("quantite"))
        )
        by_code = {r["secteur__code"]: int(r["total"] or 0) for r in qs if r["secteur__code"]}
        return [by_code.get(code, 0) for code in prod_labels]

    prod_values = production_par_secteur_year(selected_year)
    prod_values_6m = production_par_secteur_last6()
    prod_values_prev = production_par_secteur_year(prev_year)
    prod_values_prev2 = production_par_secteur_year(prev2_year)

    rendement_values = []
    rendement_values_6m = []
    rendement_values_prev = []
    for idx, s in enumerate(secteurs_ordered):
        sup = float(s["superficie_ha"] or 0)
        v = prod_values[idx] if idx < len(prod_values) else 0
        v6 = prod_values_6m[idx] if idx < len(prod_values_6m) else 0
        vp = prod_values_prev[idx] if idx < len(prod_values_prev) else 0
        rendement_values.append(round(float(v) / sup, 4) if sup else 0)
        rendement_values_6m.append(round(float(v6) / sup, 4) if sup else 0)
        rendement_values_prev.append(round(float(vp) / sup, 4) if sup else 0)

    # Dépenses mensuelles (nourriture + transport + salaires récolteurs)
    zero_money = Value(0, output_field=DecimalField(max_digits=12, decimal_places=2))
    from recoltes.models import FicheRecolteLigne as _LigneDep

    def _dep_mensuelle(fiches_qs, trav_qs, year):
        # Récolte : nourriture + transport + salaires
        dep_qs = (
            fiches_qs.filter(date__year=year)
            .values("date__month")
            .annotate(
                nourriture=Coalesce(Sum("depense_nourriture"), zero_money),
                transport=Coalesce(Sum("depense_transport"), zero_money),
            )
        )
        base = {r["date__month"]: float(r["nourriture"] + r["transport"]) for r in dep_qs}
        sal_qs = (
            _LigneDep.objects.filter(fiche__in=fiches_qs.filter(date__year=year))
            .values("fiche__date__month")
            .annotate(total=Sum("salaire_calcule"))
        )
        for r in sal_qs:
            m = r["fiche__date__month"]
            base[m] = base.get(m, 0.0) + float(r["total"] or 0)
        # Travaux : consommables + tâches
        for r in (ConsommableTravaux.objects
                  .filter(fiche__in=trav_qs, fiche__created_at__year=year)
                  .values("fiche__created_at__month").annotate(total=Sum(cost_expr))):
            m = r["fiche__created_at__month"]
            base[m] = base.get(m, 0.0) + float(r["total"] or 0)
        for r in (RepartitionTache.objects
                  .filter(fiche__in=trav_qs, fiche__created_at__year=year)
                  .values("fiche__created_at__month").annotate(total=Sum(cost_expr))):
            m = r["fiche__created_at__month"]
            base[m] = base.get(m, 0.0) + float(r["total"] or 0)
        return [base.get(m, 0.0) for m in range(1, 13)]

    depenses_mensuelles = _dep_mensuelle(fiches_recolte_qs, travaux_qs, selected_year)
    depenses_prev       = _dep_mensuelle(fiches_recolte_qs, travaux_qs, prev_year)

    dep_last6 = []
    for yy, mm, _ in last6:
        fiches_m = fiches_recolte_qs.filter(date__year=yy, date__month=mm)
        trav_m   = travaux_qs.filter(created_at__year=yy, created_at__month=mm)
        row = fiches_m.aggregate(
            nourriture=Coalesce(Sum("depense_nourriture"), zero_money),
            transport=Coalesce(Sum("depense_transport"), zero_money),
        )
        sal  = float(_LigneDep.objects.filter(fiche__in=fiches_m).aggregate(t=Sum("salaire_calcule"))["t"] or 0)
        cons = float(ConsommableTravaux.objects.filter(fiche__in=trav_m).aggregate(t=Sum(cost_expr))["t"] or 0)
        tach = float(RepartitionTache.objects.filter(fiche__in=trav_m).aggregate(t=Sum(cost_expr))["t"] or 0)
        dep_last6.append(float((row.get("nourriture") or 0) + (row.get("transport") or 0)) + sal + cons + tach)

    # Dépenses par secteur et par type de régime
    def depenses_par_secteur(target_year):
        result = {}
        for code in prod_labels:
            fiches_ids = (
                FicheRecolteDetail.objects.filter(
                    secteur__code=code, ligne__fiche__date__year=target_year
                ).values_list("ligne__fiche_id", flat=True).distinct()
            )
            dep = float(
                FicheRecolte.objects.filter(id__in=fiches_ids).aggregate(
                    t=Coalesce(Sum("depense_nourriture") + Sum("depense_transport"), zero_money)
                )["t"] or 0
            )
            result[code] = round(dep, 2)
        return result

    dep_par_secteur = depenses_par_secteur(selected_year)

    # ── Répartition régimes par secteur (grands/moyens/petits par secteur) ──────
    def production_par_regime_et_secteur(target_year):
        result = {}
        for rtype in ("grands", "moyens", "petits"):
            qs = (
                details_qs
                .filter(ligne__fiche__date__year=target_year, ligne__regime_type=rtype)
                .values("secteur__code")
                .annotate(total=Sum("quantite"))
            )
            for r in qs:
                code = r["secteur__code"]
                if code:
                    if code not in result:
                        result[code] = {"grands": 0, "moyens": 0, "petits": 0}
                    result[code][rtype] = int(r["total"] or 0)
        return result

    regime_secteur = production_par_regime_et_secteur(selected_year)

    # ── Tableau détaillé par secteur (pour camembert + classement) ────────────
    secteurs_detail = []
    for idx, s in enumerate(secteurs_ordered):
        prod = prod_values[idx] if idx < len(prod_values) else 0
        sup = float(s["superficie_ha"] or 0)
        rend_reg = rendement_values[idx] if idx < len(rendement_values) else 0
        secteurs_detail.append({
            "id": s["id"],
            "code": s["code"],
            "nom": s["nom"],
            "statut": s["statut"],
            "superficie_ha": sup,
            "production_regimes": prod,
            "rendement_reg_ha": rend_reg,
            "part_pct": round(float(prod) / float(total_production) * 100, 1) if total_production else 0,
        })
    # Tri par production décroissante pour le classement
    secteurs_detail_sorted = sorted(secteurs_detail, key=lambda x: x["production_regimes"], reverse=True)

    # ── Tableau détaillé par récolteur (top 20) ───────────────────────────────
    from recoltes.models import FicheRecolteLigne as _Ligne
    prod_by_rec = (
        details_qs.filter(ligne__fiche__date__year=selected_year)
        .exclude(ligne__recolteur__isnull=True)
        .values("ligne__recolteur", "ligne__recolteur__nom", "ligne__recolteur__numero_telephone")
        .annotate(total_regimes=Sum("quantite"))
        .order_by("-total_regimes")
    )
    salaire_qs = (
        _Ligne.objects.filter(fiche__date__year=selected_year, recolteur__isnull=False)
        .values("recolteur")
        .annotate(total_salaire=Sum("salaire_calcule"))
    )
    sal_map = {r["recolteur"]: float(r["total_salaire"] or 0) for r in salaire_qs}
    recolteurs_detail = []
    total_rec = Personnel.objects.count()
    for r in prod_by_rec:
        rid = r["ligne__recolteur"]
        prod_r = int(r["total_regimes"] or 0)
        recolteurs_detail.append({
            "id": rid,
            "numero_telephone": r["ligne__recolteur__numero_telephone"] or "",
            "nom": r["ligne__recolteur__nom"] or "N/A",
            "total_regimes": prod_r,
            "salaire_calcule": sal_map.get(rid, 0.0),
        })


    # ── Répartition régimes avec % ────────────────────────────────────────────
    reg = repartition_par_regime(selected_year)
    reg_total = sum(reg.values())
    reg_pct = {
        k: {"count": v, "pct": round(v / reg_total * 100, 1) if reg_total else 0}
        for k, v in reg.items()
    }


    # Coûts travaux par nature
    def cout_travaux_par_nature_for_qs(trav_qs, year_filter=None, month_pairs=None):
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

        cost_map = {}
        for r in cons.values("fiche__nature_travaux").annotate(total=Sum(cost_expr)):
            key = (r["fiche__nature_travaux"] or "").strip() or "N/A"
            cost_map[key] = cost_map.get(key, 0) + float(r["total"] or 0)
        for r in taches.values("fiche__nature_travaux").annotate(total=Sum(cost_expr)):
            key = (r["fiche__nature_travaux"] or "").strip() or "N/A"
            cost_map[key] = cost_map.get(key, 0) + float(r["total"] or 0)
        return cost_map

    cost_nature_map = cout_travaux_par_nature_for_qs(travaux_qs, year_filter=selected_year)
    top_natures = sorted(cost_nature_map.items(), key=lambda x: x[1], reverse=True)[:8]
    cout_nature_labels = [k for k, _ in top_natures]
    cout_nature_values = [round(v, 2) for _, v in top_natures]

    cost_nature_map_6m = cout_travaux_par_nature_for_qs(travaux_qs, month_pairs=last6)
    top_natures_6m = sorted(cost_nature_map_6m.items(), key=lambda x: x[1], reverse=True)[:8]
    cout_nature_labels_6m = [k for k, _ in top_natures_6m]
    cout_nature_values_6m = [round(v, 2) for _, v in top_natures_6m]

    cost_nature_map_prev = cout_travaux_par_nature_for_qs(travaux_qs, year_filter=prev_year)
    cout_nature_prev_values = [round(cost_nature_map_prev.get(k, 0.0), 2) for k in cout_nature_labels]

    def cout_travaux_by_month(target_year):
        cost_map = {}
        for r in ConsommableTravaux.objects.filter(fiche__in=travaux_qs, fiche__created_at__year=target_year)\
                .values("fiche__created_at__month").annotate(total=Sum(cost_expr)):
            mm = r["fiche__created_at__month"]
            cost_map[mm] = cost_map.get(mm, 0) + float(r["total"] or 0)
        for r in RepartitionTache.objects.filter(fiche__in=travaux_qs, fiche__created_at__year=target_year)\
                .values("fiche__created_at__month").annotate(total=Sum(cost_expr)):
            mm = r["fiche__created_at__month"]
            cost_map[mm] = cost_map.get(mm, 0) + float(r["total"] or 0)
        return [round(cost_map.get(mm, 0.0), 2) for mm in range(1, 13)]

    cout_travaux_annuel = cout_travaux_by_month(selected_year)
    cout_travaux_prev = cout_travaux_by_month(prev_year)

    cout_travaux_last6 = []
    for yy, mm, _ in last6:
        tc = float(ConsommableTravaux.objects.filter(fiche__in=travaux_qs,
                    fiche__created_at__year=yy, fiche__created_at__month=mm)
                    .aggregate(t=Sum(cost_expr))["t"] or 0)
        tt = float(RepartitionTache.objects.filter(fiche__in=travaux_qs,
                    fiche__created_at__year=yy, fiche__created_at__month=mm)
                    .aggregate(t=Sum(cost_expr))["t"] or 0)
        cout_travaux_last6.append(round(tc + tt, 2))

    # Production journalière
    prod_by_date_qs = (
        details_qs.filter(ligne__fiche__date__year=selected_year)
        .values("ligne__fiche__date").annotate(total=Sum("quantite"))
        .order_by("ligne__fiche__date")
    )
    production_par_date_chart = {
        "labels": [str(r["ligne__fiche__date"]) for r in prod_by_date_qs],
        "data": [int(r["total"] or 0) for r in prod_by_date_qs],
    }

    # Multi-années
    years_param = request.query_params.get("years", "")
    multi_years_list = sorted({
        int(y_str.strip()) for y_str in years_param.split(",")
        if y_str.strip().isdigit() and 2000 <= int(y_str.strip()) <= 2100
    }) or [selected_year]

    production_multi_years = [
        {"year": y, "labels": month_labels, "data": production_by_month(y)["data"]}
        for y in multi_years_list
    ]
    production_par_secteur_multi_years = [
        {"year": y, "labels": prod_labels, "ids": prod_ids, "data": production_par_secteur_year(y)}
        for y in multi_years_list
    ]

    # Listes rapides
    secteurs_list = list(Secteur.objects.all().order_by("-id")[:5].values("code", "nom", "superficie_ha", "statut"))
    recoltes_list = list(fiches_recolte_qs.all().order_by("-date")[:5].values("id", "date", "statut"))
    travaux_list = list(travaux_qs.all().order_by("-id")[:5].values("id", "periode_travaux", "nature_travaux", "statut_avancement"))
    recus_list = list(FicheRecuVente.objects.filter(fiche__in=fiches_recolte_qs).order_by("-id")[:5].values("date", "client", "montant"))
    materiels_list = list(MaterielEquipement.objects.all().order_by("-id")[:5].values("numero", "designation", "quantite", "statut_utilisation"))

    return Response({
        "year": selected_year,
        "stats": {
            # Production
            "total_production": total_production,
            "prod_today": prod_today,
            "prod_month": prod_month,
            "total_production_prev": total_production_prev,
            "evolution_pct": evolution_pct,
            "total_kg": round(total_kg, 2),
            "poids_moyen_regime": poids_moyen_regime,
            "rendement_moyen": rendement_moyen,
            "rendement_kg_ha": rendement_kg_ha,
            "repartition_par_regime": reg,
            "repartition_par_regime_pct": reg_pct,
            # Secteurs
            "secteurs_count": secteurs_count_total,
            "secteurs_actifs": secteurs_actifs,
            "secteurs_involved": secteurs_involved,
            # Récolteurs
            "recolteurs_actifs": recolteurs_actifs,
            "total_recolteurs": total_rec,
            # Financier
            "montant_total_ventes": float(montant_total_ventes),
            "nb_ventes": nb_ventes,
            "ca_mois": ca_mois,
            "prix_moyen_kg": prix_moyen_kg,
            "depenses_total_recolte": depenses_total_recolte,
            "dep_nourriture": dep_nourriture,
            "dep_transport": dep_transport,
            "depenses_salaires_recolteurs": dep_salaires,
            "depenses_totales": depenses_totales,
            "benefice": benefice,
            "marge_pct": marge_pct,
            "cout_moyen_kg": cout_moyen_kg,
            "cout_total_travaux": cout_total_travaux,
            # Fiches
            "fiches_recolte_count": fiches_recolte_count,
            "fiches_travaux_count": fiches_travaux_count,
        },
        "tables": {
            "secteurs_detail": secteurs_detail_sorted,
            "recolteurs_detail": recolteurs_detail,
        },
        "charts": {
            "production_mensuelle": {"labels": last6_labels, "data": prod_last6},
            "production_annuelle": production_annuelle,
            "production_compare": production_compare,
            "performance_recolteurs": {"labels": perf_year["labels"], "data": perf_year["data"], "ids": perf_year["ids"]},
            "performance_recolteurs_6m": {"labels": perf_6m["labels"], "data": perf_6m["data"], "ids": perf_6m["ids"]},
            "performance_recolteurs_compare": perf_compare,
            "montant_ventes_mensuel": {"labels": last6_labels, "data": ventes_last6},
            "montant_ventes_annuel": ventes_annuel,
            "montant_ventes_compare": ventes_compare,
            "production_par_secteur": {"labels": prod_labels, "data": prod_values, "ids": prod_ids, "names": prod_names},
            "production_par_secteur_6m": {"labels": prod_labels, "data": prod_values_6m, "ids": prod_ids, "names": prod_names},
            "production_par_secteur_compare": {
                "year": selected_year, "labels": prod_labels, "ids": prod_ids, "names": prod_names,
                "current": prod_values, "previous": prod_values_prev, "prev2": prod_values_prev2,
            },
            "rendement_par_secteur": {"labels": prod_labels, "data": rendement_values, "ids": prod_ids, "names": prod_names},
            "rendement_par_secteur_6m": {"labels": prod_labels, "data": rendement_values_6m, "ids": prod_ids, "names": prod_names},
            "rendement_par_secteur_compare": {
                "year": selected_year, "labels": prod_labels, "ids": prod_ids, "names": prod_names,
                "current": rendement_values, "previous": rendement_values_prev,
            },
            "depenses_vs_production": {
                "year": selected_year, "labels": month_labels,
                "production": production_by_month(selected_year)["data"],
                "depenses": depenses_mensuelles,
            },
            "depenses_vs_production_6m": {"labels": last6_labels, "production": prod_last6, "depenses": dep_last6},
            "depenses_vs_production_compare": {
                "year": selected_year, "labels": month_labels,
                "production_current": production_compare["current"],
                "production_previous": production_compare["previous"],
                "depenses_current": depenses_mensuelles,
                "depenses_previous": depenses_prev,
            },
            "depenses_par_secteur": {"labels": prod_labels, "data": [dep_par_secteur.get(c, 0) for c in prod_labels]},
            "cout_travaux_par_nature": {"labels": cout_nature_labels, "data": cout_nature_values},
            "cout_travaux_par_nature_6m": {"labels": cout_nature_labels_6m, "data": cout_nature_values_6m},
            "cout_travaux_par_nature_compare": {
                "year": selected_year, "labels": cout_nature_labels,
                "current": cout_nature_values, "previous": cout_nature_prev_values,
            },
            "cout_travaux_annuel": {"year": selected_year, "labels": month_labels, "data": cout_travaux_annuel},
            "cout_travaux_annuel_6m": {"labels": last6_labels, "data": cout_travaux_last6},
            "cout_travaux_annuel_compare": {
                "year": selected_year, "labels": month_labels,
                "current": cout_travaux_annuel, "previous": cout_travaux_prev,
            },
            "production_par_regime_secteur": {
                "labels": prod_labels,
                "grands": [regime_secteur.get(c, {}).get("grands", 0) for c in prod_labels],
                "moyens": [regime_secteur.get(c, {}).get("moyens", 0) for c in prod_labels],
                "petits": [regime_secteur.get(c, {}).get("petits", 0) for c in prod_labels],
            },
            "production_par_date": production_par_date_chart,
            "production_multi_years": production_multi_years,
            "production_par_secteur_multi_years": production_par_secteur_multi_years,
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
    })
