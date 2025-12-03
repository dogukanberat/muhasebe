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

  // Sabit muhasebe ücreti
  const MUHASEBE_AYLIK = 45; // EUR
  const BAGKUR_RATE = 0.3773; // %37,73
  const BAGKUR_CAP_TRY = 68264.49; // Aylık tavan
  const DECLARATION_STAMP = {
    kdvMonthlyTry: 150,          // KDV Beyannamesi (aylık damga) - TRY
    geciciQuarterlyTry: 150,     // Gelir Geçici Beyannamesi (3 ayda bir) - TRY
    muhtasarQuarterlyTry: 150,   // Muhtasar Beyannamesi (3 ayda bir) - TRY
    yearlyIncomeTry: 150,        // Yıllık Gelir Vergisi Beyannamesi (yılda 1) - TRY
  };

  // KDV oranı
  const KDV_RATE = 0.20; // %20

  // Damga Vergisi oranı
  const DAMGA_RATE = 0.00759; // %0.759

  // Döviz kuru çekme - Sayfa yüklendiğinde
  useEffect(() => {
    fetchExchangeRate();
    fetchMonthlyRates();
  }, []);

  // Ocak'tan bugüne kadar her ayın son günü kurunu çek
  const fetchMonthlyRates = async () => {
    try {
      const rates = [];
      const today = new Date();
      const currentYear = today.getFullYear();
      const currentMonth = today.getMonth(); // 0-11 (Ocak=0, Aralık=11)

      // Ocak'tan (0) bugünkü aya kadar
      for (let monthIndex = 0; monthIndex <= currentMonth; monthIndex++) {
        let dateStr;
        let date;
        const isCurrentMonth = monthIndex === currentMonth;

        if (isCurrentMonth) {
          // Bugünkü ay - güncel tarih kullan
          date = today;
          const year = date.getFullYear();
          const month = String(date.getMonth() + 1).padStart(2, '0');
          const day = String(date.getDate()).padStart(2, '0');
          dateStr = `${year}-${month}-${day}`;
        } else {
          // Geçmiş aylar - ayın son günü
          date = new Date(currentYear, monthIndex + 1, 0); // Ayın son günü
          const year = date.getFullYear();
          const month = String(date.getMonth() + 1).padStart(2, '0');
          const day = String(date.getDate()).padStart(2, '0');
          dateStr = `${year}-${month}-${day}`;
        }

        const monthName = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
                         'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'][monthIndex];

        try {
          // frankfurter.app - ücretsiz ECB kurları (geçmiş tarih desteği var)
          const response = await fetch(`https://api.frankfurter.app/${dateStr}?from=EUR&to=TRY`);

          if (response.ok) {
            const data = await response.json();
            rates.push({
              month: monthName,
              date: dateStr,
              rate: data.rates.TRY || null,
              isCurrent: isCurrentMonth // Bugünkü ay işareti
            });
          } else {
            // API hatası olursa null kur ekle
            rates.push({
              month: monthName,
              date: dateStr,
              rate: null,
              isCurrent: isCurrentMonth
            });
          }
        } catch (err) {
          console.error(`${dateStr} kuru alınamadı:`, err);
          // Hata durumunda null kur ekle
          rates.push({
            month: monthName,
            date: dateStr,
            rate: null,
            isCurrent: isCurrentMonth
          });
        }

        // API rate limit için kısa bekleme
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      setMonthlyRates(rates);
    } catch (err) {
      console.error('Aylık kurlar alınamadı:', err);
    }
  };

  // Döviz kuru API (exchangerate-api.com - ücretsiz)
  const fetchExchangeRate = async () => {
    try {
      setLoading(true);
      setError('');

      // exchangerate-api.com kullanıyoruz (ücretsiz, günlük 1500 istek limiti)
      const response = await fetch('https://api.exchangerate-api.com/v4/latest/EUR');

      if (!response.ok) {
        throw new Error('Döviz kuru alınamadı');
      }

      const data = await response.json();
      const rate = data.rates.TRY;

      setExchangeRate(rate);

      // Tarih formatla
      const date = new Date(data.date);
      const formattedDate = date.toLocaleDateString('tr-TR', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
      setRateDate(formattedDate);

    } catch (err) {
      setError('Döviz kuru çekilemedi. Lütfen tekrar deneyin.');
      console.error('Kur hatası:', err);
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
    const currentRate = monthlyRates[monthlyRates.length - 1]?.rate || exchangeRate || 1;
    const ratesForCalc = monthlyRates.length === 12
      ? monthlyRates
      : STATIC_MONTH_RATES;

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
      damgaTry: 0,
      damgaEur: 0,
      brutBeforeVATTry: 0,
      brutBeforeVATEur: 0,
      kdvTry: 0,
      kdvEur: 0,
      totalTry: 0,
      totalEur: 0,
      muhasebeTry: 0,
      muhasebeEur: 0,
      declarationStampTry: 0,
      declarationStampEur: 0,
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
      const fixedDamgaTry = 150; // Aylık sabit damga vergisi
      const fixedDamgaEur = fixedDamgaTry / monthRate;
      const otherExpenses = fixedDamgaTry + muhasebeTry;

      const monthNumber = index + 1;
      let declarationStampTry = DECLARATION_STAMP.kdvMonthlyTry;
      if (monthNumber % 3 === 0) {
        declarationStampTry += DECLARATION_STAMP.geciciQuarterlyTry + DECLARATION_STAMP.muhtasarQuarterlyTry;
      }
      if (monthNumber === 12) {
        declarationStampTry += DECLARATION_STAMP.yearlyIncomeTry;
      }
      const declarationStampEur = declarationStampTry / monthRate;

      let low = targetNetTry;
      let high = targetNetTry * 5;

      let invoiceNetTry = targetNetTry;
      let incomeTaxTry = 0;
      let bagkurTry = 0;
      let taxableTry = 0;
      let netAchievedTry = targetNetTry;

      for (let i = 0; i < 60; i++) {
        const mid = (low + high) / 2;
        const midBagkur = computeBagkur(mid);
        const midTaxable = mid - midBagkur - otherExpenses;
        const midCumMatrah = cumulativeMatrah + midTaxable;
        const midCumTax = calculateTax(midCumMatrah);
        const midIncomeTax = midCumTax - cumulativeTax;
        const midNet = mid - midBagkur - otherExpenses - midIncomeTax;

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
        netTry: netAchievedTry,
        netEur: netAchievedTry / monthRate,
        bagkurTry,
        bagkurEur,
        taxTry: incomeTaxTry,
        taxEur: incomeTaxEur,
        declarationStampTry,
        declarationStampEur,
        damgaTry: fixedDamgaTry,
        damgaEur: fixedDamgaEur,
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
      totals.declarationStampTry += declarationStampTry;
      totals.declarationStampEur += declarationStampEur;
      totals.damgaTry += fixedDamgaTry;
      totals.damgaEur += fixedDamgaEur;
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
    const yearlyDamga = totals.damgaTry;
    const yearlyDamgaEur = totals.damgaEur;
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
      yearlyDamga,
      monthlyDamga: yearlyDamga / monthCount,
      yearlyDamgaEur,
      monthlyDamgaEur: yearlyDamgaEur / monthCount,
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
      yearlyDeclarationStampTry: totals.declarationStampTry,
      yearlyDeclarationStampEur: totals.declarationStampEur,
    });
  };

  const displayByTableCurrency = (tryValue, eurValue) => {
    return tableCurrency === 'EUR'
      ? formatCurrency(eurValue, 'EUR')
      : formatCurrency(tryValue, 'TRY');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 text-white p-4 md:p-8">
      {/* Ana Container */}
      <div className="max-w-7xl mx-auto">

        {/* Header */}
        <header className="text-center mb-8 md:mb-12">
          <h1 className="text-4xl md:text-6xl font-bold mb-3 bg-gradient-to-r from-neon-cyan via-neon-purple to-neon-pink bg-clip-text text-transparent">
            Gelir Vergisi & Muhasebe Hesaplayıcı
          </h1>
          <p className="text-lg md:text-xl text-gray-300">
            EUR net → TRY ve 2025 Ücret Dışı Gelir Vergisi Tarifesi
          </p>
        </header>

        {/* Döviz Kuru Bilgisi */}
        {exchangeRate && (
          <div className="glass rounded-2xl p-4 mb-6 text-center neon-glow-cyan">
            <p className="text-sm text-gray-300">Güncel Kur:</p>
            <p className="text-2xl font-bold text-neon-cyan">
              1 EUR = {formatNumber(exchangeRate)} TL
            </p>
            {rateDate && (
              <p className="text-xs text-gray-400 mt-1">{rateDate}</p>
            )}
            <button
              onClick={fetchExchangeRate}
              disabled={loading}
              className="mt-2 text-xs text-neon-cyan hover:text-white transition-colors"
            >
              {loading ? 'Yenileniyor...' : '🔄 Kuru Yenile'}
            </button>
          </div>
        )}

        {/* Input Card */}
        <div className="glass rounded-3xl p-6 md:p-8 mb-8 neon-glow-purple">
          <h2 className="text-2xl font-bold mb-6 text-neon-purple">Gelir Bilgileri</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
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

            {/* Yıl */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Vergi Yılı
              </label>
              <input
                type="text"
                value="2025"
                readOnly
                className="w-full px-4 py-3 bg-slate-800/30 border border-gray-600/30 rounded-xl text-gray-400 cursor-not-allowed"
              />
            </div>
          </div>

          {/* Hesapla Butonu */}
          <button
            onClick={handleCalculate}
            disabled={loading || !exchangeRate}
            className="w-full bg-gradient-to-r from-neon-purple to-neon-pink py-4 rounded-xl font-bold text-lg hover:shadow-[0_0_30px_rgba(176,38,255,0.6)] transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed animate-pulse-glow"
          >
            {loading ? 'Yükleniyor...' : '⚡ Hesapla'}
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
            {/* 3 Ana Kart */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

              {/* 1. Özet Kartı */}
              <div className="glass rounded-3xl p-6 neon-glow-cyan">
                <h3 className="text-xl font-bold mb-4 text-neon-cyan flex items-center gap-2">
                  <span>📊</span> Özet
                </h3>

                <div className="space-y-3">
                  <div className="border-b border-gray-700 pb-2">
                    <p className="text-sm text-gray-400">Aylık Net (EUR)</p>
                    <p className="text-xl font-bold text-white">
                      {formatCurrency(results.monthlyNetEur, 'EUR')}
                    </p>
                  </div>

                  <div className="border-b border-gray-700 pb-2">
                    <p className="text-sm text-gray-400">Aylık Net (TL)</p>
                    <p className="text-xl font-bold text-white">
                      {formatCurrency(results.monthlyNetTry, 'TRY')}
                    </p>
                  </div>

                  <div className="border-b border-gray-700 pb-2">
                    <p className="text-sm text-gray-400">Yıllık Net (EUR)</p>
                    <p className="text-xl font-bold text-neon-cyan">
                      {formatCurrency(results.yearlyNetEur, 'EUR')}
                    </p>
                  </div>

                  <div>
                    <p className="text-sm text-gray-400">Yıllık Net (TL)</p>
                    <p className="text-xl font-bold text-neon-cyan">
                      {formatCurrency(results.yearlyNetTry, 'TRY')}
                    </p>
                  </div>
                </div>
              </div>

              {/* 2. Vergi & Bağkur Detayı Kartı */}
              <div className="glass rounded-3xl p-6 neon-glow-purple">
                <h3 className="text-xl font-bold mb-4 text-neon-purple flex items-center gap-2">
                  <span>💰</span> Vergi & Bağkur Detayı
                </h3>

                <div className="space-y-3">
                  <div className="border-b border-gray-700 pb-2">
                    <p className="text-sm text-gray-400">Yıllık Vergi Matrahı (Fatura - SGK - gider)</p>
                    <p className="text-xl font-bold text-white">
                      {formatCurrency(results.taxBase, 'TRY')}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      Matrah: fatura KDV hariç - Bağkur - (damga + muhasebe)
                    </p>
                  </div>

                  <div className="border-b border-gray-700 pb-2">
                    <p className="text-sm text-gray-400">Gelir Vergisi (TL)</p>
                    <p className="text-xl font-bold text-red-400">
                      {formatCurrency(results.yearlyTax, 'TRY')}
                    </p>
                  </div>

                  <div className="border-b border-gray-700 pb-2">
                    <p className="text-sm text-gray-400">Gelir Vergisi (EUR)</p>
                    <p className="text-xl font-bold text-red-400">
                      {formatCurrency(results.yearlyTaxEur, 'EUR')}
                    </p>
                  </div>
                  <div className="border-b border-gray-700 pb-2">
                    <p className="text-sm text-indigo-300">Beyanname Damga (EUR)</p>
                    <p className="text-xl font-bold text-indigo-300">
                      {formatCurrency(results.yearlyDeclarationStampEur, 'EUR')}
                    </p>
                  </div>

                  <div className="border-b border-gray-700 pb-2">
                    <p className="text-sm text-orange-400">Bağkur Primi (TL)</p>
                    <p className="text-xl font-bold text-orange-400">
                      {formatCurrency(results.yearlyBagkur, 'TRY')}
                    </p>
                    <p className="text-[11px] text-gray-500 mt-1">
                      Oran %37,73 · Aylık tavan {formatCurrency(BAGKUR_CAP_TRY, 'TRY', 2)}
                    </p>
                  </div>

                  <div>
                    <p className="text-sm text-orange-400">Bağkur Primi (EUR)</p>
                    <p className="text-xl font-bold text-orange-400">
                      {formatCurrency(results.yearlyBagkurEur, 'EUR')}
                    </p>
                  </div>
                </div>

                {/* Mini Vergi Oranı Göstergesi */}
                <div className="mt-4 p-3 bg-slate-800/50 rounded-xl">
                  <p className="text-xs text-gray-400 mb-2">Efektif Vergi Oranı:</p>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-2 bg-gray-700 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-yellow-500 to-red-500"
                        style={{ width: `${Math.min((results.yearlyTax / results.taxBase) * 100, 100)}%` }}
                      ></div>
                    </div>
                    <span className="text-sm font-bold text-neon-purple">
                      {formatNumber((results.yearlyTax / results.taxBase) * 100)}%
                    </span>
                  </div>
                </div>

                {/* Bağkur Bilgilendirme */}
                <div className="mt-2 p-3 bg-orange-500/10 border border-orange-500/30 rounded-xl">
                  <p className="text-xs text-orange-300">
                    ℹ️ Bağkur primi %37,73 oranı ve aylık tavan {formatCurrency(BAGKUR_CAP_TRY, 'TRY', 2)} kullanılmıştır.
                  </p>
                </div>
              </div>

              {/* 3. Euro & Muhasebe Kartı */}
              <div className="glass rounded-3xl p-6 neon-glow-pink">
                <h3 className="text-xl font-bold mb-4 text-neon-pink flex items-center gap-2">
                  <span>🧾</span> Euro & Muhasebe
                </h3>

                <div className="space-y-3">
                  <div className="border-b border-gray-700 pb-2">
                    <p className="text-sm text-gray-400">Yıllık Net (EUR)</p>
                    <p className="text-xl font-bold text-white">
                      {formatCurrency(results.yearlyNetEur, 'EUR')}
                    </p>
                  </div>

                  <div className="border-b border-gray-700 pb-2">
                    <p className="text-sm text-green-400">+ Muhasebe Ücreti (Aylık)</p>
                    <p className="text-lg font-semibold text-green-300">
                      +{formatCurrency(MUHASEBE_AYLIK, 'EUR')}
                    </p>
                  </div>

                  <div className="border-b border-gray-700 pb-2">
                    <p className="text-sm text-green-400">+ Muhasebe Ücreti (Yıllık)</p>
                    <p className="text-lg font-semibold text-green-300">
                      +{formatCurrency(MUHASEBE_AYLIK * results.monthCount, 'EUR')}
                    </p>
                  </div>

                  <div className="pt-2">
                    <p className="text-sm text-gray-400 mb-1">TOPLAM (Net + Muhasebe)</p>
                    <p className="text-3xl font-bold text-neon-pink">
                      {formatCurrency(results.totalWithAccounting, 'EUR')}
                    </p>
                  </div>
                </div>

                {/* Muhasebe Bilgi Notu */}
                <div className="mt-4 p-3 bg-green-500/10 border border-green-500/30 rounded-xl">
                  <p className="text-xs text-green-300">
                    ℹ️ Muhasebe ücreti sabit olarak {formatCurrency(MUHASEBE_AYLIK, 'EUR')}/ay kabul edilmiştir.
                  </p>
                </div>
              </div>

            </div>

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
                      <th className="py-3 px-2 text-xs font-semibold text-pink-300">Damga Vergisi ({tableCurrency})</th>
                      <th className="py-3 px-2 text-xs font-semibold text-indigo-300">Beyanname Damga ({tableCurrency})</th>
                      <th className="py-3 px-2 text-xs font-semibold text-green-300">Muhasebe (45 EUR)</th>
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
                        <td className="py-2 px-2 text-cyan-300 text-xs">{row.rate ? formatNumber(row.rate, 4) : '-'}</td>
                        <td className="py-2 px-2 text-xs text-gray-300">
                          <span className="block font-semibold text-white">{`${row.bracket.name} (%${row.bracket.rate})`}</span>
                          <span className="text-[10px] text-gray-500">{row.bracket.range}</span>
                        </td>
                        <td className="py-2 px-2">{displayByTableCurrency(row.netTry, row.netEur)}</td>
                        <td className="py-2 px-2 text-orange-300">{displayByTableCurrency(row.bagkurTry, row.bagkurEur)}</td>
                        <td className="py-2 px-2 text-red-300">{displayByTableCurrency(row.taxTry, row.taxEur)}</td>
                        <td className="py-2 px-2 text-pink-300">{displayByTableCurrency(row.damgaTry, row.damgaEur)}</td>
                        <td className="py-2 px-2 text-indigo-300">{displayByTableCurrency(row.declarationStampTry, row.declarationStampEur)}</td>
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
                      <td className="py-3 px-2 font-bold text-sm text-pink-300">{displayByTableCurrency(results.yearlyDamga, results.yearlyDamgaEur)}</td>
                      <td className="py-3 px-2 font-bold text-sm text-indigo-300">{displayByTableCurrency(results.yearlyDeclarationStampTry, results.yearlyDeclarationStampEur)}</td>
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
                  📄 <strong>Brüt Fatura:</strong> KDV hariç kesilecek tutardır; net + Bağkur + (damga + muhasebe) giderleri + ilgili ay gelir vergisini içerir. KDV %20 ayrıca eklenir.
                </p>
                <p className="text-sm text-blue-300 mt-2">
                  💡 <strong>Kümülatif:</strong> İlgili aya kadar biriken toplam (Net gelir + Bağkur + Muhasebe ücretleri).
                </p>
                <p className="text-xs text-blue-300 mt-1">
                  Örnek: Mart ayı = (Ocak net + Bağkur + Muhasebe) + (Şubat net + Bağkur + Muhasebe) + (Mart net + Bağkur + Muhasebe)
                </p>
                <p className="text-xs text-cyan-300 mt-2">
                  🌍 <strong>Kur:</strong> Geçmiş aylar için o ayın son günü kuru, en son ay için bugünün (güncel) kuru kullanılmıştır.
                </p>
                <p className="text-xs text-orange-300 mt-2">
                  ⚠️ <strong>Önemli:</strong> Gelir vergisi, fatura KDV hariç tutardan Bağkur ve (damga + muhasebe) giderleri düşülerek oluşan kümülatif matrah üzerinden hesaplanır.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Footer Bilgilendirme */}
        <footer className="mt-12 text-center text-sm text-gray-400 space-y-2">
          <p>
            ⚠️ Bu hesaplama, 2025 yılı "Ücret Dışındaki Gelirler İçin Gelir Vergisi Tarifesi" ve Bağkur prim oranına (%37,73, aylık tavan {formatCurrency(BAGKUR_CAP_TRY, 'TRY', 2)}) göre yapılmıştır.
          </p>
          <p>
            Matrah: fatura KDV hariç - Bağkur - (damga + muhasebe) giderleri. Gerçek durumunuz için mutlaka mali müşavirinize danışın.
          </p>
          <p className="text-xs text-gray-500">
            Döviz kuru: exchangerate-api.com | Tasarım: Futuristik Glassmorphism UI
          </p>
        </footer>

      </div>
    </div>
  );
}

export default App;
