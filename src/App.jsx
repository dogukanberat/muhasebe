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
const formatCurrency = (amount, currency = 'TRY', decimals = 2) => {
  return new Intl.NumberFormat('tr-TR', {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  }).format(amount);
};

// Sayı formatlama (binlik ayırıcıyla)
const formatNumber = (num, decimals = 2) => {
  return new Intl.NumberFormat('tr-TR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
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

  // Sabit muhasebe ücreti
  const MUHASEBE_AYLIK = 54; // EUR
  const BAGKUR_RATE = 0.3775; // %37,75
  const BAGKUR_CAP_TRY = 68264.49; // Aylık tavan

  // KDV oranı
  const KDV_RATE = 0.20; // %20

  // Backend API URL
  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

  // Döviz kuru çekme - Sayfa yüklendiğinde
  useEffect(() => {
    fetchExchangeRate();
    fetchMonthlyRates();
  }, []);

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
    const computeBagkur = (netTry) => Math.min(netTry * BAGKUR_RATE, BAGKUR_CAP_TRY);

    // Manuel kur varsa onu kullan, yoksa backend'den gelen kuru kullan
    const effectiveRate = manualRate ? parseFloat(manualRate) : exchangeRate;

    // ratesForCalc array'ini oluştur ve manuel kur varsa güncel ayı güncelle
    let ratesForCalc = monthlyRates.length === 12
      ? monthlyRates
      : STATIC_MONTH_RATES;

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
        const midTaxable = mid - otherExpenses;
        const midCumMatrah = cumulativeMatrah + midTaxable;
        const midCumTax = calculateTax(midCumMatrah);
        const midIncomeTax = midCumTax - cumulativeTax;

        // SGK = (Net + Muhasebe) × 37.75%
        // Invoice = Net + SGK + Muhasebe + Tax
        // Invoice = Net + (Net + Muhasebe) × 0.3775 + Muhasebe + Tax
        // Invoice - Tax = (Net + Muhasebe) × 1.3775
        // Net = (Invoice - Tax - Muhasebe × 1.3775) / 1.3775
        const midNet = (mid - midIncomeTax - otherExpenses * 1.3775) / 1.3775;
        const midBagkur = Math.min((midNet + otherExpenses) * BAGKUR_RATE, BAGKUR_CAP_TRY);

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

              return (
                <div className="glass rounded-3xl p-6 neon-glow-cyan">
                  <h3 className="text-xl font-bold mb-6 text-neon-cyan flex items-center gap-2">
                    <span>📊</span> Aylık Özet - {monthDataToShow.month} 2025
                  </h3>

                  <div className="flex flex-wrap items-center justify-center gap-3">
                    {/* Net Gelir */}
                    <div className="glass p-4 rounded-xl text-center min-w-[120px]">
                      <p className="text-xs text-gray-400 mb-1">Net Gelir</p>
                      <p className="text-lg font-bold text-white">
                        {formatCurrency(monthDataToShow.netEur, 'EUR')}
                      </p>
                    </div>

                    <div className="text-2xl font-bold text-gray-400">+</div>

                    {/* SGK Primi */}
                    <div className="glass p-4 rounded-xl text-center min-w-[120px]">
                      <p className="text-xs text-orange-400 mb-1">SGK Primi</p>
                      <p className="text-lg font-bold text-orange-400">
                        {formatCurrency(monthDataToShow.bagkurEur, 'EUR')}
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
                        <p className="mb-3 text-gray-300">Kümülatif matrah (fatura KDV hariç - muhasebe) üzerinden <span className="font-semibold text-white">2025 Ücret Dışı Gelirler Tarifesi</span> ile hesaplanır.</p>
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
                        {/* Arrow */}
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

                    <div className="text-2xl font-bold text-neon-cyan">=</div>

                    {/* KDV Hariç Tutar */}
                    <div className="glass p-4 rounded-xl text-center min-w-[140px] border-2 border-neon-cyan/30">
                      <p className="text-xs text-green-400 mb-1">KDV Hariç Tutar</p>
                      <p className="text-lg font-bold text-neon-cyan">
                        {formatCurrency(monthDataToShow.brutBeforeVATEur || 0, 'EUR')}
                      </p>
                    </div>

                    <div className="text-lg font-bold text-gray-400">× 1.2</div>

                    <div className="text-2xl font-bold text-green-400">=</div>

                    {/* KDV Dahil Tutar */}
                    <div className="glass p-4 rounded-xl text-center min-w-[140px] border-2 border-green-500/30">
                      <p className="text-xs text-green-400 mb-1">KDV Dahil Tutar</p>
                      <p className="text-lg font-bold text-green-400">
                        {formatCurrency(monthDataToShow.totalWithVATEur || 0, 'EUR')}
                      </p>
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
                      <th className="py-3 px-2 text-xs font-semibold text-orange-300">SGK Prim ({tableCurrency})</th>
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
                <p className="text-xs text-cyan-300 mt-2">
                  🌍 <strong>Kur:</strong> Her ayın 20'si kuru kullanılır. Bulunduğumuz ay 20'sine gelmediyse manuel kur girişi yapabilirsiniz.
                </p>
                <p className="text-xs text-orange-300 mt-2">
                  ⚠️ <strong>Önemli:</strong> Gelir vergisi, fatura KDV hariç tutardan sadece muhasebe giderleri düşülerek oluşan kümülatif matrah üzerinden hesaplanır. SGK primi vergi matrahından düşülmez.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Footer Bilgilendirme */}
        <footer className="mt-12 text-center text-sm text-gray-400 space-y-2">
          <p>
            ⚠️ Bu hesaplama, 2025 yılı "Ücret Dışındaki Gelirler İçin Gelir Vergisi Tarifesi" ve Bağkur prim oranına (%37,75, aylık tavan {formatCurrency(BAGKUR_CAP_TRY, 'TRY', 2)}) göre yapılmıştır.
          </p>
          <p>
            Matrah: fatura KDV hariç - muhasebe giderleri (SGK primi matrahtan düşülmez). Gerçek durumunuz için mutlaka mali müşavirinize danışın.
          </p>
          <p className="text-xs text-gray-500">
            Döviz kuru: TCMB (T.C. Merkez Bankası) | Tasarım: Futuristik Glassmorphism UI
          </p>
        </footer>

      </div>
    </div>
  );
}

export default App;
