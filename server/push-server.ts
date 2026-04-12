import fs from 'fs';
import path from 'path';
import express from 'express';
import dotenv from 'dotenv';
import webpush from 'web-push';

dotenv.config();

type SalatName = 'Fajr' | 'Dhuhr' | 'Asr' | 'Maghrib' | 'Isha';
type PrayerOffsets = Record<SalatName, number>;

interface LocationData {
  latitude: number;
  longitude: number;
  city?: string;
}

interface PushConfig {
  location: LocationData | null;
  method: number;
  prayerOffsets: PrayerOffsets;
  language: string;
  notificationsEnabled: boolean;
}

interface StoredSubscriber {
  endpoint: string;
  subscription: webpush.PushSubscription;
  config: PushConfig;
  lastNotificationKey?: string;
  updatedAt: number;
}

const DATA_FILE = path.join(process.cwd(), 'server', 'push-subscribers.json');
const SALAT_NAMES: SalatName[] = ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'];
const DEFAULT_CONFIG: PushConfig = {
  location: null,
  method: 21,
  prayerOffsets: {
    Fajr: 0,
    Dhuhr: 0,
    Asr: 0,
    Maghrib: 0,
    Isha: 0,
  },
  language: 'fr',
  notificationsEnabled: true,
};

function ensureDataStore() {
  const dir = path.dirname(DATA_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify({}, null, 2), 'utf-8');
  }
}

function loadSubscribers(): Record<string, StoredSubscriber> {
  ensureDataStore();
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf-8');
    return JSON.parse(raw) as Record<string, StoredSubscriber>;
  } catch {
    return {};
  }
}

function saveSubscribers(data: Record<string, StoredSubscriber>) {
  ensureDataStore();
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

function getVapidKeys() {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || 'mailto:admin@example.com';

  if (publicKey && privateKey) {
    return { publicKey, privateKey, subject };
  }

  const generated = webpush.generateVAPIDKeys();
  console.warn('VAPID keys are missing. Generated temporary keys for this process only.');
  console.warn(`VAPID_PUBLIC_KEY=${generated.publicKey}`);
  console.warn(`VAPID_PRIVATE_KEY=${generated.privateKey}`);

  return {
    publicKey: generated.publicKey,
    privateKey: generated.privateKey,
    subject,
  };
}

function prayerLabel(name: SalatName, language: string) {
  const labels = {
    en: { Fajr: 'Fajr', Dhuhr: 'Dhuhr', Asr: 'Asr', Maghrib: 'Maghrib', Isha: 'Isha' },
    fr: { Fajr: 'Fajr', Dhuhr: 'Dhuhr', Asr: 'Asr', Maghrib: 'Maghrib', Isha: 'Isha' },
    ar: { Fajr: 'الفجر', Dhuhr: 'الظهر', Asr: 'العصر', Maghrib: 'المغرب', Isha: 'العشاء' },
  };

  const lang = language === 'ar' || language === 'en' || language === 'fr' ? language : 'en';
  return labels[lang][name];
}

function parseApiTime(timeValue: string, baseDate: Date) {
  const normalized = String(timeValue).split(' ')[0]?.trim() || String(timeValue);
  const [h, m] = normalized.split(':').map((v) => Number(v));
  const date = new Date(baseDate);
  date.setHours(h, m, 0, 0);
  return date;
}

async function fetchPrayerTimings(config: PushConfig, now: Date) {
  if (!config.location) return null;

  const date = `${String(now.getDate()).padStart(2, '0')}-${String(now.getMonth() + 1).padStart(2, '0')}-${now.getFullYear()}`;
  const url = `https://api.aladhan.com/v1/timings/${date}?latitude=${config.location.latitude}&longitude=${config.location.longitude}&method=${config.method || 21}`;
  const response = await fetch(url);
  const data = await response.json();

  if (data.code !== 200) {
    return null;
  }

  return data.data.timings as Record<SalatName, string>;
}

async function sendDuePrayerNotifications() {
  const subscribers = loadSubscribers();
  const now = new Date();
  let changed = false;

  for (const endpoint of Object.keys(subscribers)) {
    const entry = subscribers[endpoint];
    const config = entry.config;

    if (!config.notificationsEnabled || !config.location) {
      continue;
    }

    try {
      const timings = await fetchPrayerTimings(config, now);
      if (!timings) continue;

      let duePrayer: { name: SalatName; prayerDate: Date } | null = null;
      for (const prayerName of SALAT_NAMES) {
        const basePrayerTime = parseApiTime(timings[prayerName], now);
        const adjusted = new Date(basePrayerTime.getTime() + (config.prayerOffsets?.[prayerName] || 0) * 60_000);
        const diffMs = Math.abs(now.getTime() - adjusted.getTime());

        if (diffMs <= 60_000) {
          duePrayer = { name: prayerName, prayerDate: adjusted };
          break;
        }
      }

      if (!duePrayer) continue;

      const prayerKey = `${duePrayer.prayerDate.toISOString().slice(0, 16)}-${duePrayer.name}`;
      if (entry.lastNotificationKey === prayerKey) {
        continue;
      }

      const payload = {
        title: 'Salat Mawaqit',
        body: `${prayerLabel(duePrayer.name, config.language)} - Time now`,
        prayerName: duePrayer.name,
        at: duePrayer.prayerDate.toISOString(),
      };

      await webpush.sendNotification(entry.subscription, JSON.stringify(payload));
      entry.lastNotificationKey = prayerKey;
      changed = true;
    } catch (error) {
      const statusCode = (error as { statusCode?: number })?.statusCode;
      if (statusCode === 404 || statusCode === 410) {
        delete subscribers[endpoint];
        changed = true;
      } else {
        console.error('Push send error for subscriber', endpoint, error);
      }
    }
  }

  if (changed) {
    saveSubscribers(subscribers);
  }
}

const app = express();
app.use(express.json());
const allowedOrigin = process.env.CORS_ORIGIN || '*';
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  next();
});

const vapid = getVapidKeys();
webpush.setVapidDetails(vapid.subject, vapid.publicKey, vapid.privateKey);

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'salat-push-server' });
});

app.get('/api/push/vapid-public-key', (_req, res) => {
  res.json({ publicKey: vapid.publicKey });
});

app.post('/api/push/subscribe', (req, res) => {
  const subscription = req.body?.subscription as webpush.PushSubscription | undefined;
  const config = req.body?.config as Partial<PushConfig> | undefined;

  if (!subscription?.endpoint || !subscription.keys?.p256dh || !subscription.keys?.auth) {
    res.status(400).json({ error: 'Invalid subscription' });
    return;
  }

  const subscribers = loadSubscribers();
  subscribers[subscription.endpoint] = {
    endpoint: subscription.endpoint,
    subscription,
    config: {
      ...DEFAULT_CONFIG,
      ...config,
      prayerOffsets: {
        ...DEFAULT_CONFIG.prayerOffsets,
        ...(config?.prayerOffsets || {}),
      },
    },
    lastNotificationKey: subscribers[subscription.endpoint]?.lastNotificationKey,
    updatedAt: Date.now(),
  };

  saveSubscribers(subscribers);
  res.status(201).json({ ok: true });
});

app.post('/api/push/unsubscribe', (req, res) => {
  const endpoint = req.body?.endpoint as string | undefined;
  if (!endpoint) {
    res.status(400).json({ error: 'Missing endpoint' });
    return;
  }

  const subscribers = loadSubscribers();
  delete subscribers[endpoint];
  saveSubscribers(subscribers);
  res.json({ ok: true });
});

const port = Number(process.env.PORT || process.env.PUSH_SERVER_PORT || 8787);
app.listen(port, () => {
  console.log(`Push server running on http://localhost:${port}`);
});

void sendDuePrayerNotifications();
setInterval(() => {
  void sendDuePrayerNotifications();
}, 30_000);
