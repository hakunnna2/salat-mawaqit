import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

const resources = {
  en: {
    translation: {
      "app_name": "Salat Mawaqit",
      "fajr": "Fajr",
      "sunrise": "Sunrise",
      "dhuhr": "Dhuhr",
      "asr": "Asr",
      "maghrib": "Maghrib",
      "isha": "Isha",
      "next_prayer": "Next Prayer",
      "current_prayer": "Current Prayer",
      "location_error": "Please enable location or select a city",
      "location_detecting": "Detecting...",
      "location_active": "Location active",
      "location_permission_denied": "Location denied",
      "location_not_supported": "Location is not supported on this device",
      "location_using_saved": "Using your saved location",
      "location_mode": "Location Mode",
      "location_mode_auto": "GPS",
      "location_mode_manual": "City",
      "location_mode_manual_hint": "GPS detection is disabled. Search by city above.",
      "pinned_location": "Pinned location",
      "settings": "Settings",
      "language": "Language",
      "prayer_adjustments": "Prayer Adjustments",
      "reset": "Reset",
      "minute_short": "min",
      "notifications": "Notifications",
      "enable_notifications": "Enable Notifications",
      "notification_time_now": "Time now",
      "countdown_suffix": "remaining",
      "city_placeholder": "Enter city name...",
      "city_not_found": "City not found",
      "change_city": "Change city",
      "search_failed": "Search failed",
      "search": "Search",
      "retry_location": "Try detecting location again"
    }
  },
  fr: {
    translation: {
      "app_name": "Salat Mawaqit",
      "fajr": "Fajr",
      "sunrise": "Chourouk",
      "dhuhr": "Dhuhr",
      "asr": "Asr",
      "maghrib": "Maghrib",
      "isha": "Isha",
      "next_prayer": "Prochaine Prière",
      "current_prayer": "Prière Actuelle",
      "location_error": "Veuillez activer la localisation ou choisir une ville",
      "location_detecting": "Détection...",
      "location_active": "Localisation active",
      "location_permission_denied": "Localisation refusée",
      "location_not_supported": "La localisation n'est pas prise en charge sur cet appareil",
      "location_using_saved": "Utilisation de votre position enregistrée",
      "location_mode": "Mode de localisation",
      "location_mode_auto": "GPS",
      "location_mode_manual": "Ville",
      "location_mode_manual_hint": "La détection GPS est désactivée. Recherchez une ville ci-dessus.",
      "pinned_location": "Position épinglée",
      "settings": "Paramètres",
      "language": "Langue",
      "prayer_adjustments": "Ajustement des prières",
      "reset": "Réinitialiser",
      "minute_short": "min",
      "notifications": "Notifications",
      "enable_notifications": "Activer les notifications",
      "notification_time_now": "C'est l'heure",
      "countdown_suffix": "restant",
      "city_placeholder": "Entrez le nom de la ville...",
      "city_not_found": "Ville introuvable",
      "change_city": "Changer de ville",
      "search_failed": "Échec de la recherche",
      "search": "Rechercher",
      "retry_location": "Réessayer de détecter la localisation"
    }
  },
  ar: {
    translation: {
      "app_name": "صلاة مواقيت",
      "fajr": "الفجر",
      "sunrise": "الشروق",
      "dhuhr": "الظهر",
      "asr": "العصر",
      "maghrib": "المغرب",
      "isha": "العشاء",
      "next_prayer": "الصلاة القادمة",
      "current_prayer": "الصلاة الحالية",
      "location_error": "يرجى تفعيل الموقع أو اختيار مدينة",
      "location_detecting": "جارٍ تحديد الموقع...",
      "location_active": "الموقع نشط",
      "location_permission_denied": "تم رفض الموقع",
      "location_not_supported": "الموقع غير مدعوم على هذا الجهاز",
      "location_using_saved": "يتم استخدام موقعك المحفوظ",
      "location_mode": "وضع الموقع",
      "location_mode_auto": "GPS",
      "location_mode_manual": "المدينة",
      "location_mode_manual_hint": "تم تعطيل اكتشاف GPS. ابحث عن مدينة في الأعلى.",
      "pinned_location": "موقع مثبت",
      "settings": "الإعدادات",
      "language": "اللغة",
      "prayer_adjustments": "تعديل أوقات الصلاة",
      "reset": "إعادة تعيين",
      "minute_short": "د",
      "notifications": "التنبيهات",
      "enable_notifications": "تفعيل التنبيهات",
      "notification_time_now": "حان الوقت الآن",
      "countdown_suffix": "متبقي",
      "city_placeholder": "أدخل اسم المدينة...",
      "city_not_found": "لم يتم العثور على المدينة",
      "change_city": "تغيير المدينة",
      "search_failed": "فشل البحث",
      "search": "بحث",
      "retry_location": "حاول اكتشاف الموقع مرة أخرى"
    }
  }
};

i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: "fr", // Default as requested
    interpolation: {
      escapeValue: false
    }
  });

export default i18n;
