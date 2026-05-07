import { createContext, useContext, useState, useEffect, useMemo, useCallback, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Language, defaultLanguage, getTranslations } from '@/constants/i18n';

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => Promise<void>;
  t: ReturnType<typeof getTranslations>;
}

const LanguageContext = createContext<LanguageContextType>({
  language: defaultLanguage,
  setLanguage: async () => {},
  t: getTranslations(defaultLanguage),
});

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLang] = useState<Language>(defaultLanguage);

  useEffect(() => {
    AsyncStorage.getItem('app_language').then((saved) => {
      if (saved && saved in getTranslations) {
        setLang(saved as Language);
      }
    });
  }, []);

  const setLanguage = useCallback(async (lang: Language) => {
    setLang(lang);
    await AsyncStorage.setItem('app_language', lang);
  }, []);

  // Memoize the entire context value. Without this, getTranslations() creates a
  // new object on every render, which causes every useLanguage() consumer —
  // including the tabs layout — to re-render and reset the navigator to tab 0.
  const value = useMemo(
    () => ({ language, setLanguage, t: getTranslations(language) }),
    [language, setLanguage]
  );

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
}

export const useLanguage = () => useContext(LanguageContext);
