// Helpers pour nettoyer les champs numeriques (evite les lettres)
// - entier: uniquement des chiffres
// - decimal: chiffres + un seul separateur decimal (.)
export const sanitizeInt = (value = "") =>
  String(value).replace(/[^\d]/g, "");

export const sanitizeDecimal = (value = "") => {
  const cleaned = String(value)
    .replace(/,/g, ".") // accepte la virgule
    .replace(/[^\d.]/g, "");
  const parts = cleaned.split(".");
  if (parts.length <= 1) return cleaned;
  return `${parts[0]}.${parts.slice(1).join("")}`;
};
