/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  MapPin, 
  Settings as SettingsIcon, 
  Bell, 
  BellOff, 
  Clock as ClockIcon, 
  ChevronRight,
  Languages,
  Info,
  X
} from 'lucide-react';
import { format, addMinutes, parse, isBefore, isAfter, differenceInSeconds } from 'date-fns';
import { useTranslation } from 'react-i18next';
import './i18n';
import { cn } from './lib/utils';

// --- Types ---
interface PrayerTimes {
  Fajr: string;
  Sunrise: string;
  Dhuhr: string;
  Asr: string;
  Maghrib: string;
  Isha: string;
}

interface LocationData {
  latitude: number;
  longitude: number;
  city?: string;
}

type LocationPermissionState = 'granted' | 'denied' | 'prompt' | 'unsupported' | 'unknown';
type LocationMode = 'auto' | 'manual';
type PrayerOffsets = Record<SalatName, number>;

// --- Constants ---
const PRAYER_NAMES = ['Fajr', 'Sunrise', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'] as const;
type PrayerName = typeof PRAYER_NAMES[number];
const SALAT_NAMES = ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'] as const;
type SalatName = typeof SALAT_NAMES[number];
const HABOUS_METHOD_ID = 21;
const LOCATION_STORAGE_KEY = 'salat_mawaqit_location';
const LOCATION_MODE_STORAGE_KEY = 'salat_mawaqit_location_mode';
const PRAYER_OFFSETS_STORAGE_KEY = 'salat_mawaqit_prayer_offsets';
const PINNED_COUNTDOWN_TAG = 'next-prayer-countdown';
const DEFAULT_FALLBACK_LOCATION: LocationData = { latitude: 33.5731, longitude: -7.5898, city: 'Casablanca' };
const DEFAULT_PRAYER_OFFSETS: PrayerOffsets = {
  Fajr: 0,
  Dhuhr: 0,
  Asr: 0,
  Maghrib: 0,
  Isha: 0,
};

// --- Components ---

const Clock = () => {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="text-4xl font-light tracking-tight font-mono">
      {format(time, 'HH:mm:ss')}
    </div>
  );
};

const PrayerCard = ({ 
  name, 
  time, 
  isCurrent, 
  isNext,
  label 
}: { 
  name: string; 
  time: string; 
  isCurrent: boolean; 
  isNext: boolean;
  label: string;
}) => {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "relative p-6 rounded-3xl transition-all duration-500 overflow-hidden",
        isCurrent 
          ? "bg-[#5A5A40] text-white shadow-xl scale-[1.02] z-10" 
          : "bg-white text-[#5A5A40] border border-[#5A5A40]/10"
      )}
    >
      {isCurrent && (
        <motion.div 
          layoutId="active-glow"
          className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent pointer-events-none"
        />
      )}
      <div className="flex justify-between items-center">
        <div>
          <p className={cn(
            "text-xs uppercase tracking-widest font-semibold mb-1",
            isCurrent ? "text-white/70" : "text-[#5A5A40]/60"
          )}>
            {label}
          </p>
          <h3 className="text-2xl font-medium">{time}</h3>
        </div>
        {isNext && !isCurrent && (
          <div className="px-3 py-1 rounded-full bg-[#5A5A40]/10 text-[10px] uppercase tracking-wider font-bold">
            Next
          </div>
        )}
        {isCurrent && (
          <motion.div
            animate={{ scale: [1, 1.2, 1] }}
            transition={{ repeat: Infinity, duration: 2 }}
            className="w-2 h-2 rounded-full bg-white shadow-[0_0_10px_rgba(255,255,255,0.8)]"
          />
        )}
      </div>
    </motion.div>
  );
};

export default function App() {
  const { t, i18n } = useTranslation();
  const [location, setLocation] = useState<LocationData | null>(null);
  const [locationPermission, setLocationPermission] = useState<LocationPermissionState>('unknown');
  const [locationMode, setLocationMode] = useState<LocationMode>(() => {
    const storedMode = localStorage.getItem(LOCATION_MODE_STORAGE_KEY);
    return storedMode === 'manual' ? 'manual' : 'auto';
  });
  const [times, setTimes] = useState<PrayerTimes | null>(null);
  const [prayerOffsets, setPrayerOffsets] = useState<PrayerOffsets>(() => {
    try {
      const stored = localStorage.getItem(PRAYER_OFFSETS_STORAGE_KEY);
      if (!stored) return DEFAULT_PRAYER_OFFSETS;
      const parsed = JSON.parse(stored) as Partial<PrayerOffsets>;
      return {
        ...DEFAULT_PRAYER_OFFSETS,
        ...parsed,
      };
    } catch {
      return DEFAULT_PRAYER_OFFSETS;
    }
  });
  const method = HABOUS_METHOD_ID;
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(Notification.permission === 'granted');
  const [currentTime, setCurrentTime] = useState(new Date());
  const [error, setError] = useState<string | null>(null);
  const [citySearch, setCitySearch] = useState('');
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [isDetecting, setIsDetecting] = useState(false);

  // Check for widget mode
  const isWidgetMode = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('view') === 'widget';
  }, []);

  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Update current time every second
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const getStoredLocation = useCallback((): LocationData | null => {
    try {
      const stored = localStorage.getItem(LOCATION_STORAGE_KEY);
      if (!stored) return null;

      const parsed = JSON.parse(stored) as LocationData;
      if (typeof parsed.latitude === 'number' && typeof parsed.longitude === 'number') {
        return parsed;
      }
    } catch (err) {
      console.error('Failed to parse stored location', err);
    }

    return null;
  }, []);

  const reverseGeocode = useCallback(async (latitude: number, longitude: number): Promise<string | undefined> => {
    try {
      const response = await fetch(
        `https://geocoding-api.open-meteo.com/v1/reverse?latitude=${latitude}&longitude=${longitude}&count=1&language=${i18n.language}`
      );
      const data = await response.json();
      const result = data?.results?.[0];
      return result?.city || result?.name || result?.admin1;
    } catch (err) {
      console.error('Reverse geocoding failed', err);
      return undefined;
    }
  }, [i18n.language]);

  useEffect(() => {
    if (!location) return;
    localStorage.setItem(LOCATION_STORAGE_KEY, JSON.stringify(location));
  }, [location]);

  useEffect(() => {
    localStorage.setItem(LOCATION_MODE_STORAGE_KEY, locationMode);
  }, [locationMode]);

  useEffect(() => {
    localStorage.setItem(PRAYER_OFFSETS_STORAGE_KEY, JSON.stringify(prayerOffsets));
  }, [prayerOffsets]);

  const normalizeApiTime = useCallback((value: string) => {
    return value.split(' ')[0]?.trim() || value;
  }, []);

  const getAdjustedPrayerTime = useCallback((name: PrayerName, value: string) => {
    const normalized = normalizeApiTime(value);
    if (!SALAT_NAMES.includes(name as SalatName)) {
      return normalized;
    }

    const now = new Date();
    const base = parse(`${format(now, 'yyyy-MM-dd')} ${normalized}`, 'yyyy-MM-dd HH:mm', now);
    const shifted = addMinutes(base, prayerOffsets[name as SalatName]);
    return format(shifted, 'HH:mm');
  }, [normalizeApiTime, prayerOffsets]);

  useEffect(() => {
    const stored = getStoredLocation();
    if (stored) {
      setLocation(stored);
    }
  }, [getStoredLocation]);

  useEffect(() => {
    if (!('permissions' in navigator) || !('geolocation' in navigator)) {
      setLocationPermission('unsupported');
      return;
    }

    let isMounted = true;

    navigator.permissions.query({ name: 'geolocation' }).then((status) => {
      if (!isMounted) return;
      setLocationPermission(status.state);
      status.onchange = () => {
        if (isMounted) {
          setLocationPermission(status.state);
        }
      };
    }).catch(() => {
      if (isMounted) {
        setLocationPermission('unknown');
      }
    });

    return () => {
      isMounted = false;
    };
  }, []);

  const handleCitySearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!citySearch.trim()) return;
    
    try {
      const normalizedCity = citySearch.trim();

      const extractCoordinates = (input: string): { latitude: number; longitude: number } | null => {
        const decoded = decodeURIComponent(input);
        const patterns = [
          /@(-?\d{1,2}\.\d+),(-?\d{1,3}\.\d+)/,
          /\/place\/(-?\d{1,2}\.\d+),(-?\d{1,3}\.\d+)/,
          /(-?\d{1,2}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)/,
        ];

        for (const pattern of patterns) {
          const match = decoded.match(pattern);
          if (!match) continue;

          const latitude = Number(match[1]);
          const longitude = Number(match[2]);
          if (Number.isFinite(latitude) && Number.isFinite(longitude) && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180) {
            return { latitude, longitude };
          }
        }

        return null;
      };

      const coordinates = extractCoordinates(normalizedCity);
      if (coordinates) {
        setLocation({
          latitude: coordinates.latitude,
          longitude: coordinates.longitude,
          city: t('pinned_location'),
        });
        setCitySearch('');
        setError(null);
        return;
      }

      const candidates = Array.from(new Set([
        normalizedCity,
        `${normalizedCity}, Morocco`,
        `${normalizedCity}, Maroc`,
      ]));

      // Try tolerant geocoding first and prefer Morocco matches when available.
      for (const candidate of candidates) {
        const geoResponse = await fetch(
          `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(candidate)}&count=5&language=${i18n.language}&format=json`
        );
        const geoData = await geoResponse.json();
        const results = geoData?.results as Array<{ latitude: number; longitude: number; name?: string; country_code?: string }> | undefined;

        if (results && results.length > 0) {
          const preferred = results.find((r) => r.country_code === 'MA') || results[0];
          setLocation({
            latitude: preferred.latitude,
            longitude: preferred.longitude,
            city: preferred.name || normalizedCity,
          });
          setCitySearch('');
          setError(null);
          return;
        }
      }

      // Fallback to Aladhan geocoding for compatibility.
      for (const candidate of candidates) {
        const response = await fetch(`https://api.aladhan.com/v1/address?address=${encodeURIComponent(candidate)}`);
        const data = await response.json();
        if (data.code === 200 && data?.data?.latitude && data?.data?.longitude) {
          setLocation({
            latitude: data.data.latitude,
            longitude: data.data.longitude,
            city: normalizedCity,
          });
          setCitySearch('');
          setError(null);
          return;
        }
      }

      setError(t('city_not_found'));
    } catch (err) {
      setError(t('search_failed'));
    }
  };

  // Geolocation
  const detectLocation = useCallback(() => {
    if (!("geolocation" in navigator)) {
      setLocationPermission('unsupported');
      const stored = getStoredLocation();
      if (stored) {
        setLocation(stored);
        setError(t('location_using_saved'));
      } else {
        setLocation(DEFAULT_FALLBACK_LOCATION);
        setError(t('location_not_supported'));
      }
      return;
    }

    setIsDetecting(true);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const city = await reverseGeocode(position.coords.latitude, position.coords.longitude);
        setLocation({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          city,
        });
        setLocationPermission('granted');
        setIsDetecting(false);
        setError(null);
      },
      (err) => {
        console.error(err);
        setIsDetecting(false);
        if (err.code === err.PERMISSION_DENIED) {
          setLocationPermission('denied');
          const stored = getStoredLocation();
          if (stored) {
            setLocation(stored);
            setError(t('location_using_saved'));
            return;
          }
          setLocation(DEFAULT_FALLBACK_LOCATION);
          setError(t('location_permission_denied'));
          return;
        }

        const stored = getStoredLocation();
        if (stored) {
          setLocation(stored);
          setError(t('location_using_saved'));
          return;
        }

        setLocation(DEFAULT_FALLBACK_LOCATION);
        setError(t('location_error'));
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  }, [getStoredLocation, reverseGeocode, t]);

  useEffect(() => {
    if (locationMode === 'auto') {
      detectLocation();
    }
  }, [detectLocation, locationMode]);

  const handleLocationModeChange = (mode: LocationMode) => {
    setLocationMode(mode);
    setError(null);
    if (mode === 'auto') {
      detectLocation();
    }
  };

  const updatePrayerOffset = (name: SalatName, delta: number) => {
    setPrayerOffsets((prev) => {
      const nextValue = Math.max(-30, Math.min(30, prev[name] + delta));
      return {
        ...prev,
        [name]: nextValue,
      };
    });
  };

  const resetPrayerOffsets = () => {
    setPrayerOffsets(DEFAULT_PRAYER_OFFSETS);
  };

  // Fetch Prayer Times
  useEffect(() => {
    if (!location) return;

    const fetchTimes = async () => {
      try {
        const date = format(new Date(), 'dd-MM-yyyy');

        const url = `https://api.aladhan.com/v1/timings/${date}?latitude=${location.latitude}&longitude=${location.longitude}&method=${method}`;
        const response = await fetch(url);
        const data = await response.json();
        
        if (data.code === 200) {
          setTimes(data.data.timings);
          setError(null);
        }
      } catch (err) {
        console.error(err);
        setError("Failed to fetch prayer times");
      }
    };

    fetchTimes();
  }, [location]);

  // Calculate Current and Next Prayer
  const { currentPrayer, nextPrayer, countdown, activePrayer, nextPrayerAt } = useMemo(() => {
    if (!times) return { currentPrayer: null, nextPrayer: null, countdown: null, activePrayer: null, nextPrayerAt: null };

    const now = currentTime;
    const todayStr = format(now, 'yyyy-MM-dd');

    const parseApiTime = (name: SalatName, value: string) => {
      // Aladhan may append timezone text like "05:21 (+01)"; keep only HH:mm.
      const normalized = normalizeApiTime(value);
      const base = parse(`${todayStr} ${normalized}`, 'yyyy-MM-dd HH:mm', new Date());
      return addMinutes(base, prayerOffsets[name]);
    };
    
    const salatDates = SALAT_NAMES.map(name => {
      const timeStr = times[name];
      return {
        name,
        date: parseApiTime(name, timeStr)
      };
    });

    let current: SalatName | null = null;
    let next: SalatName | null = null;

    for (let i = 0; i < salatDates.length; i++) {
      if (isBefore(now, salatDates[i].date)) {
        next = salatDates[i].name;
        current = i === 0 ? 'Isha' : SALAT_NAMES[i - 1]; // If before Fajr, current is Isha of yesterday
        break;
      }
    }

    if (!next) {
      next = 'Fajr';
      current = 'Isha';
    }

    // Highlight a prayer only briefly after its start time.
    const active = salatDates.find(({ date }) => {
      return !isBefore(now, date) && isBefore(now, addMinutes(date, 30));
    })?.name || null;

    // Countdown to next. After Isha, roll next Fajr to tomorrow.
    let nextDate = salatDates.find(p => p.name === next)?.date || addMinutes(salatDates[0].date, 24 * 60);
    if (!isAfter(nextDate, now)) {
      nextDate = addMinutes(nextDate, 24 * 60);
    }
    const diff = Math.max(0, differenceInSeconds(nextDate, now));
    
    const h = Math.floor(diff / 3600);
    const m = Math.floor((diff % 3600) / 60);
    const s = diff % 60;
    const countdownStr = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;

    return { currentPrayer: current, nextPrayer: next, countdown: countdownStr, activePrayer: active, nextPrayerAt: nextDate };
  }, [times, currentTime, normalizeApiTime, prayerOffsets]);

  const urlBase64ToUint8Array = (base64String: string) => {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  };

  const syncPushSubscription = useCallback(async () => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || Notification.permission !== 'granted') {
      return;
    }

    const registration = await navigator.serviceWorker.ready;
    const keyResponse = await fetch('/api/push/vapid-public-key');
    if (!keyResponse.ok) {
      throw new Error('Unable to fetch VAPID public key');
    }

    const { publicKey } = await keyResponse.json() as { publicKey: string };
    const applicationServerKey = urlBase64ToUint8Array(publicKey);

    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey,
      });
    }

    await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        subscription,
        config: {
          location,
          method,
          prayerOffsets,
          language: i18n.language,
          notificationsEnabled: true,
        },
      }),
    });
  }, [i18n.language, location, method, prayerOffsets]);

  // Notifications
  const updatePinnedCountdownNotification = useCallback(async () => {
    if (!notificationsEnabled || !nextPrayer || !countdown || !('serviceWorker' in navigator)) {
      return;
    }

    const registration = await navigator.serviceWorker.ready;
    await registration.showNotification(t('app_name'), {
      body: `${t('next_prayer')}: ${t(nextPrayer.toLowerCase())} - ${countdown}`,
      tag: PINNED_COUNTDOWN_TAG,
      requireInteraction: true,
      silent: true,
    });
  }, [countdown, nextPrayer, notificationsEnabled, t]);

  const requestNotifications = useCallback(async () => {
    if (!("Notification" in window)) return;
    const permission = await Notification.requestPermission();
    if (permission === "granted") {
      setNotificationsEnabled(true);

      try {
        await syncPushSubscription();
      } catch (err) {
        console.error('Failed to subscribe for web push notifications', err);
      }

      if ('serviceWorker' in navigator) {
        try {
          const registration = await navigator.serviceWorker.ready;
          const periodicSyncManager = (registration as ServiceWorkerRegistration & { periodicSync?: { register: (tag: string, options?: { minInterval?: number }) => Promise<void> } }).periodicSync;
          if (periodicSyncManager) {
            await periodicSyncManager.register('prayer-check', { minInterval: 15 * 60 * 1000 });
          }
        } catch (err) {
          console.error('Failed to register periodic prayer checks', err);
        }
      }
    }
  }, [syncPushSubscription]);

  useEffect(() => {
    if (!notificationsEnabled || !nextPrayer || !countdown || !('serviceWorker' in navigator)) {
      return;
    }

    updatePinnedCountdownNotification().catch((err) => {
      console.error('Failed to update pinned countdown notification', err);
    });

    const interval = window.setInterval(() => {
      updatePinnedCountdownNotification().catch((err) => {
        console.error('Failed to refresh pinned countdown notification', err);
      });
    }, 60_000);

    return () => {
      clearInterval(interval);
    };
  }, [countdown, nextPrayer, notificationsEnabled, updatePinnedCountdownNotification]);

  useEffect(() => {
    if (notificationsEnabled || !('serviceWorker' in navigator)) {
      return;
    }

    navigator.serviceWorker.ready.then(async (registration) => {
      const activePinned = await registration.getNotifications({ tag: PINNED_COUNTDOWN_TAG });
      activePinned.forEach((item) => item.close());
    }).catch((err) => {
      console.error('Failed to clear pinned countdown notification', err);
    });
  }, [notificationsEnabled]);

  useEffect(() => {
    if (!notificationsEnabled || !location || !('serviceWorker' in navigator)) return;

    syncPushSubscription().catch((err) => {
      console.error('Failed to sync web push subscription', err);
    });

    navigator.serviceWorker.ready.then((registration) => {
      registration.active?.postMessage({
        type: 'PRAYER_CONFIG',
        payload: {
          location,
          method,
          prayerOffsets,
          language: i18n.language,
          notificationsEnabled,
        },
      });
    }).catch((err) => {
      console.error('Failed to send prayer config to service worker', err);
    });
  }, [i18n.language, location, method, notificationsEnabled, prayerOffsets, syncPushSubscription]);

  const toggleLanguage = () => {
    const langs = ['fr', 'ar', 'en'];
    const nextIdx = (langs.indexOf(i18n.language) + 1) % langs.length;
    i18n.changeLanguage(langs[nextIdx]);
  };

  if (isWidgetMode) {
    return (
      <div className={cn(
        "min-h-screen bg-[#f5f5f0] flex items-center justify-center p-4",
        i18n.language === 'ar' ? "rtl" : "ltr"
      )}>
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="w-full max-w-[300px] aspect-square bg-white rounded-[2.5rem] p-8 shadow-2xl border border-[#5A5A40]/5 flex flex-col justify-between items-center text-center"
        >
          <div className="w-full flex justify-between items-center opacity-40">
            <ClockIcon size={14} />
            <span className="text-[10px] font-bold uppercase tracking-widest">{t('app_name')}</span>
            <MapPin size={14} />
          </div>

          <div>
            <p className="text-[10px] uppercase tracking-[0.2em] font-bold mb-1 opacity-50">
              {nextPrayer ? t(nextPrayer.toLowerCase()) : '...'}
            </p>
            <h2 className="text-5xl font-light tracking-tighter text-[#5A5A40]">
              {countdown || '--:--'}
            </h2>
          </div>

          <div className="w-full pt-4 border-t border-[#5A5A40]/5">
            <p className="text-[10px] uppercase tracking-widest font-bold text-[#5A5A40]/60">
              {currentPrayer ? `${t('current_prayer')}: ${t(currentPrayer.toLowerCase())}` : '...'}
            </p>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className={cn(
      "min-h-screen bg-[#f5f5f0] text-[#5A5A40] font-sans selection:bg-[#5A5A40] selection:text-white",
      i18n.language === 'ar' ? "rtl" : "ltr"
    )}>
      {/* Header / Widget View */}
      <header className="sticky top-0 z-50 bg-[#f5f5f0]/80 backdrop-blur-md border-b border-[#5A5A40]/10 px-6 py-4">
        <div className="max-w-md mx-auto flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-[#5A5A40] flex items-center justify-center text-white">
              <ClockIcon size={20} />
            </div>
            <div>
              <h1 className="text-lg font-bold leading-tight">{t('app_name')}</h1>
              <div className="flex items-center gap-2">
                <p className="text-[10px] uppercase tracking-widest opacity-60">
                  {isDetecting
                    ? t('location_detecting')
                    : location
                      ? (location.city || t('location_active'))
                      : t('location_detecting')}
                </p>
                {locationMode === 'auto' && locationPermission === 'denied' && (
                  <span className="px-1.5 py-0.5 rounded bg-red-100 text-red-700 text-[8px] font-bold uppercase">
                    {t('location_permission_denied')}
                  </span>
                )}
                {isOffline && (
                  <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 text-[8px] font-bold uppercase">
                    Offline
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <button 
              onClick={toggleLanguage}
              className="p-2 rounded-full hover:bg-[#5A5A40]/5 transition-colors"
            >
              <Languages size={20} />
            </button>
            <button 
              onClick={() => setIsSettingsOpen(true)}
              className="p-2 rounded-full hover:bg-[#5A5A40]/5 transition-colors"
            >
              <SettingsIcon size={20} />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-md mx-auto px-6 py-8 pb-24">
        {/* Hero Section */}
        <section className="mb-12 text-center">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="mb-6"
          >
            <Clock />
            <p className="text-sm opacity-60 mt-1">
              {format(currentTime, 'EEEE, d MMMM yyyy')}
            </p>
          </motion.div>

          {nextPrayer && (
            <div className="bg-white rounded-[2rem] p-8 shadow-sm border border-[#5A5A40]/5">
              <p className="text-xs uppercase tracking-[0.2em] font-bold mb-2 opacity-50">
                {t('next_prayer')} • {t(nextPrayer.toLowerCase())}
              </p>
              <h2 className="text-5xl font-light tracking-tighter mb-4">
                {countdown}
              </h2>
              <div className="flex justify-center gap-4">
                <button 
                  onClick={requestNotifications}
                  className={cn(
                    "flex items-center gap-2 px-4 py-2 rounded-full text-xs font-bold transition-all",
                    notificationsEnabled 
                      ? "bg-[#5A5A40] text-white" 
                      : "bg-[#5A5A40]/10 text-[#5A5A40]"
                  )}
                >
                  {notificationsEnabled ? <Bell size={14} /> : <BellOff size={14} />}
                  {t('notifications')}
                </button>
              </div>
            </div>
          )}
        </section>

        {/* Prayer List */}
        <section className="space-y-4">
          {!location && !isDetecting && (
            <div className="space-y-4 mb-8">
              <div className="p-6 bg-white rounded-[2rem] border border-[#5A5A40]/10 text-center">
                <MapPin className="mx-auto mb-4 opacity-20" size={48} />
                <h3 className="text-lg font-bold mb-2">{t('location_error')}</h3>
                <p className="text-xs opacity-60 mb-6">Enter your city manually to get accurate prayer times.</p>
                
                <form onSubmit={handleCitySearch} className="relative mb-4">
                  <input
                    type="text"
                    value={citySearch}
                    onChange={(e) => setCitySearch(e.target.value)}
                    placeholder={t('city_placeholder')}
                    className="w-full px-6 py-4 bg-[#f5f5f0] border border-[#5A5A40]/5 rounded-2xl text-sm focus:outline-none focus:border-[#5A5A40]/20 transition-all"
                  />
                  <button 
                    type="submit"
                    className="absolute right-2 top-2 bottom-2 px-4 bg-[#5A5A40] text-white rounded-xl text-xs font-bold"
                  >
                    {t('search')}
                  </button>
                </form>

                {locationMode === 'auto' ? (
                  <button 
                    onClick={detectLocation}
                    className="text-xs font-bold text-[#5A5A40] underline underline-offset-4"
                  >
                    {t('retry_location')}
                  </button>
                ) : (
                  <p className="text-xs opacity-60">
                    {t('location_mode_manual_hint')}
                  </p>
                )}
              </div>
            </div>
          )}

          {location && (
            <div className="p-4 bg-white rounded-2xl border border-[#5A5A40]/10 mb-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-[10px] uppercase tracking-widest font-bold opacity-50">
                  {t('change_city')}
                </p>
                {location.city && (
                  <span className="text-[10px] px-2 py-1 rounded-full bg-[#5A5A40]/10 font-bold uppercase tracking-wide">
                    {location.city}
                  </span>
                )}
              </div>
              <form onSubmit={handleCitySearch} className="relative">
                <input
                  type="text"
                  value={citySearch}
                  onChange={(e) => setCitySearch(e.target.value)}
                  placeholder={t('city_placeholder')}
                  className="w-full px-4 py-3 bg-[#f5f5f0] border border-[#5A5A40]/5 rounded-xl text-sm focus:outline-none focus:border-[#5A5A40]/20 transition-all"
                />
                <button
                  type="submit"
                  className="absolute right-2 top-2 bottom-2 px-3 bg-[#5A5A40] text-white rounded-lg text-[10px] font-bold uppercase tracking-wide"
                >
                  {t('search')}
                </button>
              </form>
            </div>
          )}

          {error && location && (
            <div className="p-4 bg-red-50 text-red-600 rounded-2xl text-sm flex items-center gap-3 mb-4">
              <Info size={18} />
              {error}
            </div>
          )}
          
          {times ? (
            PRAYER_NAMES.map((name) => (
              <PrayerCard
                key={name}
                name={name}
                time={getAdjustedPrayerTime(name, times[name])}
                label={t(name.toLowerCase())}
                isCurrent={activePrayer === name}
                isNext={nextPrayer === name}
              />
            ))
          ) : (
            <div className="space-y-4 opacity-20">
              {[1, 2, 3, 4, 5, 6].map(i => (
                <div key={i} className="h-24 bg-[#5A5A40] rounded-3xl animate-pulse" />
              ))}
            </div>
          )}
        </section>
      </main>

      {/* Settings Modal */}
      <AnimatePresence>
        {isSettingsOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
          >
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              className="bg-[#f5f5f0] w-full max-w-md rounded-t-[2.5rem] sm:rounded-[2.5rem] p-8 shadow-2xl"
            >
              <div className="flex justify-between items-center mb-8">
                <h2 className="text-2xl font-bold">{t('settings')}</h2>
                <button 
                  onClick={() => setIsSettingsOpen(false)}
                  className="p-2 rounded-full bg-[#5A5A40]/10"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="space-y-8">

                <div>
                  <label className="text-[10px] uppercase tracking-widest font-bold opacity-50 block mb-4">
                    {t('location_mode')}
                  </label>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleLocationModeChange('auto')}
                      className={cn(
                        "flex-1 py-3 rounded-2xl text-sm font-bold uppercase tracking-widest transition-all",
                        locationMode === 'auto'
                          ? "bg-[#5A5A40] text-white"
                          : "bg-white border border-[#5A5A40]/10"
                      )}
                    >
                      {t('location_mode_auto')}
                    </button>
                    <button
                      onClick={() => handleLocationModeChange('manual')}
                      className={cn(
                        "flex-1 py-3 rounded-2xl text-sm font-bold uppercase tracking-widest transition-all",
                        locationMode === 'manual'
                          ? "bg-[#5A5A40] text-white"
                          : "bg-white border border-[#5A5A40]/10"
                      )}
                    >
                      {t('location_mode_manual')}
                    </button>
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-4">
                    <label className="text-[10px] uppercase tracking-widest font-bold opacity-50 block">
                      {t('prayer_adjustments')}
                    </label>
                    <button
                      onClick={resetPrayerOffsets}
                      className="text-[10px] uppercase tracking-wider font-bold underline underline-offset-4"
                    >
                      {t('reset')}
                    </button>
                  </div>
                  <div className="space-y-2">
                    {SALAT_NAMES.map((name) => (
                      <div key={name} className="flex items-center justify-between bg-white border border-[#5A5A40]/10 rounded-xl px-3 py-2">
                        <span className="text-xs font-bold">{t(name.toLowerCase())}</span>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => updatePrayerOffset(name, -1)}
                            className="w-7 h-7 rounded-lg bg-[#5A5A40]/10 text-sm font-bold"
                          >
                            -
                          </button>
                          <span className="text-xs font-bold min-w-14 text-center">
                            {prayerOffsets[name] > 0 ? `+${prayerOffsets[name]}` : prayerOffsets[name]} {t('minute_short')}
                          </span>
                          <button
                            onClick={() => updatePrayerOffset(name, 1)}
                            className="w-7 h-7 rounded-lg bg-[#5A5A40]/10 text-sm font-bold"
                          >
                            +
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-[10px] uppercase tracking-widest font-bold opacity-50 block mb-4">
                    Widget
                  </label>
                  <a
                    href="/?view=widget"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-between w-full px-6 py-4 bg-white border border-[#5A5A40]/10 rounded-2xl text-sm font-bold hover:bg-[#5A5A40]/5 transition-all"
                  >
                    Open Compact Widget View
                    <ChevronRight size={16} />
                  </a>
                </div>

                <div>
                  <label className="text-[10px] uppercase tracking-widest font-bold opacity-50 block mb-4">
                    {t('language')}
                  </label>
                  <div className="flex gap-2">
                    {['fr', 'ar', 'en'].map((lang) => (
                      <button
                        key={lang}
                        onClick={() => i18n.changeLanguage(lang)}
                        className={cn(
                          "flex-1 py-3 rounded-2xl text-sm font-bold uppercase tracking-widest transition-all",
                          i18n.language === lang 
                            ? "bg-[#5A5A40] text-white" 
                            : "bg-white border border-[#5A5A40]/10"
                        )}
                      >
                        {lang}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <button
                onClick={() => setIsSettingsOpen(false)}
                className="w-full mt-10 py-4 bg-[#5A5A40] text-white rounded-2xl font-bold shadow-lg shadow-[#5A5A40]/20"
              >
                Done
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Mobile Navigation / Tab Bar (Optional) */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white/80 backdrop-blur-lg border-t border-[#5A5A40]/10 px-8 py-4 sm:hidden">
        <div className="max-w-md mx-auto flex justify-around items-center">
          <button className="flex flex-col items-center gap-1 text-[#5A5A40]">
            <ClockIcon size={24} />
            <span className="text-[10px] font-bold uppercase tracking-tighter">Times</span>
          </button>
          <button className="flex flex-col items-center gap-1 opacity-30">
            <MapPin size={24} />
            <span className="text-[10px] font-bold uppercase tracking-tighter">Qibla</span>
          </button>
          <button 
            onClick={() => setIsSettingsOpen(true)}
            className="flex flex-col items-center gap-1 opacity-30"
          >
            <SettingsIcon size={24} />
            <span className="text-[10px] font-bold uppercase tracking-tighter">Settings</span>
          </button>
        </div>
      </nav>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(90, 90, 64, 0.2);
          border-radius: 10px;
        }
        .rtl {
          direction: rtl;
          font-family: 'Noto Sans Arabic', sans-serif;
        }
      `}</style>
    </div>
  );
}
