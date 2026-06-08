import { createContext, useContext, useState } from "react";

const RecoltesCtx = createContext({ pendingCount: 0, setPendingCount: () => {} });

export function RecoltesProvider({ children }) {
  const [pendingCount, setPendingCount] = useState(0);
  return (
    <RecoltesCtx.Provider value={{ pendingCount, setPendingCount }}>
      {children}
    </RecoltesCtx.Provider>
  );
}

export const useRecoltes = () => useContext(RecoltesCtx);
