import { useEffect, useMemo, useRef, useState } from "react";

const norm = (v) => String(v ?? "").trim().toLowerCase();

// Select avec barre de recherche (sans dependances externes)
// - allowCustom=false: on ne change la valeur que quand l'utilisateur clique une option.
// - allowCustom=true : comportement "combobox" (la saisie modifie la valeur, les options sont des suggestions).
export default function SearchableSelect({
  value = "",
  options = [],
  onChange,
  placeholder = "Rechercher...",
  disabled = false,
  allowCustom = false,
  clearable = false,
  className = "",
}) {
  const rootRef = useRef(null);
  const inputRef = useRef(null);

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const selectedLabel = useMemo(() => {
    const found = options.find((o) => String(o.value) === String(value));
    if (found) return found.label ?? String(found.value ?? "");
    return String(value ?? "");
  }, [options, value]);

  const filtered = useMemo(() => {
    const q = norm(open ? query : "");
    if (!q) return options;
    return options.filter((o) => {
      const label = norm(o.label ?? o.value);
      const val = norm(o.value);
      return label.includes(q) || val.includes(q);
    });
  }, [options, query, open]);

  const largeList = useMemo(() => (options || []).length > 250, [options]);
  const hasQuery = useMemo(() => !!norm(open ? query : ""), [query, open]);
  const menuOptions = useMemo(() => {
    if (largeList && !hasQuery) return [];
    return filtered;
  }, [filtered, largeList, hasQuery]);

  const grouped = useMemo(() => {
    const map = new Map();
    for (const o of menuOptions) {
      const g = String(o.group || "");
      if (!map.has(g)) map.set(g, []);
      map.get(g).push(o);
    }
    return map;
  }, [menuOptions]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => {
      if (!rootRef.current) return;
      if (rootRef.current.contains(e.target)) return;
      setOpen(false);
      setQuery("");
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  // Quand la valeur externe change, on n'ecrase pas la saisie en cours.
  useEffect(() => {
    if (!open) setQuery("");
  }, [value, open]);

  const handleFocus = () => {
    if (disabled) return;
    setOpen(true);
    // En mode select strict, on vide la recherche au focus.
    // En mode combobox, on garde la valeur pour pouvoir continuer a taper.
    setQuery(allowCustom ? String(value ?? "") : "");
  };

  const handleInputChange = (e) => {
    const next = e.target.value;
    setOpen(true);
    setQuery(next);
    if (allowCustom) onChange?.(next);
  };

  const commitOption = (opt) => {
    onChange?.(opt.value);
    setOpen(false);
    setQuery("");
    // Remettre le focus sur l'input (utile dans les tableaux)
    requestAnimationFrame(() => inputRef.current?.focus?.());
  };

  const clear = () => {
    onChange?.("");
    setQuery("");
    setOpen(false);
  };

  const showValue = open ? query : selectedLabel;

  return (
    <div
      ref={rootRef}
      className={`search-select ${disabled ? "is-disabled" : ""} ${className}`}
      role="combobox"
      aria-expanded={open}
      aria-haspopup="listbox"
    >
      <div className="search-select-control">
        <input
          ref={inputRef}
          className="search-select-input"
          value={showValue}
          placeholder={placeholder}
          disabled={disabled}
          onFocus={handleFocus}
          onChange={handleInputChange}
        />

        {clearable && !disabled && String(value || "").trim() && (
          <button type="button" className="search-select-btn" onClick={clear} aria-label="Effacer">
            ×
          </button>
        )}

        <button
          type="button"
          className="search-select-btn"
          onClick={() => {
            if (disabled) return;
            setOpen((v) => !v);
            if (!open) {
              setQuery(allowCustom ? String(value ?? "") : "");
              requestAnimationFrame(() => inputRef.current?.focus?.());
            }
          }}
          aria-label="Ouvrir"
        >
          ▾
        </button>
      </div>

      {open && (
        <div className="search-select-menu" role="listbox">
          {largeList && !hasQuery ? (
            <div className="search-select-empty">
              Commence a taper pour rechercher ({options.length} options)
            </div>
          ) : menuOptions.length === 0 ? (
            <div className="search-select-empty">Aucun resultat</div>
          ) : (
            Array.from(grouped.entries()).map(([group, opts]) => (
              <div key={group || "__nogroup__"} className="search-select-group">
                {group ? <div className="search-select-group-title">{group}</div> : null}
                {opts.map((o) => {
                  const isSelected = String(o.value) === String(value);
                  return (
                    <button
                      type="button"
                      key={String(o.value)}
                      className={`search-select-option ${isSelected ? "selected" : ""}`}
                      onClick={() => commitOption(o)}
                    >
                      {o.label ?? String(o.value ?? "")}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
