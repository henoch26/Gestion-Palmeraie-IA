import re

from django.db import models
from django.utils.text import slugify


class Secteur(models.Model):
    # Code interne (ex: GP_1), visible dans la fiche
    code = models.CharField(max_length=20, unique=True)
    nom = models.CharField(max_length=120)
    superficie_ha = models.DecimalField(max_digits=8, decimal_places=2)
    situation_relief = models.CharField(max_length=120, blank=True)
    type_sol = models.CharField(max_length=200, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.code} - {self.nom}"

    @staticmethod
    def _code_base_from_nom(nom: str) -> str:
        # slugify -> ascii, puis on colle au format des codes existants (MAJ + underscore)
        base = slugify(nom or "", allow_unicode=False).replace("-", "_").upper()
        base = re.sub(r"[^A-Z0-9_]", "", base)
        base = re.sub(r"_+", "_", base).strip("_")
        return base or "SEC"

    def _generate_unique_code(self) -> str:
        max_len = self._meta.get_field("code").max_length or 20
        base = self._code_base_from_nom(self.nom)[:max_len]
        candidate = base
        i = 1

        # Si conflit, on suffixe: BASE_2, BASE_3, etc. (en respectant max_len)
        while Secteur.objects.filter(code=candidate).exists():
            i += 1
            suffix = f"_{i}"
            cut = max_len - len(suffix)
            candidate = f"{base[: max(1, cut)]}{suffix}"

        return candidate[:max_len]

    def save(self, *args, **kwargs):
        # Le code est genere automatiquement a la creation et reste stable ensuite.
        if not (self.code or "").strip():
            self.code = self._generate_unique_code()
        super().save(*args, **kwargs)
