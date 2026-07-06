import { createContext, useContext, useState, type ReactNode } from "react";

const LS_KEY = "zeus_api_mode";

type ApiModeContextType = {
  isApiMode: boolean;
  setApiMode: (v: boolean) => void;
};

const ApiModeContext = createContext<ApiModeContextType>({
  isApiMode: false,
  setApiMode: () => {},
});

export function ApiModeProvider({ children }: { children: ReactNode }) {
  const [isApiMode, setIsApiMode] = useState<boolean>(() => {
    try {
      return localStorage.getItem(LS_KEY) === "true";
    } catch {
      return false;
    }
  });

  const setApiMode = (v: boolean) => {
    try {
      localStorage.setItem(LS_KEY, String(v));
    } catch {}
    setIsApiMode(v);
  };

  return (
    <ApiModeContext.Provider value={{ isApiMode, setApiMode }}>
      {children}
    </ApiModeContext.Provider>
  );
}

export function useApiMode() {
  return useContext(ApiModeContext);
}
