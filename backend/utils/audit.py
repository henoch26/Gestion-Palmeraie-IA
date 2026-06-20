"""
utils/audit.py — Utilitaire centralisé de traçabilité des actions.

Toutes les vues qui modifient des données doivent utiliser log_action() pour
enregistrer l'événement dans ActionLog. Cela alimente deux interfaces :
  - Le Journal d'audit (admin uniquement, page /journal-audit)
  - Mon Audit (superviseur, page /mon-audit)

Fonctions exportées :
  log_action()        — Crée une entrée d'audit
  snapshot()          — Capture l'état actuel d'un objet (pour créations/suppressions)
  diff_fields()       — Calcule les champs modifiés entre deux snapshots
  build_revert_meta() — Capture les valeurs brutes pour permettre un revert admin
"""
import json


def _is_superviseur(user):
    """Vérifie si un utilisateur est superviseur (strict ou adjoint)."""
    try:
        return user.profile.role in ("superviseur", "superviseur_adjoint")
    except Exception:
        return False


def snapshot(instance, field_labels: dict) -> dict:
    """Capture l'état d'un objet Django sous forme lisible {label: valeur}.

    Utilisé avant une suppression ou une création pour garder une trace
    de ce qui existait. field_labels mappe nom_champ → libellé affiché.
    """
    result = {}
    for field, label in field_labels.items():
        val = getattr(instance, field, None)
        result[label] = str(val) if val is not None else ""
    return result


def diff_fields(before: dict, after: dict) -> list:
    """Compare deux snapshots et retourne uniquement les champs qui ont changé.

    Retourne une liste de dicts : [{field, old, new}].
    Utilisé après une modification pour n'afficher que ce qui a vraiment changé.
    """
    return [
        {"field": k, "old": before.get(k, ""), "new": after.get(k, "")}
        for k in before
        if str(before.get(k, "")) != str(after.get(k, ""))
    ]


def build_revert_meta(instance, field_labels: dict, extra_fields: list = None) -> dict:
    """Capture les valeurs brutes d'un objet pour permettre un revert ultérieur.

    Contrairement à snapshot(), conserve les valeurs dans leur type natif
    (int, bool…) plutôt que tout convertir en string. Les champs Decimal
    sont convertis en string pour éviter les erreurs de sérialisation JSON.
    extra_fields permet d'ajouter des champs hors field_labels (ex: clés FK).
    """
    from decimal import Decimal
    raw = {}
    for field_name in field_labels:
        val = getattr(instance, field_name, None)
        raw[field_name] = str(val) if isinstance(val, Decimal) else val
    for field_name in (extra_fields or []):
        val = getattr(instance, field_name, None)
        raw[field_name] = val
    return raw


def log_action(user, action, detail="", fiche=None, recu=None, meta: dict = None, superviseur=None):
    """Enregistre une action dans le journal de traçabilité (ActionLog).

    Paramètres :
      user       — Utilisateur qui effectue l'action (acteur). Peut être None
                   pour les tentatives de connexion anonymes.
      action     — Code de l'action (doit figurer dans ActionLog.ACTION_CHOICES).
      detail     — Description textuelle libre de l'action.
      fiche      — FicheRecolte concernée (optionnel, pour lien direct).
      recu       — FicheRecuVente concerné (optionnel).
      meta       — Dict structuré enrichissant le détail :
                     "changes":  [{field, old, new}]  → modifications
                     "snapshot": {label: valeur}       → état avant suppression/création
      superviseur — Utilisateur superviseur « sujet » de l'action. Si omis,
                    est déduit automatiquement depuis la fiche, le recu ou l'acteur.
                    Utilisé pour filtrer les entrées dans MonAudit du superviseur.

    Le champ `detail` stocké en base est :
      - JSON sérialisé si meta est fourni : {"label": detail, ...meta}
      - Texte brut sinon
    """
    from recoltes.models import ActionLog

    # Résolution automatique du superviseur cible si non fourni explicitement
    if superviseur is None:
        if fiche and fiche.created_by:
            superviseur = fiche.created_by
        elif recu and recu.fiche and recu.fiche.created_by:
            superviseur = recu.fiche.created_by
        elif user and _is_superviseur(user):
            superviseur = user

    # Sérialisation du détail enrichi en JSON
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
