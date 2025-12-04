import React, { useState, useEffect } from 'react';

// 2025 Ücret Dışı Gelirler tarifesi tanımı
const TAX_BRACKETS = [
  { limit: 158000, rate: 0.15, baseTax: 0, baseLimit: 0 },
  { limit: 330000, rate: 0.20, baseTax: 23700, baseLimit: 158000 },
  { limit: 800000, rate: 0.27, baseTax: 58100, baseLimit: 330000 },
  { limit: 4300000, rate: 0.35, baseTax: 185000, baseLimit: 800000 },
  { limit: Infinity, rate: 0.40, baseTax: 1410000, baseLimit: 4300000 },
];

// Vergi hesaplama fonksiyonu - 2025 Ücret Dışı Gelirler Tarifesi
const calculateTax = (yearlyIncome) => {
  if (yearlyIncome <= 0) return 0;

  const bracket = TAX_BRACKETS.find(({ limit }) => yearlyIncome <= limit);
  if (!bracket) return 0;

  const taxablePortion = yearlyIncome - bracket.baseLimit;
  return bracket.baseTax + taxablePortion * bracket.rate;
};

// Para birimi formatlama
const formatCurrency = (amount, currency = 'TRY', decimals = 2, maxDecimals = decimals) => {
  const maximumFractionDigits = Math.max(decimals, maxDecimals);
  return new Intl.NumberFormat('tr-TR', {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: decimals,
    maximumFractionDigits: maximumFractionDigits
  }).format(amount);
};

// Sayı formatlama (binlik ayırıcıyla)
const formatNumber = (num, decimals = 2, maxDecimals = decimals) => {
  const maximumFractionDigits = Math.max(decimals, maxDecimals);
  return new Intl.NumberFormat('tr-TR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: maximumFractionDigits
  }).format(num);
};

// 2025 sabit kur tablosu (aylık)
const STATIC_MONTH_RATES = [
  { month: 'Ocak', rate: 37.260 },
  { month: 'Şubat', rate: 38.010 },
  { month: 'Mart', rate: 38.850 },
  { month: 'Nisan', rate: 43.570 },
  { month: 'Mayıs', rate: 44.960 },
  { month: 'Haziran', rate: 46.680 },
  { month: 'Temmuz', rate: 46.640 },
  { month: 'Ağustos', rate: 47.540 },
  { month: 'Eylül', rate: 48.820 },
  { month: 'Ekim', rate: 48.580 },
  { month: 'Kasım', rate: 49.150 },
  { month: 'Aralık', rate: 49.620 },
];

// Bağkur oranları
const BAGKUR_DEFAULT_RATE = 0.3775; // %37,75
const BAGKUR_DISCOUNT_RATE = 0.32; // %32 indirimli
const BAGKUR_CAP_TRY = 68264.49; // Aylık tavan

const MONTH_OPTIONS = [
  'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
  'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'
];

const LS_KEY_START_MONTH = 'gvh_start_month';
const LS_KEY_START_YEAR = 'gvh_start_year';
const LS_KEY_BAGKUR_RATE = 'gvh_bagkur_rate';

// Aylık brütü çözer: G - vergi - Bağkur = hedef net
// Vergi, kümülatif matrah (önceki brüt - önceki Bağkur) üzerine eklenen yeni matrah (G - Bağkur) için hesaplanır
const solveMonthlyGrossForNet = (targetNet, prevMatrah, computeBagkur) => {
  if (!Number.isFinite(targetNet) || targetNet <= 0) return 0;

  const f = (g) => {
    const bagkur = computeBagkur(g);
    const matrah = g - bagkur;
    const tax = calculateTax(prevMatrah + matrah) - calculateTax(prevMatrah);
    return g - tax - bagkur - targetNet; // kök = 0
  };

  let low = targetNet;
  let high = Math.max(targetNet * 2, targetNet + 1);

  for (let i = 0; i < 100; i++) {
    const val = f(high);
    if (!Number.isFinite(val)) break;
    if (val >= 0) break;
    high *= 1.5;
    if (!Number.isFinite(high) || high > 1e16) return targetNet;
  }

  for (let i = 0; i < 80; i++) {
    const mid = (low + high) / 2;
    const val = f(mid);
    if (!Number.isFinite(val)) return targetNet;
    if (Math.abs(val) < 0.01) return mid;
    if (val > 0) {
      high = mid;
    } else {
      low = mid;
    }
  }

  return (low + high) / 2;
};

// Gelir vergisi dilimi bulucu (2025 tarifesi)
const getTaxBracket = (income) => {
  if (income <= 0) return { name: 'Dilim 1', rate: 15, range: '0 - 158.000 TL' };

  const bracketIndex = TAX_BRACKETS.findIndex(({ limit }) => income <= limit);
  const { limit, rate, baseLimit, baseTax } = TAX_BRACKETS[bracketIndex];

  const name = `Dilim ${bracketIndex + 1}`;
  const range =
    limit === Infinity
      ? `${formatNumber(baseLimit, 0)}+ TL`
      : `${formatNumber(baseLimit + 1, 0)} - ${formatNumber(limit, 0)} TL`;
  const baseText =
    baseTax > 0 ? `${formatCurrency(baseTax, 'TRY', 0)} + fazlası` : undefined;

  return {
    name,
    rate: rate * 100,
    range: baseText ? `${range} (${baseText})` : range,
  };
};

function App() {
  // State yönetimi
  const [monthlyNetEur, setMonthlyNetEur] = useState('');
  const [incomeCurrency, setIncomeCurrency] = useState('EUR'); // EUR | TRY
  const [exchangeRate, setExchangeRate] = useState(null);
  const [rateDate, setRateDate] = useState('');
  const [monthlyRates, setMonthlyRates] = useState([]); // Her ayın kuru
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [results, setResults] = useState(null);
  const [tableCurrency, setTableCurrency] = useState('TRY');
  const [manualRate, setManualRate] = useState(''); // Manuel kur girişi
  const [startMonthIndex, setStartMonthIndex] = useState(0); // Şirket başlangıç ayı (0=Ocak)
  const [startYear, setStartYear] = useState(new Date().getFullYear()); // Şirket başlangıç yılı
  const [bagkurRate, setBagkurRate] = useState(BAGKUR_DEFAULT_RATE); // Bağkur oranı
  const [bagkurInfoOpen, setBagkurInfoOpen] = useState(false);
  const [calcYear, setCalcYear] = useState(new Date().getFullYear()); // Kur/vergi yılı

  // Sabit muhasebe ücreti
  const MUHASEBE_AYLIK = 45; // EUR

  // KDV oranı
  const KDV_RATE = 0.20; // %20

  // Backend API URL
  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

  // Döviz kuru çekme - Sayfa yüklendiğinde
  useEffect(() => {
    // LocalStorage'dan seçimleri yükle
    if (typeof window !== 'undefined') {
      const storedStart = window.localStorage.getItem(LS_KEY_START_MONTH);
      const storedRate = window.localStorage.getItem(LS_KEY_BAGKUR_RATE);
      const storedYear = window.localStorage.getItem(LS_KEY_START_YEAR);
      if (storedStart !== null) {
        const parsed = Number(storedStart);
        if (Number.isInteger(parsed) && parsed >= 0 && parsed <= 11) {
          setStartMonthIndex(parsed);
        }
      }
      if (storedYear !== null) {
        const parsedYear = Number(storedYear);
        if (Number.isInteger(parsedYear) && parsedYear > 1900) {
          setStartYear(parsedYear);
        }
      }
      if (storedRate !== null) {
        const parsedRate = Number(storedRate);
        if (parsedRate > 0) {
          setBagkurRate(parsedRate);
        }
      }
    }
    fetchExchangeRate();
    fetchMonthlyRates();
  }, []);

  // Başlangıç ayı değişirse ve sonuç varsa yeniden hesapla
  useEffect(() => {
    if (results && monthlyNetEur) {
      handleCalculate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startMonthIndex, bagkurRate]);

  // Seçimleri localStorage'a yaz
  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(LS_KEY_START_MONTH, String(startMonthIndex));
      window.localStorage.setItem(LS_KEY_START_YEAR, String(startYear));
      window.localStorage.setItem(LS_KEY_BAGKUR_RATE, String(bagkurRate));
    }
  }, [startMonthIndex, startYear, bagkurRate]);

  // TCMB XML'den EUR kuru çekme (doğrudan TCMB, dev ortamında Vite proxy yolu)
  const fetchTCMBRate = async (date) => {
    const parseXml = (xmlText) => {
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(xmlText, 'text/xml');
      const parseError = xmlDoc.getElementsByTagName('parsererror');
      if (parseError.length > 0) {
        console.error('XML parse hatası:', parseError[0].textContent);
        return null;
      }

      // Alış kurunu tercih et; yoksa satış kuruna düş.
      const eurBuying = xmlDoc.querySelector('Currency[CurrencyCode="EUR"] > ForexBuying');
      const eurSelling = xmlDoc.querySelector('Currency[CurrencyCode="EUR"] > ForexSelling');
      const eurNode = eurBuying?.textContent ? eurBuying : eurSelling;
      if (!eurNode || !eurNode.textContent) return null;

      const tarihAttr = xmlDoc.documentElement.getAttribute('Tarih') || '';
      const dateAttr = xmlDoc.documentElement.getAttribute('Date') || '';

      return {
        rate: parseFloat(eurNode.textContent),
        tarih: tarihAttr || dateAttr || ''
      };
    };

    const tcmbBase = import.meta.env.DEV ? '/tcmb/kurlar' : 'https://www.tcmb.gov.tr/kurlar';
    const tcmbRoot = import.meta.env.DEV ? '/tcmb' : 'https://www.tcmb.gov.tr';

    const buildTCMBUrl = (d) => {
      const day = String(d.getDate()).padStart(2, '0');
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const year = d.getFullYear();
      // Örn: https://www.tcmb.gov.tr/kurlar/202511/20112025.xml?_=TIMESTAMP
      return `${tcmbBase}/${year}${month}/${day}${month}${year}.xml?_=${Date.now()}`;
    };

    const dateUrl = buildTCMBUrl(date);
    const todayUrl = `${tcmbRoot}/kurlar/today.xml?_=${Date.now()}`;
    const isTodayRequest = (() => {
      const now = new Date();
      return now.getFullYear() === date.getFullYear()
        && now.getMonth() === date.getMonth()
        && now.getDate() === date.getDate();
    })();
    const tcmbTargets = isTodayRequest ? [dateUrl, todayUrl] : [dateUrl];

    for (const targetUrl of tcmbTargets) {
      try {
        const response = await fetch(targetUrl, {
          method: 'GET',
          headers: {
            'Accept': '*/*',
            'X-Requested-With': 'XMLHttpRequest'
          }
        });

        if (!response.ok) {
          console.warn('TCMB yanıtı başarısız:', response.status, response.statusText, targetUrl);
          continue;
        }

        const xmlText = await response.text();
        const parsed = parseXml(xmlText);
        if (parsed?.rate) {
          console.log('TCMB EUR kuru bulundu:', parsed.rate, 'Kaynak:', targetUrl);
          return { ...parsed, source: 'TCMB', url: targetUrl };
        }
      } catch (err) {
        console.error('TCMB kur çekme hatası:', err.message, targetUrl);
      }
    }

    console.warn('TCMB EUR kuru alınamadı');
    return null;
  };

  // Backend API'den aylık kurları çek
  const fetchMonthlyRates = async () => {
    try {
      console.log('Backend API\'den kurlar çekiliyor...');

      const response = await fetch(`${API_URL}/api/rates`);

      if (!response.ok) {
        throw new Error(`API hatası: ${response.status}`);
      }

      const data = await response.json();

      if (data.success && data.rates) {
        setMonthlyRates(data.rates);
        if (data.year) {
          setCalcYear(data.year);
        }
        console.log('Aylık kurlar yüklendi (Backend):', data.rates);
        console.log('Cache bilgisi:', data.cachedAt ? `Son güncelleme: ${new Date(data.cachedAt).toLocaleString('tr-TR')}` : 'Yeni cache');
      } else {
        throw new Error('API yanıtı başarısız');
      }
    } catch (err) {
      console.error('Backend API hatası:', err);
      // Fallback: Statik kurları kullan
      const today = new Date();
      const currentMonth = today.getMonth();
      const currentYear = today.getFullYear();

      const staticRates = STATIC_MONTH_RATES.slice(0, currentMonth + 1).map((item, index) => ({
        ...item,
        date: `${currentYear}-${String(index + 1).padStart(2, '0')}-20`,
        isCurrent: index === currentMonth,
        source: 'Static'
      }));
      setMonthlyRates(staticRates);
      setCalcYear(currentYear);
      console.warn('Backend erişilemedi, statik kurlar kullanılıyor');
    }
  };

  // Backend API'den güncel döviz kuru çek
  const fetchExchangeRate = async () => {
    try {
      setLoading(true);
      setError('');

      console.log('Güncel kur çekiliyor (Backend API)...');

      const response = await fetch(`${API_URL}/api/rate/today`);

      if (!response.ok) {
        throw new Error('Backend API hatası');
      }

      const data = await response.json();

      if (data.success && data.rate) {
        setExchangeRate(data.rate);
        setRateDate(`${data.tarih} (TCMB - Backend Cache)`);
        console.log('Güncel kur:', data.rate);
      } else {
        throw new Error('Kur alınamadı');
      }

    } catch (err) {
      console.error('Kur hatası:', err);
      // Hata durumunda statik kur kullan
      const currentMonth = new Date().getMonth();
      const fallbackRate = STATIC_MONTH_RATES[currentMonth]?.rate || 49.62;
      setExchangeRate(fallbackRate);
      setRateDate('Statik Kur (Backend Erişilemedi)');
      console.warn('Backend erişilemedi, statik kur:', fallbackRate);
    } finally {
      setLoading(false);
    }
  };

  // Hesaplama fonksiyonu
  const handleCalculate = () => {
    if (!monthlyNetEur || monthlyNetEur <= 0) {
      setError('Lütfen geçerli bir aylık net gelir girin.');
      return;
    }

    if (incomeCurrency === 'EUR' && !exchangeRate) {
      setError('Döviz kuru yüklenemedi. Lütfen sayfayı yenileyin.');
      return;
    }

    setError('');

    const netInput = parseFloat(monthlyNetEur);
    if (!Number.isFinite(netInput) || netInput <= 0) {
      setError('Lütfen geçerli bir aylık net gelir girin.');
      return;
    }
    const monthlyNetEurNum = incomeCurrency === 'EUR'
      ? netInput
      : (exchangeRate ? netInput / (exchangeRate || 1) : 0);
    const computeBagkur = (netTry, rateForMonth = bagkurRate) => Math.min(netTry * rateForMonth, BAGKUR_CAP_TRY);

    // Manuel kur varsa onu kullan, yoksa backend'den gelen kuru kullan
    const effectiveRate = manualRate ? parseFloat(manualRate) : exchangeRate;

    // ratesForCalc array'ini oluştur ve manuel kur varsa güncel ayı güncelle
    let ratesForCalc = monthlyRates.length === 12
      ? monthlyRates
      : STATIC_MONTH_RATES.map((item) => ({
        ...item,
        isCurrent: false,
        source: item.source || 'Static'
      }));

    // Eğer manuel kur girilmişse, güncel ayın kurunu override et
    if (manualRate) {
      const parsedManualRate = parseFloat(manualRate);
      if (Number.isFinite(parsedManualRate) && parsedManualRate > 0) {
        ratesForCalc = ratesForCalc.map(monthData => {
          if (monthData.isCurrent) {
            return { ...monthData, rate: parsedManualRate };
          }
          return monthData;
        });
      }
    }

    // Başlangıç ayından itibaren filtrele
    const startIndexForYear = startYear < calcYear ? 0 : startMonthIndex;
    ratesForCalc = ratesForCalc.slice(startIndexForYear);
    if (!ratesForCalc.length) {
      setError('Seçilen başlangıç ayı için kur verisi bulunamadı.');
      return;
    }

    // Güncel ayın kurunu güncellenmiş ratesForCalc'tan al
    const currentRate = ratesForCalc[ratesForCalc.length - 1]?.rate || effectiveRate || 1;

    // Özet kartı için güncel ay değerleri
    const monthlyNetTryForSummary = incomeCurrency === 'EUR' ? netInput * currentRate : netInput;
    const monthlyBagkurForSummary = computeBagkur(monthlyNetTryForSummary);
    const monthlyBagkurEurForSummary = currentRate ? monthlyBagkurForSummary / currentRate : 0;

    const totals = {
      netTry: 0,
      netEur: 0,
      bagkurTry: 0,
      bagkurEur: 0,
      taxTry: 0,
      taxEur: 0,
      brutBeforeVATTry: 0,
      brutBeforeVATEur: 0,
      kdvTry: 0,
      kdvEur: 0,
      totalTry: 0,
      totalEur: 0,
      muhasebeTry: 0,
      muhasebeEur: 0,
      grossTry: 0,
    };

    const monthlyRows = [];
    const monthRateFallback = (monthData) => Number.isFinite(monthData.rate) && monthData.rate > 0
      ? monthData.rate
      : (Number.isFinite(exchangeRate) && exchangeRate > 0 ? exchangeRate : 1);

    let cumulativeMatrah = 0;
    let cumulativeTax = 0;

    ratesForCalc.forEach((monthData, index) => {
      // İlk faaliyet ayı aynı yıl içindeyse %37,75; sonraki aylar seçilen oran
      const appliedBagkurRate = (startYear === calcYear && index === 0)
        ? BAGKUR_DEFAULT_RATE
        : bagkurRate;
      const monthRate = monthRateFallback(monthData);
      const targetNetTry = incomeCurrency === 'EUR' ? netInput * monthRate : netInput;
      const targetNetEur = incomeCurrency === 'EUR'
        ? netInput
        : (monthRate ? targetNetTry / monthRate : 0);

      const muhasebeTry = MUHASEBE_AYLIK * monthRate;
      const muhasebeEur = MUHASEBE_AYLIK;
      const otherExpenses = muhasebeTry;

      let low = targetNetTry;
      let high = targetNetTry * 5;

      let invoiceNetTry = targetNetTry;
      let incomeTaxTry = 0;
      let bagkurTry = 0;
      let taxableTry = 0;
      let netAchievedTry = targetNetTry;

      for (let i = 0; i < 60; i++) {
        const mid = (low + high) / 2;
        // Gelir vergisi matrahı: fatura KDV hariç tutarın tamamı (muhasebe düşülmez)
        const midTaxable = mid;
        const midCumMatrah = cumulativeMatrah + midTaxable;
        const midCumTax = calculateTax(midCumMatrah);
        const midIncomeTax = midCumTax - cumulativeTax;

        // Bağkur = Net × oran (varsayılan %37,75 veya indirimli %32)
        // Invoice = Net + Bağkur + Muhasebe + Tax
        // Invoice = Net × (1 + oran) + Muhasebe + Tax
        // Net (tavan dikkate alınmadan) = (Invoice - Tax - Muhasebe) / (1 + oran)
        const bagkurFactor = 1 + appliedBagkurRate;
        const midNetUncapped = (mid - midIncomeTax - otherExpenses) / bagkurFactor;
        const midBagkurUncapped = midNetUncapped * appliedBagkurRate;
        const midBagkur = Math.min(midBagkurUncapped, BAGKUR_CAP_TRY);
        const midNet = mid - midIncomeTax - midBagkur - otherExpenses;

        if (midNet > targetNetTry) {
          high = mid;
        } else {
          low = mid;
        }

        invoiceNetTry = mid;
        incomeTaxTry = midIncomeTax;
        bagkurTry = midBagkur;
        taxableTry = midTaxable;
        netAchievedTry = midNet;
      }

      const invoiceNetEur = invoiceNetTry / monthRate;
      const bagkurEur = bagkurTry / monthRate;
      const incomeTaxEur = incomeTaxTry / monthRate;
      const taxableEur = taxableTry / monthRate;

      const cumMatrahAfter = cumulativeMatrah + taxableTry;
      const cumTaxAfter = calculateTax(cumMatrahAfter);
      const bracket = getTaxBracket(cumMatrahAfter);

      const kdvTry = invoiceNetTry * KDV_RATE;
      const kdvEur = kdvTry / monthRate;
      const totalWithVATTry = invoiceNetTry + kdvTry;
      const totalWithVATEur = totalWithVATTry / monthRate;

      cumulativeMatrah = cumMatrahAfter;
      cumulativeTax = cumTaxAfter;

      monthlyRows.push({
        month: monthData.month,
        rate: monthRate,
        source: monthData.source || 'Unknown',
        isCurrent: monthData.isCurrent || false,
        bagkurRateApplied: appliedBagkurRate,
        netTry: netAchievedTry,
        netEur: netAchievedTry / monthRate,
        bagkurTry,
        bagkurEur,
        taxTry: incomeTaxTry,
        taxEur: incomeTaxEur,
        muhasebeTry,
        muhasebeEur,
        taxableTry,
        taxableEur,
        brutBeforeVATTry: invoiceNetTry,
        brutBeforeVATEur: invoiceNetEur,
        kdvTry,
        kdvEur,
        totalWithVATTry,
        totalWithVATEur,
        bracket,
      });

      totals.taxTry += incomeTaxTry;
      totals.taxEur += incomeTaxEur;
      totals.netTry += netAchievedTry;
      totals.netEur += netAchievedTry / monthRate;
      totals.bagkurTry += bagkurTry;
      totals.bagkurEur += bagkurEur;
      totals.muhasebeTry += muhasebeTry;
      totals.muhasebeEur += muhasebeEur;
      totals.brutBeforeVATTry += invoiceNetTry;
      totals.brutBeforeVATEur += invoiceNetEur;
      totals.kdvTry += kdvTry;
      totals.kdvEur += kdvEur;
      totals.totalTry += totalWithVATTry;
      totals.totalEur += totalWithVATEur;
    });

    const monthCount = monthlyRows.length || 1;
    const yearlyNetTry = totals.netTry;
    const yearlyNetEur = totals.netEur;
    const yearlyBagkur = totals.bagkurTry;
    const yearlyBagkurEur = totals.bagkurEur;
    const yearlyTax = totals.taxTry;
    const yearlyTaxEur = totals.taxEur;
    const yearlyKdv = totals.kdvTry;
    const yearlyKdvEur = totals.kdvEur;
    const totalInvoiceWithVAT = totals.totalTry;
    const totalInvoiceWithVATEur = totals.totalEur;
    const yearlyTaxBase = cumulativeMatrah;

    setResults({
      monthlyNetEur: monthlyNetEurNum,
      monthlyNetTry: monthlyNetTryForSummary,
      yearlyNetTry,
      yearlyNetEur,
      taxBase: yearlyTaxBase,
      yearlyTax,
      yearlyTaxEur,
      monthlyBagkur: monthlyBagkurForSummary,
      monthlyBagkurEur: monthlyBagkurEurForSummary,
      yearlyBagkur,
      yearlyBagkurEur,
      brutInvoiceBeforeVAT: totals.brutBeforeVATTry,
      brutInvoiceBeforeVATEur: totals.brutBeforeVATEur,
      yearlyKdv,
      monthlyKdv: yearlyKdv / monthCount,
      yearlyKdvEur,
      monthlyKdvEur: yearlyKdvEur / monthCount,
      totalInvoiceWithVAT,
      totalInvoiceWithVATEur,
      totalWithAccounting: yearlyNetEur + (MUHASEBE_AYLIK * monthCount),
      monthCount,
      monthlyRows,
      yearlyMuhasebeTry: totals.muhasebeTry,
      yearlyMuhasebeEur: totals.muhasebeEur,
    });
  };

  const displayByTableCurrency = (tryValue, eurValue) => {
    return tableCurrency === 'EUR'
      ? formatCurrency(eurValue, 'EUR')
      : formatCurrency(tryValue, 'TRY');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 text-white p-4 md:p-8">
      {/* Ana Container */}
      <div className="max-w-7xl mx-auto">

        {/* Header */}
        <header className="text-center mb-8 md:mb-12">
          <h1 className="text-4xl md:text-6xl font-bold mb-3 bg-gradient-to-r from-blue-400 via-blue-600 to-blue-800 bg-clip-text text-transparent">
            2025 Gelir Vergisi & Muhasebe Hesaplayıcı
          </h1>
          <p className="text-lg md:text-xl text-gray-300">
            EUR net → TRY ve Ücret Dışı Gelir Vergisi Tarifesi
          </p>
        </header>

        {/* Input Card */}
        <div className="glass rounded-3xl p-6 md:p-8 mb-8 neon-glow-purple">
          <h2 className="text-2xl font-bold mb-6 text-neon-purple">Gelir Bilgileri</h2>

          <div className="mb-6">
            {/* Aylık Net Gelir (EUR) */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Aylık Net Gelir *
              </label>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs text-gray-400">Para birimi:</span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setIncomeCurrency('EUR')}
                    className={`px-3 py-1 rounded-full border transition-colors ${incomeCurrency === 'EUR'
                      ? 'bg-neon-cyan/20 border-neon-cyan text-neon-cyan'
                      : 'border-gray-700 text-gray-300 hover:border-neon-cyan/60 hover:text-neon-cyan'
                    }`}
                  >
                    EUR
                  </button>
                  <button
                    type="button"
                    onClick={() => setIncomeCurrency('TRY')}
                    className={`px-3 py-1 rounded-full border transition-colors ${incomeCurrency === 'TRY'
                      ? 'bg-neon-purple/20 border-neon-purple text-neon-purple'
                      : 'border-gray-700 text-gray-300 hover:border-neon-purple/60 hover:text-neon-purple'
                    }`}
                  >
                    TL
                  </button>
                </div>
              </div>
              <input
                type="number"
                value={monthlyNetEur}
                onChange={(e) => setMonthlyNetEur(e.target.value)}
                placeholder={incomeCurrency === 'EUR' ? 'Örn: 5000' : 'Örn: 180000'}
                min="0"
                step="0.01"
                className="w-full px-4 py-3 bg-slate-800/50 border border-neon-purple/30 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-neon-purple transition-all"
              />
            </div>
            {/* Şirket başlangıç ayı */}
            <div className="mt-4">
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Şirketin Kurulduğu Ay
              </label>
              <select
                value={startMonthIndex}
                onChange={(e) => setStartMonthIndex(Number(e.target.value))}
                className="w-full px-4 py-3 bg-slate-800/50 border border-neon-cyan/30 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-neon-cyan transition-all"
              >
                {MONTH_OPTIONS.map((month, idx) => (
                  <option key={month} value={idx}>{month}</option>
                ))}
              </select>
              <p className="text-xs text-gray-400 mt-1">
                Hesaplamalar seçtiğiniz aydan itibaren başlatılır.
              </p>
            </div>

            {/* Şirket başlangıç yılı */}
            <div className="mt-4">
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Şirketin Kurulduğu Yıl
              </label>
              <input
                type="number"
                value={startYear}
                onChange={(e) => setStartYear(Number(e.target.value))}
                min="2000"
                step="1"
                className="w-full px-4 py-3 bg-slate-800/50 border border-neon-cyan/30 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-neon-cyan transition-all"
              />
              <p className="text-xs text-gray-400 mt-1">
                İlk ay (seçilen yıl ve ay) %37,75; sonraki yıllar/aylar seçili oranla devam eder.
              </p>
            </div>

            {/* Bağkur oranı seçimi */}
            <div className="mt-4">
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium text-gray-300">
                  Bağkur Oranı
                </label>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setBagkurInfoOpen((prev) => !prev)}
                    className="w-6 h-6 rounded-full bg-slate-800 border border-orange-300/50 text-orange-200 text-xs font-bold flex items-center justify-center hover:border-orange-200 focus:outline-none focus:ring-2 focus:ring-orange-300"
                  >
                    ?
                  </button>
                  {bagkurInfoOpen && (
                    <div className="absolute right-0 mt-2 w-80 bg-slate-900/95 border border-orange-400/30 rounded-lg p-4 shadow-xl text-xs z-50">
                      <div className="font-bold text-orange-200 mb-2">Bağkur prim indirimi</div>
                      <p className="text-gray-200 mb-2">
                        Yeni kurulan şirkette ilk ay varsayılan oran %37,75 uygulanır. Sonraki aylarda %5 indirimle oran %32’ye düşer.
                      </p>
                      <p className="text-gray-300 leading-relaxed">
                        İndirim için: son ödeme vadesi geçmiş prim borcu bulunmamalı ve primler zamanında ödenmeli. Prim borçlarını yapılandırıp taksit ve cari primlerini düzenli ödeyenler de %5 indirimden yararlanır. Başvuru şartı yok; şartları sağlayanlar otomatik olarak faydalanır.
                      </p>
                      <p className="text-[11px] text-orange-200 mt-2">Seçtiğiniz oran tüm hesaplamalara uygulanır.</p>
                    </div>
                  )}
                </div>
              </div>
              <select
                value={bagkurRate}
                onChange={(e) => setBagkurRate(Number(e.target.value))}
                className="w-full px-4 py-3 bg-slate-800/50 border border-orange-300/30 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-orange-300 transition-all"
              >
                <option value={BAGKUR_DEFAULT_RATE}>%37,75 (standart / ilk ay)</option>
                <option value={BAGKUR_DISCOUNT_RATE}>%32 (indirimli)</option>
              </select>
              <p className="text-xs text-gray-400 mt-1">
                İndirimi seçerseniz hesaplamalar %32 oranıyla yapılır.
              </p>
            </div>
          </div>

          {/* Hesapla Butonu */}
          <button
            onClick={handleCalculate}
            disabled={loading || !exchangeRate}
            className="w-full bg-gradient-to-r from-blue-600 to-blue-800 py-4 rounded-xl font-bold text-lg hover:shadow-[0_0_30px_rgba(59,130,246,0.4)] transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed hover:from-blue-700 hover:to-blue-900"
          >
            {loading ? 'Yükleniyor...' : '📊 Hesapla'}
          </button>

          {/* Hata Mesajı */}
          {error && (
            <div className="mt-4 p-4 bg-red-500/20 border border-red-500/50 rounded-xl text-red-300 text-center">
              {error}
            </div>
          )}
        </div>

        {/* Sonuçlar */}
        {results && (
          <div className="space-y-8">
            {/* Özet Kartı */}
            {(() => {
              const currentDay = new Date().getDate();
              const isAfter20th = currentDay >= 20;
              // Eğer 20'si gelmemişse bir önceki ay, gelmişse güncel ay
              const monthIndexToShow = isAfter20th
                ? results.monthlyRows.length - 1
                : Math.max(0, results.monthlyRows.length - 2);
              const monthDataToShow = results.monthlyRows[monthIndexToShow] || results.monthlyRows[results.monthlyRows.length - 1];
              const safeRate = monthDataToShow.rate || 1;
              const bagkurBaseTry = monthDataToShow.netTry || 0;
              const bagkurBaseEur = bagkurBaseTry / safeRate;
              const kdvAmountEur = monthDataToShow.kdvEur || 0;
              const kdvAmountTry = monthDataToShow.kdvTry || 0;
              const monthlyTaxable = monthDataToShow.taxableTry || 0;
              const cumulativeTaxable = results.monthlyRows
                .slice(0, monthIndexToShow + 1)
                .reduce((sum, row) => sum + (row.taxableTry || 0), 0);
              const prevCumulativeTaxable = cumulativeTaxable - monthlyTaxable;
              const monthlyIncomeTaxTry = monthDataToShow.taxTry || 0;
              const bagkurRatePct = ((monthDataToShow.bagkurRateApplied || bagkurRate) * 100).toFixed(2);

              return (
                <div className="glass rounded-3xl p-6 neon-glow-cyan">
                  <h3 className="text-xl font-bold mb-6 text-neon-cyan flex items-center gap-2">
                    <span>📊</span> Aylık Özet - {monthDataToShow.month} 2025
                  </h3>

                  <div className="flex flex-wrap items-center justify-center gap-3">
                    {/* Net Gelir */}
                    <div className="relative group">
                      <div className="glass p-4 rounded-xl text-center min-w-[120px] cursor-help">
                        <p className="text-xs text-gray-400 mb-1">Net Gelir</p>
                        <p className="text-lg font-bold text-white">
                          {formatCurrency(monthDataToShow.netEur, 'EUR')}
                        </p>
                      </div>
                      <div className="absolute invisible group-hover:visible bg-slate-800/95 backdrop-blur-sm text-white text-xs rounded-lg p-4 shadow-xl z-50 bottom-full mb-2 left-1/2 -translate-x-1/2 w-72 border border-neon-cyan/30">
                        <div className="font-bold text-neon-cyan mb-2">💰 Net Gelir Detayı</div>
                        <p className="text-gray-300 text-xs mb-2">Vergi, Bağkur ve muhasebe hariç hedeflenen net ödeme.</p>
                        <div className="text-[11px] space-y-1">
                          <div className="flex justify-between">
                            <span className="text-gray-400">EUR</span>
                            <span className="font-semibold text-white">{formatCurrency(monthDataToShow.netEur, 'EUR')}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-400">TL</span>
                            <span className="font-semibold text-white">{formatCurrency(monthDataToShow.netTry, 'TRY')}</span>
                          </div>
                        </div>
                        <div className="absolute top-full left-1/2 -translate-x-1/2 border-8 border-transparent border-t-slate-800/95"></div>
                      </div>
                    </div>

                    <div className="text-2xl font-bold text-gray-400">+</div>

                    {/* Bağkur Primi */}
                    <div className="relative group">
                      <div className="glass p-4 rounded-xl text-center min-w-[120px] cursor-help">
                        <p className="text-xs text-orange-400 mb-1">Bağkur Primi</p>
                        <p className="text-lg font-bold text-orange-400">
                          {formatCurrency(monthDataToShow.bagkurEur, 'EUR')}
                        </p>
                      </div>
                      <div className="absolute invisible group-hover:visible bg-slate-800/95 backdrop-blur-sm text-white text-xs rounded-lg p-4 shadow-xl z-50 bottom-full mb-2 left-1/2 -translate-x-1/2 w-80 border border-orange-400/30">
                        <div className="font-bold text-orange-300 mb-2">🛡️ Bağkur Primi Hesabı</div>
                        <p className="text-gray-300 text-xs mb-2">
                          Net tutar × %{bagkurRatePct} (tavan {formatCurrency(BAGKUR_CAP_TRY, 'TRY', 2)}) üzerinden hesaplanır.
                        </p>
                        <div className="text-[11px] space-y-1">
                          <div className="flex justify-between">
                            <span className="text-gray-400">Matrah (EUR)</span>
                            <span className="font-semibold text-white">{formatCurrency(bagkurBaseEur, 'EUR')}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-400">Matrah (TL)</span>
                            <span className="font-semibold text-white">{formatCurrency(bagkurBaseTry, 'TRY')}</span>
                          </div>
                          <div className="flex justify-between">
                        <span className="text-gray-400">Bağkur (EUR)</span>
                        <span className="font-semibold text-orange-200">{formatCurrency(monthDataToShow.bagkurEur, 'EUR')}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-400">Bağkur (TL)</span>
                        <span className="font-semibold text-orange-200">{formatCurrency(monthDataToShow.bagkurTry, 'TRY')}</span>
                      </div>
                        </div>
                        <div className="absolute top-full left-1/2 -translate-x-1/2 border-8 border-transparent border-t-slate-800/95"></div>
                      </div>
                    </div>

                    <div className="text-2xl font-bold text-gray-400">+</div>

                    {/* Muhasebe */}
                    <div className="glass p-4 rounded-xl text-center min-w-[120px]">
                      <p className="text-xs text-blue-400 mb-1">Muhasebe</p>
                      <p className="text-lg font-bold text-blue-400">
                        {formatCurrency(monthDataToShow.muhasebeEur, 'EUR')}
                      </p>
                    </div>

                    <div className="text-2xl font-bold text-gray-400">+</div>

                    {/* Gelir Vergisi */}
                    <div className="relative group">
                      <div className="glass p-4 rounded-xl text-center min-w-[120px] cursor-help">
                        <p className="text-xs text-red-400 mb-1">Gelir Vergisi</p>
                        <p className="text-lg font-bold text-red-400">
                          {formatCurrency(monthDataToShow.taxEur || 0, 'EUR')}
                        </p>
                      </div>

                      {/* Tooltip */}
                      <div className="absolute invisible group-hover:visible bg-slate-800/95 backdrop-blur-sm text-white text-xs rounded-lg p-4 shadow-xl z-50 bottom-full mb-2 left-1/2 -translate-x-1/2 w-72 border border-red-400/30">
                        <div className="font-bold text-red-400 mb-2">📊 Gelir Vergisi Hesaplaması</div>
                        <p className="mb-3 text-gray-300">
                          Kümülatif matrah (fatura KDV hariç tutarın tamamı) üzerinden <span className="font-semibold text-white">2025 Ücret Dışı Gelirler Tarifesi</span> ile hesaplanır.
                        </p>
                        <div className="text-[11px] space-y-1.5 bg-slate-700/50 p-2 rounded">
                          <div className="flex justify-between">
                            <span className="text-gray-400">Aylık matrah</span>
                            <span className="font-semibold text-white">{formatCurrency(monthlyTaxable, 'TRY')}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-400">Önceki kümülatif</span>
                            <span className="font-semibold text-white">{formatCurrency(prevCumulativeTaxable, 'TRY')}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-400">Yeni kümülatif</span>
                            <span className="font-semibold text-white">{formatCurrency(cumulativeTaxable, 'TRY')}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-400">Dilim / Oran</span>
                            <span className="font-semibold text-white">{`${monthDataToShow.bracket.name} (%${monthDataToShow.bracket.rate})`}</span>
                          </div>
                          <div className="flex justify-between font-semibold text-red-200 pt-1 border-t border-red-400/30">
                            <span>Aylık vergi</span>
                            <span>{formatCurrency(monthlyIncomeTaxTry, 'TRY')}</span>
                          </div>
                          <p className="text-[10px] text-gray-400 leading-relaxed">
                            Formül: Vergi = Tarifede kümülatif vergi(Yeni kümülatif matrah) - Tarifede kümülatif vergi(Önceki kümülatif matrah).
                          </p>
                        </div>
                        <div className="text-[11px] space-y-1.5 bg-slate-700/50 p-2 rounded">
                          <div className="flex justify-between">
                            <span>• 0 - 158.000 TL</span>
                            <span className="font-semibold text-yellow-300">%15</span>
                          </div>
                          <div className="flex justify-between">
                            <span>• 158.001 - 330.000 TL</span>
                            <span className="font-semibold text-yellow-300">%20</span>
                          </div>
                          <div className="flex justify-between">
                            <span>• 330.001 - 800.000 TL</span>
                            <span className="font-semibold text-orange-300">%27</span>
                          </div>
                          <div className="flex justify-between">
                            <span>• 800.001 - 4.300.000 TL</span>
                            <span className="font-semibold text-orange-400">%35</span>
                          </div>
                          <div className="flex justify-between">
                            <span>• 4.300.000+ TL</span>
                            <span className="font-semibold text-red-400">%40</span>
                          </div>
                        </div>
                        <div className="text-[10px] text-gray-300 mt-2 border-t border-red-400/30 pt-2 leading-relaxed">
                          Matematiksel ifade: V<sub>ay</sub> = T(M<sub>prev</sub> + M<sub>ay</sub>) − T(M<sub>prev</sub>)<br />
                          T(m): ilgili dilimdeki taban vergi + (m − dilim alt sınırı) × dilim oranı
                        </div>
                        {/* Arrow */}
                        <div className="absolute top-full left-1/2 -translate-x-1/2 border-8 border-transparent border-t-slate-800/95"></div>
                      </div>
                    </div>

                    <div className="text-2xl font-bold text-neon-cyan">=</div>

                    {/* KDV Hariç Tutar */}
                    <div className="relative group">
                      <div className="glass p-4 rounded-xl text-center min-w-[140px] border-2 border-neon-cyan/30 cursor-help">
                        <p className="text-xs text-green-400 mb-1">KDV Hariç Tutar</p>
                        <p className="text-lg font-bold text-neon-cyan">
                          {formatCurrency(monthDataToShow.brutBeforeVATEur || 0, 'EUR')}
                        </p>
                      </div>
                      <div className="absolute invisible group-hover:visible bg-slate-800/95 backdrop-blur-sm text-white text-xs rounded-lg p-4 shadow-xl z-50 bottom-full mb-2 left-1/2 -translate-x-1/2 w-80 border border-neon-cyan/40">
                        <div className="font-bold text-neon-cyan mb-2">🧾 KDV Hariç Tutar</div>
                        <p className="text-gray-300 text-xs mb-2">Net + Bağkur + Muhasebe + Gelir Vergisi toplamıdır.</p>
                        <div className="text-[11px] space-y-1">
                          <div className="flex justify-between">
                            <span className="text-gray-400">Net</span>
                            <span className="font-semibold text-white">{formatCurrency(monthDataToShow.netEur, 'EUR')}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-400">Bağkur</span>
                            <span className="font-semibold text-white">{formatCurrency(monthDataToShow.bagkurEur, 'EUR')}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-400">Muhasebe</span>
                            <span className="font-semibold text-white">{formatCurrency(monthDataToShow.muhasebeEur, 'EUR')}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-400">Gelir Vergisi</span>
                            <span className="font-semibold text-white">{formatCurrency(monthDataToShow.taxEur || 0, 'EUR')}</span>
                          </div>
                          <div className="flex justify-between font-semibold text-neon-cyan pt-1 border-t border-neon-cyan/30">
                            <span>Toplam (EUR)</span>
                            <span>{formatCurrency(monthDataToShow.brutBeforeVATEur || 0, 'EUR')}</span>
                          </div>
                          <div className="flex justify-between font-semibold text-neon-cyan">
                            <span>Toplam (TL)</span>
                            <span>{formatCurrency(monthDataToShow.brutBeforeVATTry || 0, 'TRY')}</span>
                          </div>
                        </div>
                        <div className="absolute top-full left-1/2 -translate-x-1/2 border-8 border-transparent border-t-slate-800/95"></div>
                      </div>
                    </div>

                    <div className="text-lg font-bold text-gray-400">× 1.2</div>

                    <div className="text-2xl font-bold text-green-400">=</div>

                    {/* KDV Dahil Tutar */}
                    <div className="relative group">
                      <div className="glass p-4 rounded-xl text-center min-w-[140px] border-2 border-green-500/30 cursor-help">
                        <p className="text-xs text-green-400 mb-1">KDV Dahil Tutar</p>
                        <p className="text-lg font-bold text-green-400">
                          {formatCurrency(monthDataToShow.totalWithVATEur || 0, 'EUR')}
                        </p>
                      </div>
                      <div className="absolute invisible group-hover:visible bg-slate-800/95 backdrop-blur-sm text-white text-xs rounded-lg p-4 shadow-xl z-50 bottom-full mb-2 left-1/2 -translate-x-1/2 w-80 border border-green-500/40">
                        <div className="font-bold text-green-300 mb-2">🧮 KDV Dahil</div>
                        <p className="text-gray-300 text-xs mb-2">KDV hariç tutara %20 KDV eklenmiş halidir.</p>
                        <div className="text-[11px] space-y-1">
                          <div className="flex justify-between">
                            <span className="text-gray-400">KDV Hariç</span>
                            <span className="font-semibold text-white">{formatCurrency(monthDataToShow.brutBeforeVATEur || 0, 'EUR')}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-400">KDV (%20)</span>
                            <span className="font-semibold text-green-200">{formatCurrency(kdvAmountEur, 'EUR')}</span>
                          </div>
                          <div className="flex justify-between font-semibold text-green-300 pt-1 border-t border-green-500/30">
                            <span>Toplam (EUR)</span>
                            <span>{formatCurrency(monthDataToShow.totalWithVATEur || 0, 'EUR')}</span>
                          </div>
                          <div className="flex justify-between font-semibold text-green-300">
                            <span>Toplam (TL)</span>
                            <span>{formatCurrency(monthDataToShow.totalWithVATTry || 0, 'TRY')}</span>
                          </div>
                          <div className="flex justify-between text-[10px] text-gray-400 pt-1">
                            <span>KDV (TL)</span>
                            <span className="text-green-200 font-semibold">{formatCurrency(kdvAmountTry, 'TRY')}</span>
                          </div>
                        </div>
                        <div className="absolute top-full left-1/2 -translate-x-1/2 border-8 border-transparent border-t-slate-800/95"></div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Aylık Detay Tablosu */}
            <div className="glass rounded-3xl p-6 md:p-8 neon-glow-cyan">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
                <h2 className="text-2xl font-bold text-neon-cyan flex items-center gap-2">
                  <span>📅</span> Aylık Detay Breakdown
                </h2>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-gray-400">Tablo para birimi:</span>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setTableCurrency('TRY')}
                      className={`px-3 py-1 rounded-full border transition-colors ${tableCurrency === 'TRY'
                        ? 'bg-neon-cyan/20 border-neon-cyan text-neon-cyan'
                        : 'border-gray-700 text-gray-300 hover:border-neon-cyan/60 hover:text-neon-cyan'
                      }`}
                    >
                      TL
                    </button>
                    <button
                      onClick={() => setTableCurrency('EUR')}
                      className={`px-3 py-1 rounded-full border transition-colors ${tableCurrency === 'EUR'
                        ? 'bg-neon-purple/20 border-neon-purple text-neon-purple'
                        : 'border-gray-700 text-gray-300 hover:border-neon-purple/60 hover:text-neon-purple'
                      }`}
                    >
                      EUR
                    </button>
                  </div>
                </div>
              </div>

              {/* Responsive tablo */}
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-gray-700">
                      <th className="py-3 px-2 text-xs font-semibold text-gray-300">Ay</th>
                      <th className="py-3 px-2 text-xs font-semibold text-cyan-300">Kur</th>
                      <th className="py-3 px-2 text-xs font-semibold text-gray-300">Vergi Dilimi</th>
                      <th className="py-3 px-2 text-xs font-semibold text-gray-300">Net ({tableCurrency})</th>
                      <th className="py-3 px-2 text-xs font-semibold text-orange-300">Bağkur Prim ({tableCurrency})</th>
                      <th className="py-3 px-2 text-xs font-semibold text-red-300">Gelir Vergisi ({tableCurrency})</th>
                      <th className="py-3 px-2 text-xs font-semibold text-green-300">{`Muhasebe (${MUHASEBE_AYLIK} EUR)`}</th>
                      <th className="py-3 px-2 text-xs font-semibold text-yellow-300">Brüt Fatura KDV Hariç ({tableCurrency})</th>
                      <th className="py-3 px-2 text-xs font-semibold text-blue-300">KDV %20 ({tableCurrency})</th>
                      <th className="py-3 px-2 text-xs font-semibold text-purple-300">Toplam Fatura KDV Dahil ({tableCurrency})</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.monthlyRows?.map((row, index) => (
                      <tr
                        key={index}
                        className="border-b border-gray-800 hover:bg-slate-800/30 transition-colors"
                      >
                        <td className="py-2 px-2 font-medium text-neon-cyan">{row.month}</td>
                        <td className="py-2 px-2 text-cyan-300 text-xs">
                          {row.isCurrent && new Date().getDate() < 20 ? (
                            <input
                              type="number"
                              value={manualRate || (row.rate ? row.rate : '')}
                              onChange={(e) => setManualRate(e.target.value)}
                              onBlur={() => {
                                if (results && monthlyNetEur) {
                                  handleCalculate();
                                }
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.currentTarget.blur();
                                }
                              }}
                              placeholder="Kur giriniz"
                              min="0"
                              step="0.0001"
                              className="w-24 px-2 py-1 bg-slate-800/50 border border-neon-cyan/30 rounded text-white text-xs focus:outline-none focus:ring-1 focus:ring-neon-cyan"
                            />
                          ) : (
                            row.rate ? formatNumber(row.rate, 4) : '-'
                          )}
                        </td>
                        <td className="py-2 px-2 text-xs text-gray-300">
                          <span className="block font-semibold text-white">{`${row.bracket.name} (%${row.bracket.rate})`}</span>
                          <span className="text-[10px] text-gray-500">{row.bracket.range}</span>
                        </td>
                        <td className="py-2 px-2">{displayByTableCurrency(row.netTry, row.netEur)}</td>
                        <td className="py-2 px-2 text-orange-300">{displayByTableCurrency(row.bagkurTry, row.bagkurEur)}</td>
                        <td className="py-2 px-2 text-red-300">{displayByTableCurrency(row.taxTry, row.taxEur)}</td>
                        <td className="py-2 px-2 text-green-300">{displayByTableCurrency(row.muhasebeTry, row.muhasebeEur)}</td>
                        <td className="py-2 px-2 font-bold text-yellow-300">{displayByTableCurrency(row.brutBeforeVATTry, row.brutBeforeVATEur)}</td>
                        <td className="py-2 px-2 text-blue-300">{displayByTableCurrency(row.kdvTry, row.kdvEur)}</td>
                        <td className="py-2 px-2 font-bold text-purple-300">{displayByTableCurrency(row.totalWithVATTry, row.totalWithVATEur)}</td>
                      </tr>
                    ))}
                  </tbody>
                  {/* Toplam satırı */}
                  <tfoot>
                    <tr className="border-t-2 border-neon-cyan">
                      <td className="py-3 px-2 font-bold text-sm text-neon-cyan">TOPLAM</td>
                      <td className="py-3 px-2 font-bold text-sm">-</td>
                      <td className="py-3 px-2 font-bold text-sm text-white">
                        {`${getTaxBracket(results.taxBase).name} (%${getTaxBracket(results.taxBase).rate})`}
                      </td>
                      <td className="py-3 px-2 font-bold text-sm">{displayByTableCurrency(results.yearlyNetTry, results.yearlyNetEur)}</td>
                      <td className="py-3 px-2 font-bold text-sm text-orange-300">{displayByTableCurrency(results.yearlyBagkur, results.yearlyBagkurEur)}</td>
                      <td className="py-3 px-2 font-bold text-sm text-red-300">{displayByTableCurrency(results.yearlyTax, results.yearlyTaxEur)}</td>
                      <td className="py-3 px-2 font-bold text-sm text-green-300">{displayByTableCurrency(results.yearlyMuhasebeTry, results.yearlyMuhasebeEur)}</td>
                      <td className="py-3 px-2 font-bold text-sm text-yellow-300">{displayByTableCurrency(results.brutInvoiceBeforeVAT, results.brutInvoiceBeforeVATEur)}</td>
                      <td className="py-3 px-2 font-bold text-sm text-blue-300">{displayByTableCurrency(results.yearlyKdv, results.yearlyKdvEur)}</td>
                      <td className="py-3 px-2 font-bold text-sm text-purple-300">{displayByTableCurrency(results.totalInvoiceWithVAT, results.totalInvoiceWithVATEur)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Bilgilendirme notu */}
              <div className="mt-6 p-4 bg-blue-500/10 border border-blue-500/30 rounded-xl">
                <p className="text-sm text-yellow-300">
                  📄 <strong>Brüt Fatura:</strong> KDV hariç kesilecek tutardır; net + Bağkur + muhasebe giderleri + ilgili ay gelir vergisini içerir. KDV %20 ayrıca eklenir.
                </p>
                <p className="text-sm text-blue-300 mt-2">
                  💡 <strong>Kümülatif:</strong> İlgili aya kadar biriken toplam (Net gelir + Bağkur + Muhasebe ücretleri).
                </p>
                <p className="text-xs text-blue-300 mt-1">
                  Örnek: Mart ayı = (Ocak net + Bağkur + Muhasebe) + (Şubat net + Bağkur + Muhasebe) + (Mart net + Bağkur + Muhasebe)
                </p>
                <p className="text-xs text-orange-200 mt-2">
                  🛡️ <strong>Bağkur indirimi:</strong> Kuruluş yılındaki ilk ay %37,75; sonraki aylarda şartları sağlarsanız %32 uygulanabilir (başvuru gerekmez).
                </p>
                <p className="text-xs text-cyan-300 mt-2">
                  🌍 <strong>Kur:</strong> Her ayın 20'si kuru kullanılır. Bulunduğumuz ay 20'sine gelmediyse manuel kur girişi yapabilirsiniz.
                </p>
                <p className="text-xs text-orange-300 mt-2">
                  ⚠️ <strong>Önemli:</strong> Gelir vergisi, fatura KDV hariç tutarın tamamının kümülatifi üzerinden hesaplanır. Bağkur primi vergi matrahından düşülmez.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Footer Bilgilendirme */}
        <footer className="mt-12 text-center text-sm text-gray-400 space-y-2">
          <p>
            ⚠️ Bu hesaplama, 2025 yılı "Ücret Dışındaki Gelirler İçin Gelir Vergisi Tarifesi" ve seçtiğiniz Bağkur prim oranına (%{formatNumber(bagkurRate * 100, 2)}, aylık tavan {formatCurrency(BAGKUR_CAP_TRY, 'TRY', 2)}) göre yapılmıştır.
          </p>
          <p>
            Matrah: fatura KDV hariç tutarın tamamı (Bağkur primi matrahtan düşülmez). Gerçek durumunuz için mutlaka mali müşavirinize danışın.
          </p>
          <p className="text-xs text-gray-500">
            Döviz kuru: TCMB (T.C. Merkez Bankası) | Doğukan Elbasan
          </p>
        </footer>

      </div>
    </div>
  );
}

export default App;
