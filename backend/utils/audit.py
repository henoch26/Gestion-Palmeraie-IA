"""
Utilitaire centralisé de traçabilité (ActionLog).
Importez log_action() et diff_fields() depuis n'importe quel view.
"""
import json


def _is_superviseur(user):
    try:
        return user.profile.role in ("superviseur", "superviseur_adjoint")
    except Exception:
        return False


def snapshot(instance, field_labels: dict) -> dict:
    """Retourne un dict {label: valeur} pour les champs indiqués."""
    result = {}
    for field, label in field_labels.items():
        val = getattr(instance, field, None)
        result[label] = str(val) if val is not None else ""
    return result


def diff_fields(before: dict, after: dict) -> list:
    """Retourne la liste des champs qui ont changé : [{field, old, new}]."""
    return [
        {"field": k, "old": before.get(k, ""), "new": after.get(k, "")}
        for k in before
        if str(before.get(k, "")) != str(after.get(k, ""))
    ]


def build_revert_meta(instance, field_labels: dict, extra_fields: list = None) -> dict:
    """Capture les valeurs brutes (par nom de champ) pour permettre un revert ultérieur."""
    from decimal import Decimal
    raw = {}
    for field_name in field_labels:
        val = getattr(instance, field_name, None)
        raw[field_name] = str(val) if isinstance(val, Decimal) else val
    for field_name in (extra_fields or []):
        val = getattr(instance, field_name, None)
        raw[field_name] = val
    return raw


def log_action(user, action, detail="", fiche=None, recu=None, meta: dict = None):
    """Crée une entrée ActionLog.

    meta peut contenir :
      - "changes": [{field, old, new}]  → pour les modifications
      - "snapshot": {label: valeur}     → pour créations / suppressions
    Ces données sont sérialisées en JSON dans le champ `detail`.
    """
    from recoltes.models import ActionLog

    superviseur = None
    if fiche and fiche.created_by:
        superviseur = fiche.created_by
    elif recu and recu.fiche and recu.fiche.created_by:
        superviseur = recu.fiche.created_by
    elif _is_superviseur(user):
        superviseur = user

    if meta:
        stored = {"label": detail}
        stored.update(meta)
        stored_detail = json.dumps(stored, ensure_ascii=False, default=str)
    else:
        stored_detail = detail

    ActionLog.objects.create(
        acteur=user,
        superviseur=superviseur,
        action=action,
        fiche=fiche,
        recu=recu,
        detail=stored_detail,
    )
