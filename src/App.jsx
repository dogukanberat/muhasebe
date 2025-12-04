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

const MONTH_LABELS = {
  tr: ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'],
  en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
};

const MONTH_NAME_MAP = {
  'Ocak': 'January',
  'Şubat': 'February',
  'Mart': 'March',
  'Nisan': 'April',
  'Mayıs': 'May',
  'Haziran': 'June',
  'Temmuz': 'July',
  'Ağustos': 'August',
  'Eylül': 'September',
  'Ekim': 'October',
  'Kasım': 'November',
  'Aralık': 'December',
};

const translations = {
  tr: {
    vatToggleOn: 'KDV dahil et',
    vatToggleOff: 'KDV hariç göster',
    invoiceAmountLabel: 'Fatura Tutarı',
    noteVatDisabled: 'KDV hesaplanmıyor. İsterseniz "KDV dahil et" ile ekleyebilirsiniz.',
    languageLabel: 'Dil',
    languageTR: 'TR',
    languageEN: 'EN',
    title: '2025 Gelir Vergisi & Muhasebe Hesaplayıcı',
    subtitle: 'EUR net → TRY ve Ücret Dışı Gelir Vergisi Tarifesi',
    incomeSectionTitle: 'Gelir Bilgileri',
    incomeSectionInfo: 'Net geliri girin, kuruluş tarihini seçin; Bağkur oranını belirleyin. İlk faaliyet ayı otomatik %37,75, sonrakiler seçtiğiniz oranla hesaplanır.',
    badgeYear: 'Kur yılı: {year}',
    badgeBagkur: 'Bağkur: %{rate}',
    badgeAccounting: 'Muhasebe: {fee}',
    monthlyNetLabel: 'Aylık Net Gelir *',
    monthlyNetPlaceholderEur: 'Örn: 5.000',
    monthlyNetPlaceholderTry: 'Örn: 180.000',
    monthlyNetDesc: 'Vergi, Bağkur ve muhasebe düşülmeden elinize geçen tutar. Para birimini yukarıdan değiştirebilirsiniz.',
    startDateLabel: 'Kuruluş Tarihi (Ay & Yıl)',
    startDateNote: 'İlk faaliyet ayı (aynı yıl içinde) %37,75; sonraki aylar seçtiğiniz Bağkur oranıyla hesaplanır.',
    bagkurRateLabel: 'Bağkur Oranı',
    bagkurInfoTitle: 'Bağkur prim indirimi',
    bagkurInfoBody1: 'Kuruluş yılındaki ilk ay %37,75. Şartları sağlarsanız sonraki aylarda indirimli %32 uygulanabilir.',
    bagkurInfoBody2: 'Şartlar: vadesi geçmiş prim borcu olmaması, primlerin zamanında ödenmesi. Borcu yapılandırıp taksit ve cari primlerini düzenli ödeyenler de %5 indirimden yararlanır. Başvuru gerekmez; uygun olanlar otomatik faydalanır.',
    bagkurInfoFoot: 'Seçtiğiniz oran (ilk ay hariç) tüm hesaplamalara uygulanır.',
    bagkurRateOptionDefault: '%37,75 (standart / ilk ay)',
    bagkurRateOptionDiscount: '%32 (indirimli)',
    bagkurCapLabel: 'Tavan: {cap}',
    bagkurFirstMonthLabel: 'İlk ay: %37,75',
    bagkurSelectedLabel: 'Seçili oran: %{rate}',
    calculateButton: '📊 Hesapla',
    loading: 'Yükleniyor...',
    metaLine: 'Kur yılı: {calcYear} · Başlangıç: {startMonth} {startYear} · Bağkur: %{bagkur}',
    errorInvalidIncome: 'Lütfen geçerli bir aylık net gelir girin.',
    errorRateMissing: 'Döviz kuru yüklenemedi. Lütfen sayfayı yenileyin.',
    errorNoRates: 'Seçilen başlangıç ayı için kur verisi bulunamadı.',
    monthlySummaryTitle: 'Aylık Özet - {month} {year}',
    netIncomeLabel: 'Net Gelir',
    netTooltipTitle: '💰 Net Gelir Detayı',
    netTooltipDesc: 'Vergi, Bağkur ve muhasebe hariç hedeflenen net ödeme.',
    bagkurLabel: 'Bağkur Primi',
    bagkurTooltipTitle: '🛡️ Bağkur Primi Hesabı',
    bagkurTooltipDesc: 'Net tutar × %{rate} (tavan {cap}) üzerinden hesaplanır.',
    accountingLabel: 'Muhasebe',
    incomeTaxLabel: 'Gelir Vergisi',
    incomeTaxTooltipTitle: '📊 Gelir Vergisi Hesaplaması',
    incomeTaxTooltipDesc: 'Kümülatif matrah (fatura KDV hariç tutarın tamamı) üzerinden 2025 Ücret Dışı Gelirler Tarifesi ile hesaplanır.',
    incomeTaxMonthlyBase: 'Aylık matrah',
    incomeTaxPrev: 'Önceki kümülatif',
    incomeTaxNew: 'Yeni kümülatif',
    incomeTaxBracket: 'Dilim / Oran',
    incomeTaxMonthly: 'Aylık vergi',
    incomeTaxFormula: 'Formül: Vergi = Tarifede kümülatif vergi(Yeni kümülatif matrah) - Tarifede kümülatif vergi(Önceki kümülatif matrah).',
    vatExclLabel: 'KDV Hariç Tutar',
    vatExclTooltipTitle: '🧾 KDV Hariç Tutar',
    vatExclTooltipDesc: 'Net + Bağkur + Muhasebe + Gelir Vergisi toplamıdır.',
    vatInclLabel: 'KDV Dahil Tutar',
    vatInclTooltipTitle: '🧮 KDV Dahil',
    vatInclTooltipDesc: 'KDV hariç tutara %{vat} KDV eklenmiş halidir.',
    tableTitle: 'Aylık Detay Breakdown',
    tableCurrencyLabel: 'Tablo para birimi:',
    colMonth: 'Ay',
    colRate: 'Kur',
    colTaxBracket: 'Vergi Dilimi',
    colNet: 'Net ({currency})',
    colBagkur: 'Bağkur Prim ({currency})',
    colIncomeTax: 'Gelir Vergisi ({currency})',
    colAccounting: 'Muhasebe ({fee} EUR)',
    colGrossExcl: 'Brüt Fatura KDV Hariç ({currency})',
    colVat: 'KDV %{vat} ({currency})',
    colTotal: 'Toplam Fatura KDV Dahil ({currency})',
    sourceLabel: 'Kaynak',
    rateLabel: 'Kur',
    rateManualPlaceholder: 'Kur giriniz',
    rateInfoPrefix: 'Dahil toplam:',
    cardBracketRate: 'Oran',
    noteGrossInvoice: '📄 Brüt Fatura: KDV hariç kesilecek tutardır; net + Bağkur + muhasebe giderleri + ilgili ay gelir vergisini içerir. KDV %{vat} ayrıca eklenir.',
    noteCumulative: '💡 Kümülatif: İlgili aya kadar biriken toplam (Net gelir + Bağkur + Muhasebe ücretleri).',
    noteCumulativeExample: 'Örnek: Mart ayı = (Ocak net + Bağkur + Muhasebe) + (Şubat net + Bağkur + Muhasebe) + (Mart net + Bağkur + Muhasebe)',
    noteBagkurDiscount: '🛡️ Bağkur indirimi: Kuruluş yılındaki ilk ay %37,75; sonraki aylarda şartları sağlarsanız %32 uygulanabilir (başvuru gerekmez).',
    noteRateInfo: '🌍 Kur: Her ayın 20\'si kuru kullanılır. Bulunduğumuz ay 20\'sine gelmediyse manuel kur girişi yapabilirsiniz.',
    noteImportant: '⚠️ Önemli: Gelir vergisi, fatura KDV hariç tutarın tamamının kümülatifi üzerinden hesaplanır. Bağkur primi vergi matrahından düşülmez.',
    footerLine1: '⚠️ Bu hesaplama, 2025 yılı "Ücret Dışındaki Gelirler İçin Gelir Vergisi Tarifesi" ve seçtiğiniz Bağkur prim oranına (%{rate}, aylık tavan {cap}) göre yapılmıştır.',
    footerLine2: 'Matrah: fatura KDV hariç tutarın tamamı (Bağkur primi matrahtan düşülmez). Gerçek durumunuz için mutlaka mali müşavirinize danışın.',
    footerLine3: 'Döviz kuru: TCMB (T.C. Merkez Bankası) | Doğukan Elbasan',
    verifyButtonLabel: 'Fatura KDV Hariç',
    verifyTooltip: 'Tutar kopyalanır ve GİB gelir vergisi hesaplama sayfası yeni sekmede açılır. Kopyaladığınız tutarı oraya girerek teyit edebilirsiniz.',
    verifyTooltipExtra: 'GİB hesaplamasında sonucu gördükten sonra “Gelir Vergisi Primi” kalemini oradan alabilirsiniz.',
    verifyTooltipIncomeType: 'GİB sayfasında “Gelir Unsuru” alanını mutlaka ÜCRET DIŞI olarak seçin.',
  },
  en: {
    vatToggleOn: 'Include VAT',
    vatToggleOff: 'Show excl. VAT',
    invoiceAmountLabel: 'Invoice Amount',
    noteVatDisabled: 'VAT is not applied. Click "Include VAT" to add it.',
    languageLabel: 'Language',
    languageTR: 'TR',
    languageEN: 'EN',
    title: '2025 Income Tax & Accounting Calculator',
    subtitle: 'EUR net → TRY and Non-Wage Income Tax Tariff',
    incomeSectionTitle: 'Income Details',
    incomeSectionInfo: 'Enter your net income, pick the incorporation date, and choose the Bagkur rate. First month is fixed at 37.75%, following months use your selection.',
    badgeYear: 'Rate year: {year}',
    badgeBagkur: 'Bagkur: %{rate}',
    badgeAccounting: 'Accounting: {fee}',
    monthlyNetLabel: 'Monthly Net Income *',
    monthlyNetPlaceholderEur: 'e.g. 5,000',
    monthlyNetPlaceholderTry: 'e.g. 180,000',
    monthlyNetDesc: 'Amount you take home before income tax, Bagkur, and accounting. You can change currency above.',
    startDateLabel: 'Incorporation Month & Year',
    startDateNote: 'First activity month (same year) uses 37.75%; following months use the selected Bagkur rate.',
    bagkurRateLabel: 'Bagkur Rate',
    bagkurInfoTitle: 'Bagkur premium discount',
    bagkurInfoBody1: 'First month in the incorporation year is 37.75%. If eligible, 32% discounted rate applies for later months.',
    bagkurInfoBody2: 'Conditions: no overdue premiums and on-time payments. Those who restructured debt and keep current + installments paid can benefit automatically; no application needed.',
    bagkurInfoFoot: 'Selected rate applies to all months except the first month in the first year.',
    bagkurRateOptionDefault: '37.75% (standard / first month)',
    bagkurRateOptionDiscount: '32% (discounted)',
    bagkurCapLabel: 'Cap: {cap}',
    bagkurFirstMonthLabel: 'First month: 37.75%',
    bagkurSelectedLabel: 'Selected rate: %{rate}',
    calculateButton: '📊 Calculate',
    loading: 'Loading...',
    metaLine: 'Rate year: {calcYear} · Start: {startMonth} {startYear} · Bagkur: %{bagkur}',
    errorInvalidIncome: 'Please enter a valid monthly net income.',
    errorRateMissing: 'Exchange rate could not be loaded. Please refresh the page.',
    errorNoRates: 'No rate data found for the selected start month.',
    monthlySummaryTitle: 'Monthly Summary - {month} {year}',
    netIncomeLabel: 'Net Income',
    netTooltipTitle: '💰 Net Income Detail',
    netTooltipDesc: 'Target take-home amount before income tax, Bagkur, and accounting.',
    bagkurLabel: 'Bagkur Premium',
    bagkurTooltipTitle: '🛡️ Bagkur Premium Calculation',
    bagkurTooltipDesc: 'Calculated as Net × %{rate} (cap {cap}).',
    accountingLabel: 'Accounting',
    incomeTaxLabel: 'Income Tax',
    incomeTaxTooltipTitle: '📊 Income Tax Calculation',
    incomeTaxTooltipDesc: 'Calculated on cumulative taxable base (invoice amount excl. VAT) using the 2025 non-wage income tariff.',
    incomeTaxMonthlyBase: 'Monthly base',
    incomeTaxPrev: 'Previous cumulative',
    incomeTaxNew: 'New cumulative',
    incomeTaxBracket: 'Bracket / Rate',
    incomeTaxMonthly: 'Monthly tax',
    incomeTaxFormula: 'Formula: Tax = tariff cumulative(New cumulative base) − tariff cumulative(Previous cumulative base).',
    vatExclLabel: 'Amount excl. VAT',
    vatExclTooltipTitle: '🧾 Amount excl. VAT',
    vatExclTooltipDesc: 'Sum of Net + Bagkur + Accounting + Income Tax.',
    vatInclLabel: 'Amount incl. VAT',
    vatInclTooltipTitle: '🧮 Amount incl. VAT',
    vatInclTooltipDesc: 'Adds {vat} VAT on the amount excl. VAT.',
    tableTitle: 'Monthly Breakdown',
    tableCurrencyLabel: 'Table currency:',
    colMonth: 'Month',
    colRate: 'Rate',
    colTaxBracket: 'Tax Bracket',
    colNet: 'Net ({currency})',
    colBagkur: 'Bagkur ({currency})',
    colIncomeTax: 'Income Tax ({currency})',
    colAccounting: 'Accounting ({fee} EUR)',
    colGrossExcl: 'Invoice excl. VAT ({currency})',
    colVat: 'VAT {vat} ({currency})',
    colTotal: 'Invoice incl. VAT ({currency})',
    sourceLabel: 'Source',
    rateLabel: 'Rate',
    rateManualPlaceholder: 'Enter rate',
    rateInfoPrefix: 'Incl. total:',
    cardBracketRate: 'Rate',
    noteGrossInvoice: '📄 Gross Invoice: amount to bill excluding VAT; includes net + Bagkur + accounting + that month\'s income tax. VAT {vat} is added on top.',
    noteCumulative: '💡 Cumulative: total up to the given month (Net income + Bagkur + Accounting fees).',
    noteCumulativeExample: 'Example: March = (Jan net + Bagkur + Accounting) + (Feb net + Bagkur + Accounting) + (Mar net + Bagkur + Accounting)',
    noteBagkurDiscount: '🛡️ Bagkur discount: first month in the incorporation year 37.75%; later months 32% if eligible (no application needed).',
    noteRateInfo: '🌍 Rate: Uses the 20th day rate for each month. If current month is before the 20th, you can enter the rate manually.',
    noteImportant: '⚠️ Important: Income tax is calculated on the full invoice amount excluding VAT (Bagkur premium is not deducted from the base).',
    footerLine1: '⚠️ This calculation uses the 2025 non-wage income tax tariff and your selected Bagkur rate (%{rate}, monthly cap {cap}).',
    footerLine2: 'Tax base: full invoice amount excluding VAT (Bagkur premium is not deducted). Consult your accountant for your exact situation.',
    footerLine3: 'Exchange rate: CBRT (Central Bank of Türkiye) | Doğukan Elbasan',
    verifyButtonLabel: 'Invoice excl. VAT',
    verifyTooltip: 'Copies the amount and opens the GIB income tax calculator in a new tab. Paste the amount there to cross-check.',
    verifyTooltipExtra: 'After calculating on GIB, you can pull the “Income Tax Premium” value from their result.',
    verifyTooltipIncomeType: 'On the GIB page, set “Gelir Unsuru” (Income Type) to ÜCRET DIŞI (Non-wage).',
  },
};

const LS_KEY_START_MONTH = 'gvh_start_month';
const LS_KEY_START_YEAR = 'gvh_start_year';
const LS_KEY_BAGKUR_RATE = 'gvh_bagkur_rate';
const LS_KEY_NET = 'gvh_monthly_net';
const LS_KEY_CURRENCY = 'gvh_currency';
const LS_KEY_MANUAL_RATE = 'gvh_manual_rate';
const LS_KEY_TABLE_CURRENCY = 'gvh_table_currency';
const LS_KEY_LANG = 'gvh_lang';
const LS_KEY_PREF_VERSION = 'gvh_pref_version';
const LS_KEY_INCLUDE_VAT = 'gvh_include_vat';
const PREF_VERSION = '2';

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
  const [lang, setLang] = useState('en');
  const [monthlyNetEur, setMonthlyNetEur] = useState('');
  const [incomeCurrency, setIncomeCurrency] = useState('EUR'); // EUR | TRY
  const [exchangeRate, setExchangeRate] = useState(null);
  const [rateDate, setRateDate] = useState('');
  const [monthlyRates, setMonthlyRates] = useState([]); // Her ayın kuru
  const [loading, setLoading] = useState(false);
  const [errorKey, setErrorKey] = useState('');
  const [results, setResults] = useState(null);
  const [tableCurrency, setTableCurrency] = useState('EUR');
  const [manualRate, setManualRate] = useState(''); // Manuel kur girişi
  const [startMonthIndex, setStartMonthIndex] = useState(0); // Şirket başlangıç ayı (0=Ocak)
  const [startYear, setStartYear] = useState(new Date().getFullYear()); // Şirket başlangıç yılı
  const [bagkurRate, setBagkurRate] = useState(BAGKUR_DISCOUNT_RATE); // Bağkur oranı (varsayılan %32)
  const [bagkurInfoOpen, setBagkurInfoOpen] = useState(false);
  const [calcYear, setCalcYear] = useState(new Date().getFullYear()); // Kur/vergi yılı
  const autoCalcRequested = React.useRef(false);
  const [prefsLoaded, setPrefsLoaded] = useState(false);
  const [includeVat, setIncludeVat] = useState(false);
  const [verifyOpen, setVerifyOpen] = useState(false);
  const [verifyPos, setVerifyPos] = useState({ top: 0, left: 0 });

  const translate = (key, vars = {}) => {
    const template = translations[lang]?.[key] ?? translations.tr[key] ?? key;
    return template.replace(/\{(\w+)\}/g, (_, v) => (vars?.[v] !== undefined ? vars[v] : `{${v}}`));
  };

  const detectBrowserLang = () => {
    if (typeof navigator === 'undefined' || !navigator.language) return 'en';
    const navLang = navigator.language.toLowerCase();
    if (navLang.startsWith('tr')) return 'tr';
    if (navLang.startsWith('en')) return 'en';
    return 'en';
  };

  // KDV oranı
  const BASE_KDV_RATE = 0.20; // %20
  const VAT_RATE_TEXT = `${(BASE_KDV_RATE * 100).toFixed(0)}%`;
  const GIB_VERIFY_URL = 'https://dijital.gib.gov.tr/hesaplamalar/GelirVergisiHesaplama';

  const getMonthLabel = (idx) => MONTH_LABELS[lang]?.[idx] ?? MONTH_LABELS.tr[idx] ?? '';
  const displayMonthName = (name) => (lang === 'en' ? (MONTH_NAME_MAP[name] || name) : name);
  const displayBracketName = (name) => (lang === 'en' ? name.replace('Dilim', 'Bracket') : name);
  const displayBracketRange = (range) => (lang === 'en' ? range.replaceAll('TL', 'TRY') : range);
  const errorMessage = errorKey ? translate(errorKey) : '';
  const vatMultiplierText = includeVat ? (1 + BASE_KDV_RATE).toFixed(2) : '1.00';

  // Sabit muhasebe ücreti
  const MUHASEBE_AYLIK = 45; // EUR

  const handleVerifyClick = (amountTry) => {
    const plain = Number.isFinite(amountTry)
      ? amountTry.toFixed(2).replace('.', ',') // TR format without thousand separator
      : String(amountTry || '');
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(plain).catch(() => {});
    }
    window.open(GIB_VERIFY_URL, '_blank', 'noopener,noreferrer');
  };

  // Backend API URL
  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

  // Döviz kuru çekme - Sayfa yüklendiğinde
  useEffect(() => {
    // LocalStorage'dan seçimleri yükle
    if (typeof window !== 'undefined') {
      const storedPrefVersion = window.localStorage.getItem(LS_KEY_PREF_VERSION);
      const isPrefMismatch = storedPrefVersion !== PREF_VERSION;
      const storedStart = window.localStorage.getItem(LS_KEY_START_MONTH);
      const storedRate = window.localStorage.getItem(LS_KEY_BAGKUR_RATE);
      const storedYear = window.localStorage.getItem(LS_KEY_START_YEAR);
      const storedNet = window.localStorage.getItem(LS_KEY_NET);
      const storedCurrency = window.localStorage.getItem(LS_KEY_CURRENCY);
      const storedManualRate = window.localStorage.getItem(LS_KEY_MANUAL_RATE);
      const storedTableCurrency = window.localStorage.getItem(LS_KEY_TABLE_CURRENCY);
      const storedLang = window.localStorage.getItem(LS_KEY_LANG);
      const storedIncludeVat = window.localStorage.getItem(LS_KEY_INCLUDE_VAT);
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
      if (storedNet !== null) {
        setMonthlyNetEur(storedNet);
        if (!autoCalcRequested.current) autoCalcRequested.current = true;
      }
      if (storedCurrency === 'EUR' || storedCurrency === 'TRY') {
        setIncomeCurrency(storedCurrency);
      }
      if (storedManualRate !== null) {
        setManualRate(storedManualRate);
      }
      if (!isPrefMismatch && (storedTableCurrency === 'EUR' || storedTableCurrency === 'TRY')) {
        setTableCurrency(storedTableCurrency);
      }
      if (!isPrefMismatch && (storedLang === 'en' || storedLang === 'tr')) {
        setLang(storedLang);
      } else if (!storedLang) {
        const browserLang = detectBrowserLang();
        setLang(browserLang);
      }
      if (!isPrefMismatch && storedIncludeVat !== null) {
        setIncludeVat(storedIncludeVat === '1');
      }
      if (isPrefMismatch) {
        window.localStorage.setItem(LS_KEY_PREF_VERSION, PREF_VERSION);
        const browserLang = detectBrowserLang();
        window.localStorage.setItem(LS_KEY_LANG, browserLang);
        window.localStorage.setItem(LS_KEY_TABLE_CURRENCY, 'EUR');
        window.localStorage.setItem(LS_KEY_INCLUDE_VAT, '0');
        setLang(browserLang);
        setTableCurrency('EUR');
        setIncludeVat(false);
      }
      setPrefsLoaded(true);
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
  }, [startMonthIndex, bagkurRate, includeVat]);

  // Seçimleri localStorage'a yaz
  useEffect(() => {
    if (!prefsLoaded) return;
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(LS_KEY_START_MONTH, String(startMonthIndex));
      window.localStorage.setItem(LS_KEY_START_YEAR, String(startYear));
      window.localStorage.setItem(LS_KEY_BAGKUR_RATE, String(bagkurRate));
      window.localStorage.setItem(LS_KEY_LANG, lang);
      window.localStorage.setItem(LS_KEY_TABLE_CURRENCY, tableCurrency);
      window.localStorage.setItem(LS_KEY_PREF_VERSION, PREF_VERSION);
      window.localStorage.setItem(LS_KEY_INCLUDE_VAT, includeVat ? '1' : '0');
    }
  }, [startMonthIndex, startYear, bagkurRate, lang, tableCurrency, includeVat, prefsLoaded]);

  // Veriler geldiyse ve localStorage'dan net değer yüklendiyse otomatik hesapla
  useEffect(() => {
    const canAutoCalc = prefsLoaded
      && autoCalcRequested.current
      && monthlyRates.length > 0
      && monthlyNetEur
      && (exchangeRate || manualRate);
    if (canAutoCalc) {
      autoCalcRequested.current = false;
      handleCalculate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthlyRates, exchangeRate, manualRate, prefsLoaded]);

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
      setErrorKey('');

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
      setErrorKey('errorInvalidIncome');
      return;
    }

    if (incomeCurrency === 'EUR' && !exchangeRate) {
      setErrorKey('errorRateMissing');
      return;
    }

    setErrorKey('');

    const netInput = parseFloat(monthlyNetEur);
    if (!Number.isFinite(netInput) || netInput <= 0) {
      setErrorKey('errorInvalidIncome');
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
      setErrorKey('errorNoRates');
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

    const appliedKdvRate = includeVat ? BASE_KDV_RATE : 0;

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

      const kdvTry = invoiceNetTry * appliedKdvRate;
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

    // Seçimleri ve girdileri localStorage'a yaz
    if (prefsLoaded && typeof window !== 'undefined') {
      window.localStorage.setItem(LS_KEY_NET, String(monthlyNetEur));
      window.localStorage.setItem(LS_KEY_CURRENCY, incomeCurrency);
      window.localStorage.setItem(LS_KEY_MANUAL_RATE, manualRate);
      window.localStorage.setItem(LS_KEY_START_MONTH, String(startMonthIndex));
      window.localStorage.setItem(LS_KEY_START_YEAR, String(startYear));
      window.localStorage.setItem(LS_KEY_BAGKUR_RATE, String(bagkurRate));
      window.localStorage.setItem(LS_KEY_TABLE_CURRENCY, tableCurrency);
    }
  };

  const displayByTableCurrency = (tryValue, eurValue) => {
    return tableCurrency === 'EUR'
      ? formatCurrency(eurValue, 'EUR')
      : formatCurrency(tryValue, 'TRY');
  };

  const handleManualRateBlur = () => {
    if (results && monthlyNetEur) {
      handleCalculate();
    }
  };

  const renderRateCell = (row, className = '') => {
    const canEditRate = row.isCurrent && new Date().getDate() < 20;
    if (canEditRate) {
      return (
        <input
          type="number"
          value={manualRate || (row.rate ? row.rate : '')}
          onChange={(e) => setManualRate(e.target.value)}
          onBlur={handleManualRateBlur}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.currentTarget.blur();
            }
          }}
          placeholder={translate('rateManualPlaceholder')}
          min="0"
          step="0.0001"
          className={`w-24 px-2 py-1 bg-slate-800/50 border border-neon-cyan/30 rounded text-white text-xs focus:outline-none focus:ring-1 focus:ring-neon-cyan ${className}`}
        />
      );
    }
    return (
      <span className={className}>
        {row.rate ? formatNumber(row.rate, 4) : '-'}
      </span>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 text-white p-3 sm:p-4 md:p-8">
      {/* Ana Container */}
      <div className="max-w-7xl mx-auto">

        {/* Dil seçimi */}
        <div className="flex flex-wrap justify-end gap-2 mb-4">
          <div className="flex items-center gap-2 bg-slate-800/60 border border-slate-700 rounded-full px-3 py-2 text-xs">
            <span className="text-gray-300">{translate('languageLabel')}:</span>
            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => setLang('tr')}
                className={`px-2 py-1 rounded-full border transition-colors ${lang === 'tr'
                  ? 'bg-neon-cyan/20 border-neon-cyan text-neon-cyan'
                  : 'border-gray-700 text-gray-300 hover:border-neon-cyan/60 hover:text-neon-cyan'
                }`}
              >
                {translate('languageTR')}
              </button>
              <button
                type="button"
                onClick={() => setLang('en')}
                className={`px-2 py-1 rounded-full border transition-colors ${lang === 'en'
                  ? 'bg-neon-purple/20 border-neon-purple text-neon-purple'
                  : 'border-gray-700 text-gray-300 hover:border-neon-purple/60 hover:text-neon-purple'
                }`}
              >
                {translate('languageEN')}
              </button>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setIncludeVat((prev) => !prev)}
            className={`text-xs px-3 py-2 rounded-full border transition-colors bg-slate-800/60 border-slate-700 hover:border-neon-cyan/50 hover:text-neon-cyan ${includeVat ? 'text-neon-cyan border-neon-cyan/60' : 'text-gray-300'}`}
          >
            {includeVat ? translate('vatToggleOff') : translate('vatToggleOn')}
          </button>
        </div>

        {/* Header */}
        <header className="text-center mb-8 md:mb-12">
          <h1 className="text-3xl sm:text-4xl md:text-6xl font-bold mb-3 bg-gradient-to-r from-blue-400 via-blue-600 to-blue-800 bg-clip-text text-transparent">
            {translate('title')}
          </h1>
          <p className="text-base sm:text-lg md:text-xl text-gray-300">
            {translate('subtitle')}
          </p>
        </header>

        {/* Input Card */}
        <div className="glass rounded-3xl p-6 md:p-8 mb-8 neon-glow-purple">
          <div className="flex flex-col gap-3 mb-6">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <h2 className="text-2xl font-bold text-neon-purple">{translate('incomeSectionTitle')}</h2>
              <div className="flex flex-wrap gap-2 text-xs text-gray-300">
                <span className="px-3 py-1 rounded-full bg-slate-800/70 border border-neon-purple/30">{translate('badgeYear', { year: calcYear })}</span>
                <span className="px-3 py-1 rounded-full bg-slate-800/70 border border-orange-300/30">{translate('badgeBagkur', { rate: formatNumber(bagkurRate * 100, 2) })}</span>
                <span className="px-3 py-1 rounded-full bg-slate-800/70 border border-cyan-300/30">{translate('badgeAccounting', { fee: formatCurrency(MUHASEBE_AYLIK, 'EUR', 0) })}</span>
              </div>
            </div>
            <p className="text-sm text-gray-300">
              {translate('incomeSectionInfo')}
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-4 md:gap-5">
            {/* Aylık Net Gelir (EUR) */}
            <div className="glass border border-neon-purple/30 rounded-2xl p-4">
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-semibold text-white">
                  {translate('monthlyNetLabel')}
                </label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setIncomeCurrency('EUR')}
                    className={`px-3 py-1 rounded-full border text-xs transition-colors ${incomeCurrency === 'EUR'
                      ? 'bg-neon-cyan/20 border-neon-cyan text-neon-cyan'
                      : 'border-gray-700 text-gray-300 hover:border-neon-cyan/60 hover:text-neon-cyan'
                    }`}
                  >
                    EUR
                  </button>
                  <button
                    type="button"
                    onClick={() => setIncomeCurrency('TRY')}
                    className={`px-3 py-1 rounded-full border text-xs transition-colors ${incomeCurrency === 'TRY'
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
                placeholder={incomeCurrency === 'EUR' ? translate('monthlyNetPlaceholderEur') : translate('monthlyNetPlaceholderTry')}
                min="0"
                step="0.01"
                className="w-full px-4 py-3 bg-slate-800/60 border border-neon-purple/30 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-neon-purple transition-all"
              />
              <p className="text-[11px] text-gray-400 mt-2">
                {translate('monthlyNetDesc')}
              </p>
            </div>

            {/* Şirket başlangıç ayı ve yılı */}
            <div className="glass border border-neon-cyan/30 rounded-2xl p-4">
              <label className="block text-sm font-semibold text-white mb-2">
                {translate('startDateLabel')}
              </label>
              <div className="grid grid-cols-2 gap-3">
                <select
                  value={startMonthIndex}
                  onChange={(e) => setStartMonthIndex(Number(e.target.value))}
                  className="w-full px-3 py-3 bg-slate-800/60 border border-neon-cyan/30 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-neon-cyan transition-all"
                >
                  {MONTH_LABELS[lang].map((month, idx) => (
                    <option key={month} value={idx}>{month}</option>
                  ))}
                </select>
                <input
                  type="number"
                  value={startYear}
                  onChange={(e) => setStartYear(Number(e.target.value))}
                  min="2000"
                  step="1"
                  className="w-full px-3 py-3 bg-slate-800/60 border border-neon-cyan/30 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-neon-cyan transition-all"
                />
              </div>
              <p className="text-[11px] text-gray-400 mt-2">
                {translate('startDateNote')}
              </p>
            </div>

            {/* Bağkur oranı seçimi */}
            <div className="glass border border-orange-300/30 rounded-2xl p-4 md:col-span-2">
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-semibold text-white">
                  {translate('bagkurRateLabel')}
                </label>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setBagkurInfoOpen((prev) => !prev)}
                    className="w-7 h-7 rounded-full bg-slate-800 border border-orange-300/50 text-orange-200 text-xs font-bold flex items-center justify-center hover:border-orange-200 focus:outline-none focus:ring-2 focus:ring-orange-300"
                  >
                    ?
                  </button>
                  {bagkurInfoOpen && (
                    <div className="absolute right-0 mt-2 w-80 bg-slate-900/95 border border-orange-400/30 rounded-lg p-4 shadow-xl text-xs z-50">
                      <div className="font-bold text-orange-200 mb-2">{translate('bagkurInfoTitle')}</div>
                      <p className="text-gray-200 mb-2">
                        {translate('bagkurInfoBody1')}
                      </p>
                      <p className="text-gray-300 leading-relaxed">
                        {translate('bagkurInfoBody2')}
                      </p>
                      <p className="text-[11px] text-orange-200 mt-2">{translate('bagkurInfoFoot')}</p>
                    </div>
                  )}
                </div>
              </div>
              <div className="grid md:grid-cols-3 gap-3">
                <select
                  value={bagkurRate}
                  onChange={(e) => setBagkurRate(Number(e.target.value))}
                  className="w-full px-3 py-3 bg-slate-800/60 border border-orange-300/30 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-orange-300 transition-all"
                >
                  <option value={BAGKUR_DEFAULT_RATE}>{translate('bagkurRateOptionDefault')}</option>
                  <option value={BAGKUR_DISCOUNT_RATE}>{translate('bagkurRateOptionDiscount')}</option>
                </select>
                <div className="md:col-span-2 flex flex-wrap gap-2 text-[11px] text-gray-300">
                  <span className="px-3 py-2 rounded-lg bg-slate-800/60 border border-orange-300/30">{translate('bagkurCapLabel', { cap: formatCurrency(BAGKUR_CAP_TRY, 'TRY', 2) })}</span>
                  <span className="px-3 py-2 rounded-lg bg-slate-800/60 border border-orange-300/30">{translate('bagkurFirstMonthLabel')}</span>
                  <span className="px-3 py-2 rounded-lg bg-slate-800/60 border border-orange-300/30">{translate('bagkurSelectedLabel', { rate: formatNumber(bagkurRate * 100, 2) })}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Hesapla Butonu */}
          <div className="mt-6 flex flex-col gap-3">
            <button
              onClick={handleCalculate}
              disabled={loading || !exchangeRate}
              className="w-full bg-gradient-to-r from-blue-600 to-blue-800 py-4 rounded-xl font-bold text-lg hover:shadow-[0_0_30px_rgba(59,130,246,0.4)] transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed hover:from-blue-700 hover:to-blue-900"
            >
              {loading ? translate('loading') : translate('calculateButton')}
            </button>
              <div className="text-xs text-gray-400">
              {translate('metaLine', {
                calcYear,
                startMonth: getMonthLabel(startMonthIndex),
                startYear,
                bagkur: formatNumber(bagkurRate * 100, 2),
              })}
              </div>
          </div>

          {/* Hata Mesajı */}
          {errorMessage && (
            <div className="mt-4 p-4 bg-red-500/20 border border-red-500/50 rounded-xl text-red-300 text-center">
              {errorMessage}
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
                    <span>📊</span> {translate('monthlySummaryTitle', { month: displayMonthName(monthDataToShow.month), year: calcYear })}
                  </h3>

              <div className="flex flex-wrap items-center justify-center gap-3">
                {/* Net Gelir */}
                <div className="relative group">
                  <div className="glass p-4 rounded-xl text-center min-w-[120px] cursor-help">
                    <p className="text-xs text-gray-400 mb-1">{translate('netIncomeLabel')}</p>
                    <p className="text-base sm:text-lg font-bold text-white">
                      {formatCurrency(monthDataToShow.netEur, 'EUR')}
                    </p>
                  </div>
                  <div className="absolute invisible group-hover:visible bg-slate-800/95 backdrop-blur-sm text-white text-xs rounded-lg p-4 shadow-xl z-50 bottom-full mb-2 left-1/2 -translate-x-1/2 w-72 border border-neon-cyan/30">
                    <div className="font-bold text-neon-cyan mb-2">{translate('netTooltipTitle')}</div>
                    <p className="text-gray-300 text-xs mb-2">{translate('netTooltipDesc')}</p>
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
                        <p className="text-xs text-orange-400 mb-1">{translate('bagkurLabel')}</p>
                        <p className="text-base sm:text-lg font-bold text-orange-400">
                          {formatCurrency(monthDataToShow.bagkurEur, 'EUR')}
                        </p>
                      </div>
                      <div className="absolute invisible group-hover:visible bg-slate-800/95 backdrop-blur-sm text-white text-xs rounded-lg p-4 shadow-xl z-50 bottom-full mb-2 left-1/2 -translate-x-1/2 w-80 border border-orange-400/30">
                        <div className="font-bold text-orange-300 mb-2">{translate('bagkurTooltipTitle')}</div>
                        <p className="text-gray-300 text-xs mb-2">
                        {translate('bagkurTooltipDesc', { rate: bagkurRatePct, cap: formatCurrency(BAGKUR_CAP_TRY, 'TRY', 2) })}
                      </p>
                        <div className="text-[11px] space-y-1">
                          <div className="flex justify-between">
                            <span className="text-gray-400">{lang === 'en' ? 'Base (EUR)' : 'Matrah (EUR)'}</span>
                            <span className="font-semibold text-white">{formatCurrency(bagkurBaseEur, 'EUR')}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-400">{lang === 'en' ? 'Base (TRY)' : 'Matrah (TL)'}</span>
                            <span className="font-semibold text-white">{formatCurrency(bagkurBaseTry, 'TRY')}</span>
                          </div>
                          <div className="flex justify-between">
                        <span className="text-gray-400">{lang === 'en' ? 'Bagkur (EUR)' : 'Bağkur (EUR)'}</span>
                        <span className="font-semibold text-orange-200">{formatCurrency(monthDataToShow.bagkurEur, 'EUR')}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-400">{lang === 'en' ? 'Bagkur (TRY)' : 'Bağkur (TL)'}</span>
                        <span className="font-semibold text-orange-200">{formatCurrency(monthDataToShow.bagkurTry, 'TRY')}</span>
                      </div>
                        </div>
                        <div className="absolute top-full left-1/2 -translate-x-1/2 border-8 border-transparent border-t-slate-800/95"></div>
                      </div>
                    </div>

                    <div className="text-2xl font-bold text-gray-400">+</div>

                    {/* Muhasebe */}
                    <div className="glass p-4 rounded-xl text-center min-w-[120px]">
                      <p className="text-xs text-blue-400 mb-1">{translate('accountingLabel')}</p>
                      <p className="text-base sm:text-lg font-bold text-blue-400">
                        {formatCurrency(monthDataToShow.muhasebeEur, 'EUR')}
                      </p>
                    </div>

                    <div className="text-2xl font-bold text-gray-400">+</div>

                    {/* Gelir Vergisi */}
                    <div className="relative group">
                      <div className="glass p-4 rounded-xl text-center min-w-[120px] cursor-help">
                        <p className="text-xs text-red-400 mb-1">{translate('incomeTaxLabel')}</p>
                        <p className="text-base sm:text-lg font-bold text-red-400">
                          {formatCurrency(monthDataToShow.taxEur || 0, 'EUR')}
                        </p>
                      </div>

                      {/* Tooltip */}
                      <div className="absolute invisible group-hover:visible bg-slate-800/95 backdrop-blur-sm text-white text-xs rounded-lg p-4 shadow-xl z-50 bottom-full mb-2 left-1/2 -translate-x-1/2 w-72 border border-red-400/30">
                        <div className="font-bold text-red-400 mb-2">{translate('incomeTaxTooltipTitle')}</div>
                        <p className="mb-3 text-gray-300">
                          {translate('incomeTaxTooltipDesc')}
                        </p>
                        <div className="text-[11px] space-y-1.5 bg-slate-700/50 p-2 rounded">
                          <div className="flex justify-between">
                            <span className="text-gray-400">{translate('incomeTaxMonthlyBase')}</span>
                            <span className="font-semibold text-white">{formatCurrency(monthlyTaxable, 'TRY')}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-400">{translate('incomeTaxPrev')}</span>
                            <span className="font-semibold text-white">{formatCurrency(prevCumulativeTaxable, 'TRY')}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-400">{translate('incomeTaxNew')}</span>
                            <span className="font-semibold text-white">{formatCurrency(cumulativeTaxable, 'TRY')}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-400">{translate('incomeTaxBracket')}</span>
                            <span className="font-semibold text-white">{`${displayBracketName(monthDataToShow.bracket.name)} (%${monthDataToShow.bracket.rate})`}</span>
                          </div>
                          <div className="flex justify-between font-semibold text-red-200 pt-1 border-t border-red-400/30">
                            <span>{translate('incomeTaxMonthly')}</span>
                            <span>{formatCurrency(monthlyIncomeTaxTry, 'TRY')}</span>
                          </div>
                          <p className="text-[10px] text-gray-400 leading-relaxed">
                            {translate('incomeTaxFormula')}
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
                          {lang === 'en' ? 'Mathematical form:' : 'Matematiksel ifade:'} V<sub>ay</sub> = T(M<sub>prev</sub> + M<sub>ay</sub>) − T(M<sub>prev</sub>)<br />
                          {lang === 'en'
                            ? 'T(m): base tax of the bracket + (m − bracket lower bound) × bracket rate'
                            : 'T(m): ilgili dilimdeki taban vergi + (m − dilim alt sınırı) × dilim oranı'}
                        </div>
                        {/* Arrow */}
                        <div className="absolute top-full left-1/2 -translate-x-1/2 border-8 border-transparent border-t-slate-800/95"></div>
                      </div>
                    </div>

                    <div className="text-2xl font-bold text-neon-cyan">=</div>

                    {/* Fatura Tutarı / KDV Hariç */}
                    <div className="relative group">
                      <div className="glass p-4 rounded-xl text-center min-w-[140px] border-2 border-neon-cyan/30 cursor-help">
                        <p className="text-xs text-green-400 mb-1">
                          {includeVat ? translate('vatExclLabel') : translate('invoiceAmountLabel')}
                        </p>
                        <p className="text-lg font-bold text-neon-cyan">
                          {formatCurrency(monthDataToShow.brutBeforeVATEur || 0, 'EUR')}
                        </p>
                      </div>
                      <div className="absolute invisible group-hover:visible bg-slate-800/95 backdrop-blur-sm text-white text-xs rounded-lg p-4 shadow-xl z-50 bottom-full mb-2 left-1/2 -translate-x-1/2 w-80 border border-neon-cyan/40">
                        <div className="font-bold text-neon-cyan mb-2">{translate('vatExclTooltipTitle')}</div>
                        <p className="text-gray-300 text-xs mb-2">{translate('vatExclTooltipDesc')}</p>
                        <div className="text-[11px] space-y-1">
                          <div className="flex justify-between">
                            <span className="text-gray-400">{translate('netIncomeLabel')}</span>
                            <span className="font-semibold text-white">{formatCurrency(monthDataToShow.netEur, 'EUR')}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-400">{translate('bagkurLabel')}</span>
                            <span className="font-semibold text-white">{formatCurrency(monthDataToShow.bagkurEur, 'EUR')}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-400">{translate('accountingLabel')}</span>
                            <span className="font-semibold text-white">{formatCurrency(monthDataToShow.muhasebeEur, 'EUR')}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-400">{translate('incomeTaxLabel')}</span>
                            <span className="font-semibold text-white">{formatCurrency(monthDataToShow.taxEur || 0, 'EUR')}</span>
                          </div>
                          <div className="flex justify-between font-semibold text-neon-cyan pt-1 border-t border-neon-cyan/30">
                            <span>{lang === 'en' ? 'Total (EUR)' : 'Toplam (EUR)'}</span>
                            <span>{formatCurrency(monthDataToShow.brutBeforeVATEur || 0, 'EUR')}</span>
                          </div>
                          <div className="flex justify-between font-semibold text-neon-cyan">
                            <span>{lang === 'en' ? 'Total (TRY)' : 'Toplam (TL)'}</span>
                            <span>{formatCurrency(monthDataToShow.brutBeforeVATTry || 0, 'TRY')}</span>
                          </div>
                        </div>
                        <div className="absolute top-full left-1/2 -translate-x-1/2 border-8 border-transparent border-t-slate-800/95"></div>
                      </div>
                    </div>

                    {includeVat && (
                      <>
                        <div className="text-lg font-bold text-gray-400">× {vatMultiplierText}</div>

                        <div className="text-2xl font-bold text-green-400">=</div>

                        {/* KDV Dahil Tutar */}
                        <div className="relative group">
                          <div className="glass p-4 rounded-xl text-center min-w-[140px] border-2 border-green-500/30 cursor-help">
                            <p className="text-xs text-green-400 mb-1">{translate('vatInclLabel')}</p>
                            <p className="text-lg font-bold text-green-400">
                              {formatCurrency(monthDataToShow.totalWithVATEur || 0, 'EUR')}
                            </p>
                          </div>
                          <div className="absolute invisible group-hover:visible bg-slate-800/95 backdrop-blur-sm text-white text-xs rounded-lg p-4 shadow-xl z-50 bottom-full mb-2 left-1/2 -translate-x-1/2 w-80 border border-green-500/40">
                            <div className="font-bold text-green-300 mb-2">{translate('vatInclTooltipTitle')}</div>
                            <p className="text-gray-300 text-xs mb-2">{translate('vatInclTooltipDesc', { vat: VAT_RATE_TEXT })}</p>
                            <div className="text-[11px] space-y-1">
                              <div className="flex justify-between">
                                <span className="text-gray-400">{translate('vatExclLabel')}</span>
                                <span className="font-semibold text-white">{formatCurrency(monthDataToShow.brutBeforeVATEur || 0, 'EUR')}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-gray-400">{lang === 'en' ? `VAT (${VAT_RATE_TEXT})` : `KDV (${VAT_RATE_TEXT})`}</span>
                                <span className="font-semibold text-green-200">{formatCurrency(kdvAmountEur, 'EUR')}</span>
                              </div>
                              <div className="flex justify-between font-semibold text-green-300 pt-1 border-t border-green-500/30">
                                <span>{lang === 'en' ? 'Total (EUR)' : 'Toplam (EUR)'}</span>
                                <span>{formatCurrency(monthDataToShow.totalWithVATEur || 0, 'EUR')}</span>
                              </div>
                              <div className="flex justify-between font-semibold text-green-300">
                                <span>{lang === 'en' ? 'Total (TRY)' : 'Toplam (TL)'}</span>
                                <span>{formatCurrency(monthDataToShow.totalWithVATTry || 0, 'TRY')}</span>
                              </div>
                              <div className="flex justify-between text-[10px] text-gray-400 pt-1">
                                <span>{lang === 'en' ? 'VAT (TRY)' : 'KDV (TL)'}</span>
                                <span className="text-green-200 font-semibold">{formatCurrency(kdvAmountTry, 'TRY')}</span>
                              </div>
                            </div>
                            <div className="absolute top-full left-1/2 -translate-x-1/2 border-8 border-transparent border-t-slate-800/95"></div>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              );
            })()}

            {/* Aylık Detay Tablosu */}
            <div className="glass rounded-3xl p-6 md:p-8 neon-glow-cyan relative overflow-visible z-10">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
                <h2 className="text-2xl font-bold text-neon-cyan flex items-center gap-2">
                  <span>📅</span> {translate('tableTitle')}
                </h2>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-gray-400">{translate('tableCurrencyLabel')}</span>
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

              {/* Mobil kartlar */}
              <div className="md:hidden space-y-4">
                {results.monthlyRows?.map((row, index) => (
                  <div
                    key={index}
                    className="glass border border-slate-700 rounded-2xl p-4 space-y-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        <p className="text-sm font-semibold text-neon-cyan">{displayMonthName(row.month)} {calcYear}</p>
                        <p className="text-[11px] text-gray-400 flex items-center gap-2">
                          <span className="text-cyan-300 font-semibold">{translate('rateLabel')}:</span>
                          {renderRateCell(row, 'text-white')}
                        </p>
                        <p className="text-[11px] text-gray-500">{translate('sourceLabel')}: {row.source || '—'}</p>
                      </div>
                      <div className="px-3 py-2 rounded-xl bg-slate-800/70 border border-gray-700 text-[11px] text-right">
                        <div className="font-semibold text-white">{row.bracket.name}</div>
                        <div className="text-gray-400">%{row.bracket.rate}</div>
                        <div className="text-[10px] text-gray-500 leading-snug">{displayBracketRange(row.bracket.range)}</div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                      <div className="p-3 rounded-xl bg-slate-800/60 border border-gray-800">
                        <p className="text-gray-400 text-[11px]">{translate('colNet', { currency: tableCurrency })}</p>
                        <p className="text-sm font-semibold text-white break-words">{displayByTableCurrency(row.netTry, row.netEur)}</p>
                      </div>
                      <div className="p-3 rounded-xl bg-slate-800/60 border border-gray-800">
                        <p className="text-orange-300 text-[11px]">{translate('colBagkur', { currency: tableCurrency })}</p>
                        <p className="text-sm font-semibold text-orange-200 break-words">{displayByTableCurrency(row.bagkurTry, row.bagkurEur)}</p>
                        <p className="text-[10px] text-gray-500">{translate('cardBracketRate')}: %{formatNumber((row.bagkurRateApplied || bagkurRate) * 100, 2)}</p>
                      </div>
                      <div className="p-3 rounded-xl bg-slate-800/60 border border-gray-800">
                        <p className="text-red-300 text-[11px]">{translate('colIncomeTax', { currency: tableCurrency })}</p>
                        <p className="text-sm font-semibold text-red-200 break-words">{displayByTableCurrency(row.taxTry, row.taxEur)}</p>
                        <p className="text-[10px] text-gray-500">{translate('incomeTaxMonthlyBase')}: {formatCurrency(row.taxableTry, 'TRY')}</p>
                      </div>
                      <div className="p-3 rounded-xl bg-slate-800/60 border border-gray-800">
                        <p className="text-green-300 text-[11px]">{translate('colAccounting', { fee: MUHASEBE_AYLIK })}</p>
                        <p className="text-sm font-semibold text-green-200 break-words">{displayByTableCurrency(row.muhasebeTry, row.muhasebeEur)}</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                      <div className="p-3 rounded-xl bg-slate-800/60 border border-gray-800">
                        <p className="text-yellow-300 text-[11px]">{translate('colGrossExcl', { currency: tableCurrency })}</p>
                        <p className="text-sm font-semibold text-yellow-200 break-words">{displayByTableCurrency(row.brutBeforeVATTry, row.brutBeforeVATEur)}</p>
                      </div>
                      {includeVat && (
                        <div className="p-3 rounded-xl bg-slate-800/60 border border-gray-800">
                          <p className="text-blue-300 text-[11px]">{translate('colVat', { currency: tableCurrency, vat: VAT_RATE_TEXT })}</p>
                          <p className="text-sm font-semibold text-blue-200 break-words">{displayByTableCurrency(row.kdvTry, row.kdvEur)}</p>
                          <p className="text-[10px] text-gray-500">{translate('rateInfoPrefix')} {displayByTableCurrency(row.totalWithVATTry, row.totalWithVATEur)}</p>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Masaüstü tablo */}
              <div className="hidden md:block">
                <div className="overflow-x-auto overflow-y-visible">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-gray-700">
                        <th className="py-3 px-2 text-xs font-semibold text-gray-300">{translate('colMonth')}</th>
                        <th className="py-3 px-2 text-xs font-semibold text-cyan-300">{translate('colRate')}</th>
                        <th className="py-3 px-2 text-xs font-semibold text-gray-300">{translate('colTaxBracket')}</th>
                        <th className="py-3 px-2 text-xs font-semibold text-gray-300">{translate('colNet', { currency: tableCurrency })}</th>
                        <th className="py-3 px-2 text-xs font-semibold text-orange-300">{translate('colBagkur', { currency: tableCurrency })}</th>
                        <th className="py-3 px-2 text-xs font-semibold text-red-300">{translate('colIncomeTax', { currency: tableCurrency })}</th>
                        <th className="py-3 px-2 text-xs font-semibold text-green-300">{translate('colAccounting', { fee: MUHASEBE_AYLIK })}</th>
                        <th className="py-3 px-2 text-xs font-semibold text-yellow-300">{translate('colGrossExcl', { currency: tableCurrency })}</th>
                        {includeVat && (
                          <>
                            <th className="py-3 px-2 text-xs font-semibold text-blue-300">{translate('colVat', { currency: tableCurrency, vat: VAT_RATE_TEXT })}</th>
                            <th className="py-3 px-2 text-xs font-semibold text-purple-300">{translate('colTotal', { currency: tableCurrency })}</th>
                          </>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {results.monthlyRows?.map((row, index) => (
                        <tr
                          key={index}
                          className="border-b border-gray-800 hover:bg-slate-800/30 transition-colors"
                        >
                          <td className="py-2 px-2 font-medium text-neon-cyan">{displayMonthName(row.month)}</td>
                          <td className="py-2 px-2 text-cyan-300 text-xs">
                            {renderRateCell(row)}
                          </td>
                          <td className="py-2 px-2 text-xs text-gray-300">
                            <span className="block font-semibold text-white">{`${displayBracketName(row.bracket.name)} (%${row.bracket.rate})`}</span>
                            <span className="text-[10px] text-gray-500">{displayBracketRange(row.bracket.range)}</span>
                          </td>
                          <td className="py-2 px-2">{displayByTableCurrency(row.netTry, row.netEur)}</td>
                          <td className="py-2 px-2 text-orange-300">{displayByTableCurrency(row.bagkurTry, row.bagkurEur)}</td>
                          <td className="py-2 px-2 text-red-300">{displayByTableCurrency(row.taxTry, row.taxEur)}</td>
                          <td className="py-2 px-2 text-green-300">{displayByTableCurrency(row.muhasebeTry, row.muhasebeEur)}</td>
                          <td className="py-2 px-2 font-bold text-yellow-300">{displayByTableCurrency(row.brutBeforeVATTry, row.brutBeforeVATEur)}</td>
                          {includeVat && (
                            <>
                              <td className="py-2 px-2 text-blue-300">{displayByTableCurrency(row.kdvTry, row.kdvEur)}</td>
                              <td className="py-2 px-2 font-bold text-purple-300">{displayByTableCurrency(row.totalWithVATTry, row.totalWithVATEur)}</td>
                            </>
                          )}
                        </tr>
                      ))}
                    </tbody>
                    {/* Toplam satırı */}
                    <tfoot>
                      <tr className="border-t-2 border-neon-cyan group">
                        <td className="py-3 px-2 font-bold text-sm text-neon-cyan">{lang === 'en' ? 'TOTAL' : 'TOPLAM'}</td>
                        <td className="py-3 px-2 font-bold text-sm">-</td>
                        <td className="py-3 px-2 font-bold text-sm text-white">
                          {`${displayBracketName(getTaxBracket(results.taxBase).name)} (%${getTaxBracket(results.taxBase).rate})`}
                        </td>
                        <td className="py-3 px-2 font-bold text-sm">{displayByTableCurrency(results.yearlyNetTry, results.yearlyNetEur)}</td>
                        <td className="py-3 px-2 font-bold text-sm text-orange-300">{displayByTableCurrency(results.yearlyBagkur, results.yearlyBagkurEur)}</td>
                        <td className="py-3 px-2 font-bold text-sm text-red-300 relative">
                          <span className="relative z-10 inline-block px-2 py-1 rounded-md bg-slate-900/80">
                            {displayByTableCurrency(results.yearlyTax, results.yearlyTaxEur)}
                          </span>
                          <span
                            className={`absolute inset-0 rounded-lg pointer-events-none transition-opacity duration-150 ${
                              verifyOpen
                                ? 'opacity-100 bg-red-500/35 shadow-[0_0_0_2px_rgba(239,68,68,0.7),0_0_20px_rgba(239,68,68,0.7)]'
                                : 'opacity-0'
                            }`}
                          ></span>
                          <span
                            className={`absolute inset-0 rounded-lg pointer-events-none ${
                              verifyOpen ? 'animate-ping bg-red-400/30' : 'hidden'
                            }`}
                          ></span>
                        </td>
                        <td className="py-3 px-2 font-bold text-sm text-green-300">{displayByTableCurrency(results.yearlyMuhasebeTry, results.yearlyMuhasebeEur)}</td>
                        <td className="py-3 px-2 font-bold text-sm text-yellow-300">
                          <div
                            className="relative inline-block z-30"
                            onMouseEnter={(e) => {
                              const rect = e.currentTarget.getBoundingClientRect();
                              const tooltipWidth = 256;
                              const padding = 12;
                              const left = Math.max(padding, Math.min(rect.right - tooltipWidth, window.innerWidth - tooltipWidth - padding));
                              const top = rect.bottom + 8;
                              setVerifyPos({ top, left });
                              setVerifyOpen(true);
                            }}
                            onMouseLeave={() => setVerifyOpen(false)}
                          >
                            <button
                              type="button"
                              onClick={() => handleVerifyClick(results.brutInvoiceBeforeVAT)}
                              className="w-full text-left px-3 py-2 rounded-lg bg-slate-800/70 border border-yellow-400/40 hover:border-yellow-300 hover:text-yellow-200 transition-colors"
                            >
                              {translate('verifyButtonLabel')}: {displayByTableCurrency(results.brutInvoiceBeforeVAT, results.brutInvoiceBeforeVATEur)}
                            </button>
                          </div>
                        </td>
                        {includeVat && (
                          <>
                            <td className="py-3 px-2 font-bold text-sm text-blue-300">{displayByTableCurrency(results.yearlyKdv, results.yearlyKdvEur)}</td>
                            <td className="py-3 px-2 font-bold text-sm text-purple-300">{displayByTableCurrency(results.totalInvoiceWithVAT, results.totalInvoiceWithVATEur)}</td>
                          </>
                        )}
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>

              {/* Bilgilendirme notu */}
              <div className="mt-6 p-4 bg-blue-500/10 border border-blue-500/30 rounded-xl">
                <p className="text-sm text-yellow-300">
                  {includeVat
                    ? translate('noteGrossInvoice', { vat: VAT_RATE_TEXT })
                    : translate('noteVatDisabled')}
                </p>
                <p className="text-sm text-blue-300 mt-2">
                  {translate('noteCumulative')}
                </p>
                <p className="text-xs text-blue-300 mt-1">
                  {translate('noteCumulativeExample')}
                </p>
                <p className="text-xs text-orange-200 mt-2">
                  {translate('noteBagkurDiscount')}
                </p>
                <p className="text-xs text-cyan-300 mt-2">
                  {translate('noteRateInfo')}
                </p>
                <p className="text-xs text-orange-300 mt-2">
                  {translate('noteImportant')}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Footer Bilgilendirme */}
        <footer className="mt-12 text-center text-sm text-gray-400 space-y-2">
          <p>
            {translate('footerLine1', { rate: formatNumber(bagkurRate * 100, 2), cap: formatCurrency(BAGKUR_CAP_TRY, 'TRY', 2) })}
          </p>
          <p>
            {translate('footerLine2')}
          </p>
          <p className="text-xs text-gray-500">
            {translate('footerLine3')}
          </p>
        </footer>

      </div>

      {verifyOpen && (
        <div
          className="fixed z-[500] bg-slate-900/95 border border-yellow-400/30 rounded-lg p-3 text-[11px] text-gray-200 shadow-2xl w-64"
          style={{ top: verifyPos.top, left: verifyPos.left }}
        >
          <div className="font-semibold text-yellow-200 mb-1">
            {lang === 'en' ? 'Click copies amount & opens GIB' : 'Tıkla: tutar kopyalanır & GİB açılır'}
          </div>
          <div className="text-gray-200 mb-2">{translate('verifyTooltip')}</div>
          <div className="text-gray-300 mb-1">{translate('verifyTooltipExtra')}</div>
          <div className="text-red-400 font-extrabold">
            {translate('verifyTooltipIncomeType')}
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
