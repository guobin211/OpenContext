/**
 * LanguageSwitcher - A compact language toggle button.
 */

import { useTranslation } from 'react-i18next';
import { GlobeAltIcon } from '@heroicons/react/24/outline';

const LANGUAGES = [
  { code: 'en', label: 'EN' },
  { code: 'zh', label: '中' },
];

export function LanguageSwitcher() {
  const { t, i18n } = useTranslation();
  const currentLang = i18n.language?.startsWith('zh') ? 'zh' : 'en';

  const toggleLanguage = () => {
    const nextLang = currentLang === 'en' ? 'zh' : 'en';
    i18n.changeLanguage(nextLang);
  };

  const currentLabel = LANGUAGES.find((l) => l.code === currentLang)?.label || 'EN';

  return (
    <button
      type="button"
      onClick={toggleLanguage}
      className="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition-colors"
      title={currentLang === 'en' ? t('common.switchToZh') : t('common.switchToEn')}
    >
      <GlobeAltIcon className="w-4 h-4" />
      <span>{currentLabel}</span>
    </button>
  );
}

