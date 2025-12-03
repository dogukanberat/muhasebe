import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

const CACHE_FILE = path.join(__dirname, 'tcmb-cache.json');
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 saat

// TCMB'den kur çek
async function fetchTCMBRate(date) {
  try {
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();

    const tcmbUrl = `https://www.tcmb.gov.tr/kurlar/${year}${month}/${day}${month}${year}.xml`;

    console.log('TCMB URL:', tcmbUrl);

    const response = await fetch(tcmbUrl);

    if (!response.ok) {
      console.error('TCMB error:', response.status, response.statusText);
      return null;
    }

    const xmlText = await response.text();

    // EUR ForexSelling değerini parse et
    const eurMatch = xmlText.match(/<Currency[^>]*CurrencyCode="EUR"[^>]*>[\s\S]*?<ForexSelling>([\d.]+)<\/ForexSelling>/);

    if (eurMatch && eurMatch[1]) {
      const rate = parseFloat(eurMatch[1]);
      console.log('EUR kuru bulundu:', rate, 'Tarih:', `${day}.${month}.${year}`);
      return {
        rate,
        date: `${year}-${month}-${day}`,
        tarih: `${day}.${month}.${year}`
      };
    }

    console.warn('EUR kuru XML içinde bulunamadı');
    return null;
  } catch (err) {
    console.error('TCMB fetch hatası:', err.message);
    return null;
  }
}

// Cache'i oku
async function loadCache() {
  try {
    const data = await fs.readFile(CACHE_FILE, 'utf-8');
    const cache = JSON.parse(data);
    console.log('Cache dosyasından yüklendi');
    return cache;
  } catch (err) {
    console.log('Cache dosyası bulunamadı, yeni oluşturulacak');
    return { version: 'v1', rates: {}, lastUpdated: null };
  }
}

// Cache'i kaydet
async function saveCache(cache) {
  try {
    await fs.writeFile(CACHE_FILE, JSON.stringify(cache, null, 2), 'utf-8');
    console.log('Cache dosyasına kaydedildi');
  } catch (err) {
    console.error('Cache kaydetme hatası:', err);
  }
}

// Aylık kurları getir
app.get('/api/rates', async (req, res) => {
  try {
    const today = new Date();
    const currentYear = today.getFullYear();
    const currentMonth = today.getMonth(); // 0-11
    const currentDay = today.getDate();

    // Cache'i yükle
    let cache = await loadCache();

    // Cache versiyonu kontrolü
    if (cache.version !== 'v1') {
      cache = { version: 'v1', rates: {}, lastUpdated: null };
    }

    const monthNames = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
                       'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];

    const rates = [];
    let cacheUpdated = false;

    // Ocak'tan güncel aya kadar
    for (let monthIndex = 0; monthIndex <= currentMonth; monthIndex++) {
      const monthKey = String(monthIndex + 1).padStart(2, '0');
      const isCurrentMonth = monthIndex === currentMonth;

      let date;
      if (isCurrentMonth) {
        // Güncel ay - 20'sine geldiyse 20'sini kullan
        if (currentDay >= 20) {
          date = new Date(currentYear, monthIndex, 20);
        } else {
          date = today;
        }
      } else {
        // Geçmiş aylar - 20'si
        date = new Date(currentYear, monthIndex, 20);
      }

      // Hafta sonu kontrolü - 20'si Cumartesi veya Pazar'a denk geliyorsa önceki iş gününe git
      const dayOfWeek = date.getDay();
      if (dayOfWeek === 6) { // Cumartesi
        date.setDate(date.getDate() - 1); // Cuma
        console.log(`${monthNames[monthIndex]} ayının 20'si Cumartesi, Cuma (${date.getDate()}) kuru kullanılacak`);
      } else if (dayOfWeek === 0) { // Pazar
        date.setDate(date.getDate() - 2); // Cuma
        console.log(`${monthNames[monthIndex]} ayının 20'si Pazar, Cuma (${date.getDate()}) kuru kullanılacak`);
      }

      const dateKey = `${currentYear}-${monthKey}`;
      let rateData = cache.rates[dateKey];

      // Cache'de yoksa veya güncel ay ise - TCMB'den çek
      const needsFetch = !rateData || (isCurrentMonth &&
        (!cache.lastUpdated || (Date.now() - new Date(cache.lastUpdated).getTime() > CACHE_DURATION)));

      if (needsFetch) {
        console.log(`${monthNames[monthIndex]} için TCMB'den çekiliyor...`);
        const tcmbResult = await fetchTCMBRate(date);

        if (tcmbResult) {
          rateData = {
            rate: tcmbResult.rate,
            date: tcmbResult.date,
            month: monthNames[monthIndex],
            source: 'TCMB',
            fetchedAt: new Date().toISOString()
          };
          cache.rates[dateKey] = rateData;
          cacheUpdated = true;
        } else if (!rateData) {
          // TCMB başarısız ve cache'de de yok - null ekle
          rateData = {
            rate: null,
            date: `${currentYear}-${monthKey}-20`,
            month: monthNames[monthIndex],
            source: 'Failed'
          };
        }

        // Rate limit için bekleme
        await new Promise(resolve => setTimeout(resolve, 200));
      } else {
        console.log(`${monthNames[monthIndex]} cache'den alındı`);
        rateData.source = 'Cache';
      }

      rates.push({
        month: monthNames[monthIndex],
        rate: rateData.rate,
        date: rateData.date,
        source: rateData.source,
        isCurrent: isCurrentMonth
      });
    }

    // Cache güncellendiyse kaydet
    if (cacheUpdated) {
      cache.lastUpdated = new Date().toISOString();
      await saveCache(cache);
    }

    res.json({
      success: true,
      rates,
      cachedAt: cache.lastUpdated,
      year: currentYear
    });

  } catch (err) {
    console.error('API hatası:', err);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

// Güncel kuru getir (sadece bugün için)
app.get('/api/rate/today', async (req, res) => {
  try {
    const today = new Date();
    const result = await fetchTCMBRate(today);

    if (result) {
      res.json({
        success: true,
        ...result,
        source: 'TCMB'
      });
    } else {
      res.status(404).json({
        success: false,
        error: 'Kur alınamadı'
      });
    }
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

// Cache'i temizle (debug için)
app.delete('/api/cache', async (req, res) => {
  try {
    await fs.unlink(CACHE_FILE);
    res.json({ success: true, message: 'Cache temizlendi' });
  } catch (err) {
    res.json({ success: true, message: 'Cache zaten yok' });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`🚀 Server çalışıyor: http://localhost:${PORT}`);
  console.log(`📊 API endpoint: http://localhost:${PORT}/api/rates`);
});
