import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { translateNode, translateText } from '../i18n/translations';

const LanguageContext = createContext(null);

export function LanguageProvider({ children }) {
  const [language, setLanguageState] = useState('en');

  useEffect(() => {
    AsyncStorage.getItem('servista_language').then((saved) => {
      if (saved === 'fr' || saved === 'en') setLanguageState(saved);
    });
  }, []);

  const setLanguage = async (nextLanguage) => {
    const normalized = nextLanguage === 'fr' || nextLanguage === 'French' ? 'fr' : 'en';
    await AsyncStorage.setItem('servista_language', normalized);
    setLanguageState(normalized);
  };

  const value = useMemo(() => ({
    language,
    languageLabel: language === 'fr' ? 'French' : 'English',
    setLanguage,
    t: (valueToTranslate) => translateText(valueToTranslate, language),
    tn: (node) => translateNode(node, language)
  }), [language]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export const useLanguage = () => useContext(LanguageContext);
