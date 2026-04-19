import { useEffect, useMemo, useState } from "react";

// Reusable table with search, sort, and pagination
export default function DataTable({
  columns = [],
  rows = [],
  pageSize = 5,
  minWidth = 720, // px; set to 0 to disable horizontal overflow for small tables
}) {
  // Search query
  const [query, setQuery] = useState("");

  // Sort state
  const [sortKey, setSortKey] = useState(null);
  const [sortDir, setSortDir] = useState("asc");

  // Pagination state
  const [page, setPage] = useState(1);

  // Filter rows by search query
  const filtered = useMemo(() => {
    if (!query) return rows;
    const q = query.toLowerCase();
    return rows.filter((row) =>
      columns.some((col) => String(row[col.key] ?? "").toLowerCase().includes(q))
    );
  }, [rows, columns, query]);

  // Sort filtered rows
  const sorted = useMemo(() => {
    if (!sortKey) return filtered;
    const dir = sortDir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const va = a[sortKey];
      const vb = b[sortKey];
      if (va === vb) return 0;
      return va > vb ? dir : -dir;
    });
  }, [filtered, sortKey, sortDir]);

  // Pagination window
  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const start = (page - 1) * pageSize;
  const paged = sorted.slice(start, start + pageSize);

  // Keep page in range after filters change
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  // Toggle sort on column click
  const toggleSort = (key) => {
    if (sortKey === key) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
    setPage(1);
  };

  return (
    <div className="table-wrapper">
      {/* Search bar */}
      <div className="table-tools">
        <input
          className="table-search"
          placeholder="Rechercher..."
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setPage(1);
          }}
        />
      </div>

      {/* Table avec scroll horizontal si besoin */}
      <div className="table-scroll">
        <table className="data-table" style={{ minWidth }}>
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c.key} onClick={() => toggleSort(c.key)}>
                  {c.label ?? c.key}
                  {sortKey === c.key ? (sortDir === "asc" ? " ^" : " v") : ""}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paged.length === 0 ? (
              <tr>
                <td className="empty-row" colSpan={Math.max(columns.length, 1)}>
                  Aucune donnee
                </td>
              </tr>
            ) : (
              paged.map((row, i) => (
                <tr key={i}>
                  {columns.map((c) => (
                    <td key={c.key}>
                      {c.render ? c.render(row) : row[c.key]}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="table-pagination">
        <button disabled={page === 1} onClick={() => setPage(page - 1)}>
          Precedent
        </button>
        <span>
          Page {page} / {totalPages}
        </span>
        <button disabled={page === totalPages} onClick={() => setPage(page + 1)}>
          Suivant
        </button>
      </div>
    </div>
  );
}
