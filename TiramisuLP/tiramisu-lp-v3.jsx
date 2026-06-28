import React, { useState, useEffect } from 'react';
import { Plus, Check, Loader2, ArrowRight, Sparkles, TrendingUp, MessageSquare, BarChart3, Users, Shield, Zap, AlertCircle, Brain, Send } from 'lucide-react';
import { AI_CAPABILITY_DEFINITIONS, TIRAMISU_PRODUCT_KNOWLEDGE } from './src/tiramisu-ai-knowledge.js';
import {
  LP_DATA_FALLBACK,
  DEMO_CONVERSATIONS,
  PREFECTURES,
  CLINIC_SCALE_OPTIONS,
  DESIRED_TIMING_OPTIONS,
  FAQ_ITEMS,
  PAGE_ROUTES,
  LEGAL_PAGES,
} from './src/lp-content.js';

// Google Apps Script Web App URL を設定
// 例: https://script.google.com/macros/s/xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx/exec
const SHEETS_ENDPOINT = (import.meta.env.VITE_SHEETS_ENDPOINT || "").trim();

const AI_CAPABILITY_ICONS = {
  trendingUp: TrendingUp,
  users: Users,
  messageSquare: MessageSquare,
  barChart3: BarChart3,
};

const AI_CAPABILITIES = AI_CAPABILITY_DEFINITIONS.map((capability) => ({
  ...capability,
  icon: AI_CAPABILITY_ICONS[capability.iconKey] || Brain,
}));
const AI_CAPABILITY_BY_ID = Object.fromEntries(
  AI_CAPABILITIES.map((capability) => [capability.id, capability])
);
const EFFICIENCY_SCENARIOS = [
  { id: 'conservative', label: '控えめ', reductionRate: 0.2 },
  { id: 'standard', label: '標準', reductionRate: 0.35 },
  { id: 'aggressive', label: '積極活用', reductionRate: 0.5 },
];
const CALCULATOR_DEFAULTS = {
  dailyReportMinutes: 25,
  analysisMinutes: 35,
  communicationMinutes: 20,
  workingDays: 24,
  averageUnitPrice: 6500,
  patientsPerHour: 1.5,
  scenarioId: 'standard',
};

const FORM_INPUT_CLASS = "w-full h-11 px-4 rounded-[4px] border border-[#E8E4DE] bg-[#FAF8F5] text-[#1A1A1A] text-[14px] focus:bg-white focus:border-[#C4956C] focus:ring-2 focus:ring-[#C4956C]/20 outline-none transition-all placeholder:text-[#595959]/50";
const FORM_SELECT_CLASS = "h-11 rounded-[4px] border border-[#E8E4DE] bg-[#FAF8F5] text-[#1A1A1A] focus:bg-white focus:border-[#C4956C] focus:ring-2 focus:ring-[#C4956C]/20 outline-none transition-all cursor-pointer";
const RADIO_CARD_CLASS = "relative flex items-center p-3 border border-[#E8E4DE] rounded-[4px] bg-[#FAF8F5] cursor-pointer hover:bg-white hover:border-[#C4956C]/50 transition-colors has-[:checked]:bg-white has-[:checked]:border-[#C4956C] has-[:checked]:ring-1 has-[:checked]:ring-[#C4956C]";
const GLOBAL_STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600;9..144,700;9..144,800&family=Inter:wght@400;500;600;700&family=Noto+Sans+JP:wght@400;500;700;800&family=Shippori+Mincho:wght@500;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap');
  
  body {
    font-family: 'Noto Sans JP', sans-serif;
    font-feature-settings: "palt" 1;
    color: #1A1A1A;
    background-color: #FAF8F5;
    line-height: 1.8;
    -webkit-font-smoothing: antialiased;
  }
  .font-inter { font-family: 'Inter', sans-serif; letter-spacing: -0.01em; }
  .font-serif-jp { font-family: 'Shippori Mincho', serif; font-feature-settings: "palt" 1; }
  .font-serif-en { font-family: 'Fraunces', serif; }
  .font-mono { font-family: 'JetBrains Mono', monospace; }
  
  .fade-up-enter {
    opacity: 0;
    transform: translateY(16px);
    animation: fadeUp 0.7s cubic-bezier(0.16, 1, 0.3, 1) forwards;
  }
  @keyframes fadeUp { to { opacity: 1; transform: translateY(0); } }
  .fade-up-delayed-1 { animation-delay: 0.1s; }
  .fade-up-delayed-2 { animation-delay: 0.2s; }
  
  @keyframes subtle-pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.6; }
  }
  .subtle-pulse { animation: subtle-pulse 2.5s ease-in-out infinite; }
  
  @keyframes marquee {
    0% { transform: translateX(0); }
    100% { transform: translateX(-50%); }
  }
  .marquee-track { animation: marquee 40s linear infinite; }
  
  @keyframes typing-dot {
    0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
    30% { transform: translateY(-4px); opacity: 1; }
  }
  .typing-dot { animation: typing-dot 1.4s infinite; }
  .typing-dot-2 { animation-delay: 0.2s; }
  .typing-dot-3 { animation-delay: 0.4s; }
  
  @keyframes ai-shimmer {
    0% { background-position: 0% 50%; }
    100% { background-position: 200% 50%; }
  }
  .ai-shimmer {
    background: linear-gradient(90deg, #C4956C 0%, #E8B87A 25%, #C4956C 50%, #E8B87A 75%, #C4956C 100%);
    background-size: 200% 100%;
    animation: ai-shimmer 3s linear infinite;
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
  }
  
  .washi-texture {
    background-image:
      radial-gradient(circle at 20% 30%, rgba(196, 149, 108, 0.04) 0%, transparent 40%),
      radial-gradient(circle at 80% 70%, rgba(43, 58, 63, 0.03) 0%, transparent 40%);
  }
  
  @media (min-width: 768px) {
    ::-webkit-scrollbar { width: 10px; }
    ::-webkit-scrollbar-track { background: #FAF8F5; }
    ::-webkit-scrollbar-thumb { background: #E8E4DE; border-radius: 5px; }
    ::-webkit-scrollbar-thumb:hover { background: #C4956C; }
  }

  @media (max-width: 767px) {
    button, a, input, select, textarea, label { min-height: 44px; }
    .mobile-h1 { font-size: 30px !important; line-height: 1.35 !important; }
    .mobile-tight { padding-left: 20px !important; padding-right: 20px !important; }
    .mobile-bottom-safe { padding-bottom: calc(88px + env(safe-area-inset-bottom)); }
  }

  @media (max-width: 380px) {
    .mobile-tight { padding-left: 14px !important; padding-right: 14px !important; }
    .mobile-h1 { font-size: 26px !important; }
  }

  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }

  *:focus-visible {
    outline: 2px solid #C4956C;
    outline-offset: 2px;
    border-radius: 2px;
  }
`;

function FieldLabel({ children, required = false, htmlFor }) {
  return (
    <label htmlFor={htmlFor} className="text-[13px] font-bold text-[#1A1A1A] flex items-center gap-2">
      {children}
      <span className={`text-[10px] font-normal font-inter tracking-wider ${required ? 'text-[#C4956C]' : 'text-[#595959]'}`}>
        {required ? '必須' : '任意'}
      </span>
    </label>
  );
}

function RadioOptionGroup({ name, options }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2" role="radiogroup">
      {options.map((option, i) => {
        const id = `${name}-${i}`;
        return (
          <label key={option} htmlFor={id} className={RADIO_CARD_CLASS}>
            <input
              required
              id={id}
              type="radio"
              name={name}
              value={option}
              className="w-4 h-4 accent-[#C4956C]"
            />
            <span className="ml-2 text-[13px] text-[#1A1A1A]">{option}</span>
          </label>
        );
      })}
    </div>
  );
}

function RegistrationSuccessState() {
  return (
    <div className="flex flex-col items-center text-center py-8 fade-up-enter">
      <div className="w-14 h-14 rounded-full bg-[#3F7D5C]/10 flex items-center justify-center mb-5">
        <Check size={28} className="text-[#3F7D5C]" />
      </div>
      <h3 className="font-serif-jp text-[22px] font-bold text-[#1A1A1A] mb-3">ありがとうございます。</h3>
      <p className="text-[15px] text-[#595959] mb-8 leading-[1.9]">
        先行登録を受け付けました。<br />
        3営業日以内に、代表から直接メールでご連絡いたします。
      </p>
      <div className="w-full flex flex-col gap-3">
        <a href="mailto:founder@tiramisu.clinic" className="w-full py-3.5 bg-[#2B3A3F] text-white rounded-[4px] font-bold text-[14px] transition-colors hover:bg-[#1f292d] flex justify-center items-center gap-2">
          代表に直接話を聞く（30分・無料）
        </a>
      </div>
    </div>
  );
}

function EfficiencySlider({ label, value, min, max, step = 1, suffix, onChange }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-4">
        <label className="text-[13px] font-bold text-[#1A1A1A]">{label}</label>
        <span className="font-inter text-[15px] font-bold text-[#2B3A3F] whitespace-nowrap">
          {value}{suffix}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-[#C4956C]"
      />
      <div className="flex justify-between text-[11px] text-[#595959]">
        <span>{min}{suffix}</span>
        <span>{max}{suffix}</span>
      </div>
    </div>
  );
}

function RegistrationFormFields({ formState, formError, handleFormSubmit }) {
  if (formState === 'success') {
    return <RegistrationSuccessState />;
  }

  const hasError = Boolean(formError);
  const errorId = 'registration-form-error';

  return (
    <form
      onSubmit={handleFormSubmit}
      className="flex flex-col gap-6"
      noValidate={false}
      aria-describedby={hasError ? errorId : undefined}
    >
      <input type="hidden" name="source" value="lp-pre-registration" />

      <div className="flex flex-col gap-1.5">
        <FieldLabel required htmlFor="field-clinicName">院名・法人名</FieldLabel>
        <input
          required
          type="text"
          id="field-clinicName"
          name="clinicName"
          placeholder="例：〇〇整骨院"
          autoComplete="organization"
          aria-invalid={hasError || undefined}
          className={FORM_INPUT_CLASS}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <FieldLabel required htmlFor="field-prefecture">所在地</FieldLabel>
        <div className="flex flex-col sm:flex-row gap-2">
          <select
            required
            id="field-prefecture"
            name="prefecture"
            aria-label="都道府県"
            aria-invalid={hasError || undefined}
            className={`w-full sm:w-1/3 px-3 text-[13px] ${FORM_SELECT_CLASS}`}
          >
            <option value="">都道府県</option>
            {PREFECTURES.map((prefecture) => (
              <option key={prefecture} value={prefecture}>{prefecture}</option>
            ))}
          </select>
          <input
            required
            type="text"
            name="addressLine"
            placeholder="市区町村以降"
            aria-label="市区町村以降の住所"
            autoComplete="address-line1"
            aria-invalid={hasError || undefined}
            className={`w-full sm:w-2/3 ${FORM_INPUT_CLASS}`}
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <FieldLabel required htmlFor="field-contactName">代表者名 / 担当者名</FieldLabel>
        <input
          required
          type="text"
          id="field-contactName"
          name="contactName"
          placeholder="例：山田 太郎"
          autoComplete="name"
          aria-invalid={hasError || undefined}
          className={FORM_INPUT_CLASS}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-3">
        <div className="flex flex-col gap-1.5">
          <FieldLabel required htmlFor="field-email">メール</FieldLabel>
          <input
            required
            type="email"
            id="field-email"
            name="email"
            placeholder="example@clinic.com"
            autoComplete="email"
            inputMode="email"
            aria-invalid={hasError || undefined}
            className={`${FORM_INPUT_CLASS} font-inter`}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <FieldLabel required htmlFor="field-phone">電話番号</FieldLabel>
          <input
            required
            type="tel"
            id="field-phone"
            name="phone"
            placeholder="03-1234-5678"
            autoComplete="tel"
            inputMode="tel"
            aria-invalid={hasError || undefined}
            className={`${FORM_INPUT_CLASS} font-inter`}
          />
        </div>
      </div>

      <fieldset className="flex flex-col gap-2 border-0 p-0 m-0">
        <legend className="text-[13px] font-bold text-[#1A1A1A] flex items-center gap-2 mb-1">
          院の規模
          <span className="text-[10px] font-normal font-inter tracking-wider text-[#C4956C]">必須</span>
        </legend>
        <RadioOptionGroup name="clinicScale" options={CLINIC_SCALE_OPTIONS} />
      </fieldset>

      <fieldset className="flex flex-col gap-2 border-0 p-0 m-0">
        <legend className="text-[13px] font-bold text-[#1A1A1A] flex items-center gap-2 mb-1">
          導入希望時期
          <span className="text-[10px] font-normal font-inter tracking-wider text-[#C4956C]">必須</span>
        </legend>
        <RadioOptionGroup name="desiredTiming" options={DESIRED_TIMING_OPTIONS} />
      </fieldset>

      <div className="flex flex-col gap-1.5">
        <FieldLabel htmlFor="field-aiQuestion">今一番AIに聞きたいこと</FieldLabel>
        <textarea
          id="field-aiQuestion"
          name="aiQuestion"
          rows="3"
          placeholder="例：「うちの院、リピート率どう改善できる？」「スタッフのパフォーマンスを比較したい」など"
          className="w-full p-4 rounded-[4px] border border-[#E8E4DE] bg-[#FAF8F5] text-[#1A1A1A] text-[14px] focus:bg-white focus:border-[#C4956C] focus:ring-2 focus:ring-[#C4956C]/20 outline-none transition-all placeholder:text-[#595959]/60 resize-none"
        />
      </div>

      <div
        id={errorId}
        role="alert"
        aria-live="assertive"
        className={hasError ? 'rounded-[4px] border border-red-300 bg-red-50 px-4 py-3 text-[13px] leading-[1.8] text-red-700' : 'sr-only'}
      >
        {formError}
      </div>

      <div className="mt-2">
        <button
          disabled={formState === 'loading'}
          type="submit"
          aria-busy={formState === 'loading'}
          className="w-full h-12 bg-[#2B3A3F] hover:bg-[#1f292d] text-white text-[15px] font-bold rounded-[4px] transition-all shadow-[0_2px_8px_rgba(43,58,63,0.2)] hover:shadow-[0_4px_16px_rgba(43,58,63,0.3)] flex items-center justify-center disabled:opacity-70 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#C4956C]"
        >
          {formState === 'loading' ? (
            <>
              <Loader2 className="animate-spin mr-2" size={18} aria-hidden="true" />
              <span>送信中…</span>
            </>
          ) : (
            "先行登録を完了する"
          )}
        </button>
      </div>
    </form>
  );
}


export default function App() {
  const [lpData, setLpData] = useState(LP_DATA_FALLBACK);
  const [showStickyCTA, setShowStickyCTA] = useState(false);
  const [formState, setFormState] = useState('idle');
  const [formError, setFormError] = useState('');
  const [openFAQ, setOpenFAQ] = useState(null);
  const [activeDemoIdx, setActiveDemoIdx] = useState(0);
  const [currentPage, setCurrentPage] = useState('home');
  const [activeCapabilityId, setActiveCapabilityId] = useState(AI_CAPABILITIES[0].id);
  const [calculatorInputs, setCalculatorInputs] = useState(CALCULATOR_DEFAULTS);

  const [aiInput, setAiInput] = useState('');
  const [aiResponse, setAiResponse] = useState('');
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [aiError, setAiError] = useState('');

  const discountRemaining = Math.max(0, 200 - lpData.registeredCount);

  const mergeLpSummary = (summary) => {
    if (!summary || typeof summary.registeredCount !== 'number') {
      return;
    }

    setLpData((prev) => ({
      ...prev,
      ...summary,
      clinicSize: {
        ...prev.clinicSize,
        ...(summary.clinicSize || {}),
      },
    }));
  };

  const resolvePageFromHash = (hash) => {
    switch (hash) {
      case PAGE_ROUTES.preRegister:
        return 'preRegister';
      case PAGE_ROUTES.aiChat:
        return 'aiChat';
      case PAGE_ROUTES.developerContact:
        return 'developerContact';
      case PAGE_ROUTES.privacy:
        return 'privacy';
      case PAGE_ROUTES.terms:
        return 'terms';
      case PAGE_ROUTES.commerce:
        return 'commerce';
      default:
        return 'home';
    }
  };

  useEffect(() => {
    if (!SHEETS_ENDPOINT) return;
    fetch(SHEETS_ENDPOINT)
      .then(r => r.json())
      .then(data => {
        if (data?.ok === false) {
          return;
        }
        mergeLpSummary(data);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (currentPage !== 'home') {
      setShowStickyCTA(false);
      return;
    }

    let ticking = false;
    const handleScroll = () => {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(() => {
        setShowStickyCTA(window.scrollY > 400);
        ticking = false;
      });
    };

    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [currentPage]);

  useEffect(() => {
    const syncPage = () => setCurrentPage(resolvePageFromHash(window.location.hash));
    syncPage();
    window.addEventListener('hashchange', syncPage);
    return () => window.removeEventListener('hashchange', syncPage);
  }, []);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, [currentPage]);

  // Hero demo auto-rotate
  useEffect(() => {
    if (currentPage !== 'home') return;
    const interval = setInterval(() => {
      setActiveDemoIdx(prev => (prev + 1) % DEMO_CONVERSATIONS.length);
    }, 6000);
    return () => clearInterval(interval);
  }, [currentPage]);

  const handleAiSubmit = async () => {
    if (!aiInput.trim()) return;
    setIsAiLoading(true);
    setAiError('');
    setAiResponse('');

    const retries = [1000, 2000, 4000];
    for (let i = 0; i < retries.length; i++) {
      try {
        const response = await fetch('/api/gemini', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: aiInput }),
        });

        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(data?.error || 'API request failed');
        }
        const text = data?.text;
        if (text) { setAiResponse(text); break; }
      } catch (error) {
        if (i === retries.length - 1) {
          if (error instanceof Error) {
            if (error.message === 'Gemini API key is not configured') {
              setAiError('サーバー側の Gemini API キーが未設定です。.env.local に GEMINI_API_KEY を設定してください。');
            } else if (error.message === 'Failed to fetch') {
              setAiError('ローカル API に接続できません。`npm run dev` を再起動してからもう一度お試しください。');
            } else {
              setAiError(`AI応答の取得に失敗しました: ${error.message}`);
            }
          } else {
            setAiError('サーバーとの通信に失敗しました。時間をおいて再度お試しください。');
          }
        }
        await new Promise(resolve => setTimeout(resolve, retries[i]));
      }
    }
    setIsAiLoading(false);
  };

  const handleFormSubmit = async (e) => {
    e.preventDefault();
    setFormError('');
    setFormState('loading');
    const formElement = e.target;
    const formData = new FormData(formElement);
    if (SHEETS_ENDPOINT) {
      try {
        const response = await fetch(SHEETS_ENDPOINT, { method: 'POST', body: formData });
        const data = await response.json().catch(() => ({}));

        if (!response.ok || data?.ok === false) {
          throw new Error(data?.error || 'フォーム送信に失敗しました。');
        }

        if (data?.summary) {
          mergeLpSummary(data.summary);
        }

        setFormState('success');
        formElement.reset();
        document.getElementById('registration-form').scrollIntoView({ behavior: 'smooth', block: 'center' });
      } catch (error) {
        setFormState('idle');
        setFormError(error instanceof Error ? error.message : '送信に失敗しました。時間をおいて再度お試しください。');
      }
    } else {
      setTimeout(() => {
        setFormState('success');
        document.getElementById('registration-form').scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 1200);
    }
  };

  const scrollToForm = () => {
    document.getElementById('registration-form').scrollIntoView({ behavior: 'smooth' });
  };

  const scrollToAiConsult = () => {
    document.getElementById('ai-consult')?.scrollIntoView({ behavior: 'smooth' });
  };

  const navigateToPage = (page) => {
    if (page === 'home') {
      window.location.hash = '';
      setCurrentPage('home');
      return;
    }
    const route = PAGE_ROUTES[page];
    if (route) {
      window.location.hash = route;
    }
  };

  const handleHomeAnchor = (targetId) => {
    if (currentPage !== 'home') {
      window.location.hash = '';
      setTimeout(() => {
        document.getElementById(targetId)?.scrollIntoView({ behavior: 'smooth' });
      }, 30);
      return;
    }
    document.getElementById(targetId)?.scrollIntoView({ behavior: 'smooth' });
  };

  const currentDemo = DEMO_CONVERSATIONS[activeDemoIdx];
  const activeCapability = AI_CAPABILITY_BY_ID[activeCapabilityId] || AI_CAPABILITIES[0];
  const legalPage = currentPage === 'privacy' || currentPage === 'terms' || currentPage === 'commerce'
    ? LEGAL_PAGES[currentPage]
    : null;
  const monthlyIncrease = typeof lpData.monthlyIncrease === 'number' ? lpData.monthlyIncrease : LP_DATA_FALLBACK.monthlyIncrease;
  const activeScenario = EFFICIENCY_SCENARIOS.find((scenario) => scenario.id === calculatorInputs.scenarioId) || EFFICIENCY_SCENARIOS[1];
  const currentBackofficeHours = ((calculatorInputs.dailyReportMinutes + calculatorInputs.analysisMinutes + calculatorInputs.communicationMinutes) * calculatorInputs.workingDays) / 60;
  const monthlySavedHours = currentBackofficeHours * activeScenario.reductionRate;
  const yearlySavedHours = monthlySavedHours * 12;
  const revenuePotential = monthlySavedHours * calculatorInputs.patientsPerHour * calculatorInputs.averageUnitPrice;

  const updateCalculatorInput = (key, value) => {
    setCalculatorInputs((prev) => ({ ...prev, [key]: value }));
  };

  const renderPageShell = (eyebrow, title, lead, children, ctaLabel, ctaAction) => (
    <div className="min-h-screen bg-[#FAF8F5] text-[#1A1A1A]">
      <style>{GLOBAL_STYLES}</style>
      <header className="border-b border-[#E8E4DE] bg-[#FAF8F5]/95 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-[1120px] mx-auto px-6 mobile-tight py-4 flex items-center justify-between gap-4">
          <button
            onClick={() => navigateToPage('home')}
            className="font-serif-en text-[28px] font-bold tracking-tight leading-none"
          >
            Tiramisu
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigateToPage('home')}
              className="hidden md:inline-flex px-4 py-2 text-[13px] font-bold text-[#2B3A3F] border border-[#2B3A3F]/20 rounded-[6px]"
            >
              LPへ戻る
            </button>
            {ctaLabel && ctaAction && (
              <button
                onClick={ctaAction}
                className="px-4 py-2 bg-[#2B3A3F] text-white text-[13px] font-bold rounded-[6px] inline-flex items-center gap-2"
              >
                {ctaLabel} <ArrowRight size={14} />
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-[1120px] mx-auto px-6 mobile-tight pt-14 pb-20 md:pt-20">
        <div className="max-w-[800px]">
          <p className="font-inter text-[11px] tracking-[0.18em] uppercase text-[#C4956C] font-bold">{eyebrow}</p>
          <h1 className="font-serif-jp text-[34px] md:text-[48px] font-bold leading-[1.3] mt-4">{title}</h1>
          <p className="text-[15px] md:text-[17px] text-[#595959] leading-[1.95] mt-5">{lead}</p>
        </div>
        <div className="mt-12">
          {children}
        </div>
      </main>
    </div>
  );

  if (currentPage === 'preRegister') {
    return renderPageShell(
      'Pre Register',
      '先行登録',
      '正式ローンチ前に登録していただくと、クローズドβの優先案内と、先着200院限定の永久30%オフが適用されます。',
      <div className="grid grid-cols-1 lg:grid-cols-[1.1fr_0.9fr] gap-8 items-start">
        <div className="bg-white border border-[#E8E4DE] rounded-[12px] p-6 md:p-8 shadow-[0_20px_50px_-30px_rgba(0,0,0,0.15)]">
          <h2 className="font-serif-jp text-[24px] font-bold">登録前にわかること</h2>
          <div className="mt-6 space-y-4 text-[14px] leading-[1.9] text-[#595959]">
            <p><span className="font-bold text-[#1A1A1A]">対象:</span> 整骨院・接骨院・鍼灸院の院長、事務長、運営責任者</p>
            <p><span className="font-bold text-[#1A1A1A]">登録特典:</span> 単院プラン月額 8,400円、初期設定とデータ移行サポート、β版優先案内</p>
            <p><span className="font-bold text-[#1A1A1A]">案内方法:</span> 登録順にメールでご連絡し、導入時期と必要データを確認します</p>
          </div>
          <div className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[
              { label: '現在の登録院数', value: `${lpData.registeredCount}院` },
              { label: '残り優待枠', value: `${discountRemaining}院` },
              { label: '正式ローンチ予定', value: lpData.launchMonth },
            ].map((item) => (
              <div key={item.label} className="rounded-[8px] border border-[#E8E4DE] bg-[#FAF8F5] px-4 py-4">
                <p className="text-[11px] text-[#595959]">{item.label}</p>
                <p className="mt-1 font-inter text-[20px] font-bold text-[#1A1A1A]">{item.value}</p>
              </div>
            ))}
          </div>
        </div>
        <div id="registration-form">
          <div className="bg-white border border-[#E8E4DE] rounded-[12px] p-6 md:p-8 shadow-[0_20px_50px_-30px_rgba(0,0,0,0.15)]">
            <h2 className="font-serif-jp text-[24px] font-bold">2分で先行登録</h2>
            <p className="text-[13px] text-[#595959] mt-2">送信内容は先行登録案内のみに利用します。</p>
            <div className="mt-6">
              <RegistrationFormFields formState={formState} handleFormSubmit={handleFormSubmit} />
            </div>
          </div>
        </div>
      </div>,
      'AIチャットを見る',
      () => navigateToPage('aiChat')
    );
  }

  if (currentPage === 'aiChat') {
    return renderPageShell(
      'AI Demo',
      'AIチャットを試す',
      'このデモでは、院長が自然文で質問し、売上・予約・シフト・患者データを横断した回答が返る体験を見せます。LP上の簡易デモとして、その場で質問も送れます。',
      <div className="grid grid-cols-1 lg:grid-cols-[0.9fr_1.1fr] gap-8 items-start">
        <div className="bg-white border border-[#E8E4DE] rounded-[12px] p-6 md:p-8">
          <h2 className="font-serif-jp text-[24px] font-bold">質問例</h2>
          <div className="mt-6 flex flex-col gap-3">
            {DEMO_CONVERSATIONS.map((demo) => (
              <button
                key={demo.user}
                onClick={() => setAiInput(demo.user)}
                className="text-left rounded-[8px] border border-[#E8E4DE] bg-[#FAF8F5] px-4 py-3 hover:border-[#C4956C] transition-colors"
              >
                <p className="text-[13px] font-bold text-[#1A1A1A]">{demo.user}</p>
                <p className="text-[12px] text-[#595959] mt-1">クリックで入力欄に反映</p>
              </button>
            ))}
          </div>
        </div>
        <section id="ai-demo" className="bg-white border border-[#E8E4DE] rounded-[12px] p-6 md:p-8 shadow-[0_20px_50px_-30px_rgba(0,0,0,0.15)]">
          <div className="flex items-center gap-3 pb-4 border-b border-[#E8E4DE]">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#C4956C] to-[#2B3A3F] flex items-center justify-center">
              <Brain size={18} className="text-white" />
            </div>
            <div>
              <p className="font-bold text-[14px]">Tiramisu AI Demo</p>
              <p className="text-[12px] text-[#595959]">架空データを使ったLPデモ</p>
            </div>
          </div>
          <div className="mt-6">
            <label className="block text-[13px] font-bold mb-2">質問を入力</label>
            <div className="flex gap-2">
              <input
                value={aiInput}
                onChange={(e) => setAiInput(e.target.value)}
                placeholder="例: 今月の売上が落ちた原因は？"
                className="flex-1 rounded-[6px] border border-[#D8D2CA] bg-[#FAF8F5] px-4 py-3 text-[14px] outline-none focus:border-[#C4956C]"
              />
              <button
                onClick={handleAiSubmit}
                disabled={isAiLoading}
                className="px-5 py-3 bg-[#2B3A3F] text-white rounded-[6px] font-bold inline-flex items-center gap-2 disabled:opacity-70"
              >
                {isAiLoading ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                送信
              </button>
            </div>
            {aiError && <p className="mt-3 text-[13px] text-red-600">{aiError}</p>}
            {aiResponse && (
              <div className="mt-5 rounded-[10px] border border-[#E8E4DE] bg-[#FAF8F5] p-4">
                <p className="text-[13px] text-[#595959] mb-2">AIの回答</p>
                <p className="text-[14px] leading-[1.9] text-[#1A1A1A] whitespace-pre-wrap">{aiResponse}</p>
              </div>
            )}
          </div>
        </section>
      </div>,
      '先行登録する',
      () => navigateToPage('preRegister')
    );
  }

  if (currentPage === 'developerContact') {
    return renderPageShell(
      'Contact',
      '開発者に相談',
      '運用フロー、既存システムとの共存、β版参加条件、データ移行の進め方など、導入前の論点を直接相談できます。',
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_0.9fr] gap-8">
        <div className="bg-white border border-[#E8E4DE] rounded-[12px] p-6 md:p-8">
          <h2 className="font-serif-jp text-[24px] font-bold">相談できる内容</h2>
          <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[
              '現在の予約・売上管理の運用整理',
              'AIチャットで見たいKPIの整理',
              'スタッフ権限や多店舗運用の設計',
              'β版参加条件と導入スケジュール',
            ].map((item) => (
              <div key={item} className="rounded-[8px] border border-[#E8E4DE] bg-[#FAF8F5] px-4 py-4 text-[14px] leading-[1.8]">
                {item}
              </div>
            ))}
          </div>
        </div>
        <div className="bg-[#2B3A3F] text-white rounded-[12px] p-6 md:p-8">
          <p className="font-inter text-[11px] tracking-[0.18em] uppercase text-white/50 font-bold">Direct Contact</p>
          <h2 className="font-serif-jp text-[28px] font-bold mt-4">founder@tiramisu.clinic</h2>
          <p className="text-[14px] text-white/75 leading-[1.9] mt-4">
            件名に「Tiramisu相談」と入れていただければ確認が早いです。院名、現在の運用、相談したい論点を3行程度で送ってください。
          </p>
          <a
            href="mailto:founder@tiramisu.clinic?subject=Tiramisu%E7%9B%B8%E8%AB%87"
            className="mt-6 inline-flex items-center gap-2 px-5 py-3 bg-white text-[#2B3A3F] text-[14px] font-bold rounded-[6px]"
          >
            メールを作成する <ArrowRight size={14} />
          </a>
        </div>
      </div>,
      '先行登録へ',
      () => navigateToPage('preRegister')
    );
  }

  if (legalPage) {
    return renderPageShell(
      'Legal',
      legalPage.title,
      legalPage.lead,
      <div className="max-w-[860px] bg-white border border-[#E8E4DE] rounded-[12px] p-6 md:p-8 shadow-[0_20px_50px_-30px_rgba(0,0,0,0.15)]">
        <div className="space-y-8">
          {legalPage.sections.map((section) => (
            <section key={section.heading}>
              <h2 className="font-serif-jp text-[22px] font-bold">{section.heading}</h2>
              <div className="mt-4 space-y-3">
                {section.body.map((line) => (
                  <p key={line} className="text-[14px] leading-[1.95] text-[#4F4F4F]">{line}</p>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>,
      '開発者に相談',
      () => navigateToPage('developerContact')
    );
  }

  return (
    <div className="relative overflow-hidden selection:bg-[#C4956C]/20 washi-texture">
      <style>{GLOBAL_STYLES}</style>

      {/* ================= HERO ================= */}
      <section className="relative w-full max-w-[1120px] mx-auto px-6 mobile-tight pt-14 pb-16 md:pt-20 md:pb-24 flex flex-col md:flex-row items-center gap-10 md:gap-16">
        
        <div className="w-full md:w-[55%] flex flex-col gap-6 relative z-10 fade-up-enter">
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-2 text-[12px] text-[#595959] tracking-[0.12em] font-medium uppercase font-inter">
              <span className="w-8 h-px bg-[#C4956C]"></span>
              AI Business Partner for Seikotsu Clinics
            </span>
          </div>
          
          <h1 className="font-serif-jp text-[36px] md:text-[54px] font-bold text-[#1A1A1A] leading-[1.22] tracking-[-0.02em] mobile-h1">
            <span className="block">院長の右腕は、</span>
            <span className="block">もうエクセルじゃない。</span>
            <span className="block mt-3 text-[22px] md:text-[28px] text-[#595959] font-medium tracking-normal">
              売上もシフトも、<span className="ai-shimmer font-bold">AIに話しかけるだけ</span>。
            </span>
          </h1>
          
          <p className="text-[15px] md:text-[16px] text-[#1A1A1A] leading-[1.95] mt-2 max-w-[520px]">
            予約管理、売上集計、スタッフ管理、患者データ——
            <span className="block mt-1">全部入って、<span className="font-bold">月額¥12,000</span>（単院）。</span>
            <span className="block mt-2 text-[14px] text-[#595959]">AIチャットが経営KPIを分析し、打ち手まで提案してくれます。</span>
            <span className="block mt-3 text-[13px] text-[#595959]">
              現在、<span className="font-inter font-bold text-[#1A1A1A] text-[16px]">{lpData.registeredCount}</span>院が先行登録中。
            </span>
          </p>

          <div className="flex flex-col sm:flex-row gap-3 mt-4">
            <button 
              onClick={scrollToForm}
              className="w-full sm:w-auto px-8 py-4 bg-[#2B3A3F] hover:bg-[#1f292d] text-white text-[15px] font-bold rounded-[6px] transition-all duration-200 shadow-[0_2px_10px_rgba(43,58,63,0.2)] hover:shadow-[0_4px_20px_rgba(43,58,63,0.3)] hover:-translate-y-[1px] flex items-center justify-center gap-2"
            >
              先行登録する<span className="text-[12px] font-normal opacity-80">（2分）</span>
            </button>
            <button
              onClick={scrollToAiConsult}
              className="w-full sm:w-auto px-8 py-4 bg-transparent border border-[#2B3A3F]/30 text-[#2B3A3F] hover:bg-[#2B3A3F]/5 hover:border-[#2B3A3F] text-[15px] font-bold rounded-[6px] transition-colors duration-200 flex items-center justify-center gap-2"
            >
              AIに質問してみる <ArrowRight size={14} />
            </button>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              onClick={scrollToForm}
              className="inline-flex items-center gap-2 rounded-full border border-[#E8E4DE] bg-white/80 px-4 py-2 text-[12px] font-bold text-[#2B3A3F] hover:border-[#C4956C] hover:text-[#C4956C] transition-colors"
            >
              2分で先行登録へ
            </button>
            <button
              onClick={scrollToAiConsult}
              className="inline-flex items-center gap-2 rounded-full border border-[#E8E4DE] bg-white/80 px-4 py-2 text-[12px] font-bold text-[#2B3A3F] hover:border-[#C4956C] hover:text-[#C4956C] transition-colors"
            >
              今すぐAIに質問する
            </button>
          </div>

          <div className="flex flex-col gap-2 mt-3 pt-4 border-t border-[#E8E4DE]/80">
            <p className="text-[13px] text-[#595959] flex items-center gap-2">
              <Check size={14} className="text-[#3F7D5C] flex-shrink-0" />
              クレジットカード不要・先着200院は月額永久<span className="font-bold text-[#1A1A1A]">30%オフ</span>（¥8,400〜）
            </p>
            <p className="text-[13px] text-[#595959] flex items-center gap-2">
              <Check size={14} className="text-[#3F7D5C] flex-shrink-0" />
              ローンチは{lpData.launchMonth}予定。追加料金なしで全機能使えます。
            </p>
          </div>
        </div>

        {/* Right: Live AI Chat Demo */}
        <div className="w-full md:w-[45%] relative mt-4 md:mt-0 fade-up-enter fade-up-delayed-2">
          <div className="relative w-full bg-white rounded-[12px] border border-[#E8E4DE] shadow-[0_20px_60px_-20px_rgba(0,0,0,0.15)] overflow-hidden">
            
            {/* Browser chrome */}
            <div className="h-10 border-b border-[#E8E4DE] bg-[#F3EFE8] flex items-center px-4 gap-3">
              <div className="flex gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full bg-[#E8E4DE]"></div>
                <div className="w-2.5 h-2.5 rounded-full bg-[#E8E4DE]"></div>
                <div className="w-2.5 h-2.5 rounded-full bg-[#E8E4DE]"></div>
              </div>
              <div className="flex-1 h-5 bg-white/60 border border-[#E8E4DE] rounded-[4px] flex items-center px-2">
                <span className="text-[10px] text-[#595959] font-mono truncate">tiramisu.clinic/ai</span>
              </div>
            </div>
            
            {/* AI Chat UI */}
            <div className="p-4 bg-[#FAFAFA] min-h-[400px] flex flex-col gap-3">
              {/* Chat header */}
              <div className="flex items-center gap-2 pb-3 border-b border-[#E8E4DE]">
                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[#C4956C] to-[#2B3A3F] flex items-center justify-center">
                  <Brain size={14} className="text-white" />
                </div>
                <div className="flex-1">
                  <p className="text-[11px] font-bold text-[#1A1A1A] flex items-center gap-1.5">
                    Tiramisu AI
                    <span className="w-1.5 h-1.5 rounded-full bg-[#3F7D5C] subtle-pulse"></span>
                  </p>
                  <p className="text-[9px] text-[#595959] font-mono">院の全データを参照中</p>
                </div>
              </div>

              {/* User message */}
              <div className="flex justify-end fade-up-enter" key={`user-${activeDemoIdx}`}>
                <div className="max-w-[85%] bg-[#2B3A3F] text-white rounded-[12px] rounded-tr-sm px-3 py-2">
                  <p className="text-[11px] leading-[1.6]">{currentDemo.user}</p>
                </div>
              </div>

              {/* AI response */}
              <div className="flex gap-2 fade-up-enter fade-up-delayed-1" key={`ai-${activeDemoIdx}`}>
                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[#C4956C] to-[#2B3A3F] flex-shrink-0 flex items-center justify-center">
                  <Brain size={12} className="text-white" />
                </div>
                <div className="flex-1 max-w-[85%]">
                  <div className="bg-white border border-[#E8E4DE] rounded-[12px] rounded-tl-sm px-3 py-2.5">
                    <p className="text-[11px] leading-[1.7] text-[#1A1A1A]">{currentDemo.ai}</p>
                  </div>
                  {/* Inline metric cards */}
                  {currentDemo.metrics && (
                    <div className="flex gap-2 mt-2">
                      {currentDemo.metrics.map((m, i) => (
                        <div key={i} className="flex-1 bg-white border border-[#E8E4DE] rounded px-2 py-1.5">
                          <p className="text-[8px] text-[#595959]">{m.label}</p>
                          <p className={`text-[11px] font-bold font-inter ${m.trend === 'down' ? 'text-red-600' : m.trend === 'up' ? 'text-[#3F7D5C]' : 'text-[#1A1A1A]'}`}>
                            {m.value}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Suggested follow-ups */}
              <div className="mt-auto flex flex-wrap gap-1.5 pt-2">
                {DEMO_CONVERSATIONS.map((d, i) => (
                  <button
                    key={i}
                    onClick={() => setActiveDemoIdx(i)}
                    className={`text-[9px] px-2 py-1 rounded-full border transition-colors ${
                      i === activeDemoIdx
                        ? 'bg-[#2B3A3F] text-white border-[#2B3A3F]'
                        : 'bg-white text-[#595959] border-[#E8E4DE] hover:border-[#C4956C]'
                    }`}
                  >
                    {d.user.length > 14 ? d.user.slice(0, 14) + '...' : d.user}
                  </button>
                ))}
              </div>

              {/* Input field mock */}
              <div className="flex items-center gap-2 bg-white border border-[#E8E4DE] rounded-[6px] px-3 py-2">
                <input
                  type="text"
                  placeholder="院のことを、何でも聞いてください"
                  readOnly
                  className="flex-1 bg-transparent text-[10px] text-[#595959] outline-none cursor-default"
                />
                <Send size={12} className="text-[#C4956C]" />
              </div>
            </div>

            <div className="absolute top-14 right-3 bg-white/90 backdrop-blur-sm border border-[#E8E4DE] px-2 py-1 rounded-[4px] flex items-center gap-1.5 shadow-sm">
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#3F7D5C] opacity-75"></span>
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-[#3F7D5C]"></span>
              </span>
              <span className="text-[9px] font-bold text-[#3F7D5C] tracking-wider font-inter">LIVE DEMO</span>
            </div>
          </div>
        </div>
      </section>

      {/* Marquee */}
      <div className="w-full border-y border-[#E8E4DE] bg-[#FAF8F5] py-4 overflow-hidden">
        <div className="flex items-center gap-8 marquee-track whitespace-nowrap">
          {[...Array(2)].map((_, i) => (
            <div key={i} className="flex items-center gap-8 whitespace-nowrap">
              <span className="text-[12px] text-[#595959] font-inter tracking-widest uppercase">Pre-registered from</span>
              {['北海道', '宮城県', '東京都', '神奈川県', '愛知県', '大阪府', '京都府', '広島県', '福岡県', '熊本県', '沖縄県'].map((p, j) => (
                <span key={`${i}-${j}`} className="font-serif-jp text-[14px] text-[#1A1A1A] font-medium">{p}</span>
              ))}
              <span className="text-[12px] text-[#C4956C] font-inter">+ {lpData.prefectureCount - 11} more</span>
            </div>
          ))}
        </div>
      </div>

      {/* ================= CORE VALUE: 3 PILLARS ================= */}
      <section className="w-full bg-white py-20 md:py-28 border-b border-[#E8E4DE]">
        <div className="max-w-[1000px] mx-auto px-6 mobile-tight">
          <p className="font-inter text-[11px] text-[#C4956C] tracking-[0.2em] uppercase mb-3 font-bold">What You Get</p>
          <h2 className="font-serif-jp text-[28px] md:text-[40px] font-bold text-[#1A1A1A] tracking-[-0.02em] mb-3 leading-[1.3]">
            全部入って、追加料金なし。
          </h2>
          <p className="text-[15px] text-[#595959] mb-12 md:mb-16 max-w-xl leading-[1.9]">
            業務管理もAI経営分析もAIチャットも、すべて月額¥12,000に含まれます。
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
            <div className="bg-[#FAF8F5] border border-[#E8E4DE] rounded-[4px] p-6 md:p-8">
              <div className="w-11 h-11 rounded-[6px] bg-[#2B3A3F]/10 flex items-center justify-center mb-4">
                <BarChart3 className="text-[#2B3A3F]" size={20} />
              </div>
              <p className="font-inter text-[10px] text-[#595959] tracking-wider font-bold uppercase mb-1">01 / Operations</p>
              <h3 className="font-serif-jp text-[20px] font-bold text-[#1A1A1A] mb-3 leading-[1.4]">
                業務オペレーション
              </h3>
              <p className="text-[13px] text-[#595959] leading-[1.9] mb-4">
                予約、売上集計、スタッフ管理、患者データ。整骨院の日々の運営に必要な機能すべて。
              </p>
              <ul className="flex flex-col gap-1.5 text-[12px] text-[#1A1A1A]">
                {['予約台帳', '売上レポート', 'スタッフ権限管理', 'LINE通知', '患者ポータル'].map(item => (
                  <li key={item} className="flex items-center gap-2">
                    <Check size={12} className="text-[#3F7D5C] flex-shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            <div className="bg-gradient-to-br from-[#C4956C]/10 to-[#FAF8F5] border-2 border-[#C4956C]/40 rounded-[4px] p-6 md:p-8 md:-translate-y-2 relative">
              <div className="absolute -top-3 left-6 bg-[#C4956C] text-white text-[10px] font-bold px-3 py-1 rounded font-inter tracking-wider">CORE</div>
              <div className="w-11 h-11 rounded-[6px] bg-[#C4956C]/20 flex items-center justify-center mb-4">
                <MessageSquare className="text-[#C4956C]" size={20} />
              </div>
              <p className="font-inter text-[10px] text-[#C4956C] tracking-wider font-bold uppercase mb-1">02 / AI Chat</p>
              <h3 className="font-serif-jp text-[20px] font-bold text-[#1A1A1A] mb-3 leading-[1.4]">
                AI経営パートナー
              </h3>
              <p className="text-[13px] text-[#595959] leading-[1.9] mb-4">
                院の全データ（売上・シフト・予約・患者）を読み込んだAIに、<span className="font-bold text-[#1A1A1A]">自然言語でチャット</span>。Excelも集計作業も要りません。
              </p>
              <ul className="flex flex-col gap-1.5 text-[12px] text-[#1A1A1A]">
                {['売上の異変を即時検知', '来月のシフト最適化', 'VIP患者の自動抽出', '経営相談の壁打ち相手'].map(item => (
                  <li key={item} className="flex items-center gap-2">
                    <Check size={12} className="text-[#3F7D5C] flex-shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            <div className="bg-[#FAF8F5] border border-[#E8E4DE] rounded-[4px] p-6 md:p-8">
              <div className="w-11 h-11 rounded-[6px] bg-[#3F7D5C]/15 flex items-center justify-center mb-4">
                <TrendingUp className="text-[#3F7D5C]" size={20} />
              </div>
              <p className="font-inter text-[10px] text-[#595959] tracking-wider font-bold uppercase mb-1">03 / AI Analytics</p>
              <h3 className="font-serif-jp text-[20px] font-bold text-[#1A1A1A] mb-3 leading-[1.4]">
                AI経営KPI分析
              </h3>
              <p className="text-[13px] text-[#595959] leading-[1.9] mb-4">
                売上・限界利益・リピート率・LTV。経営判断に直結する指標を、AIが自動で追跡・異常検知。
              </p>
              <ul className="flex flex-col gap-1.5 text-[12px] text-[#1A1A1A]">
                {['月次KPIダッシュボード', '限界利益の自動算出', 'リピート率の時系列分析', '担当者別パフォーマンス'].map(item => (
                  <li key={item} className="flex items-center gap-2">
                    <Check size={12} className="text-[#3F7D5C] flex-shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ================= FOUNDER LETTER ================= */}
      <section className="w-full bg-[#F3EFE8] py-20 md:py-28">
        <div className="max-w-[1000px] mx-auto px-6 mobile-tight flex flex-col md:flex-row gap-12 md:gap-20 items-start">
          
          <div className="w-full md:w-[38%] flex flex-col gap-6">
            <div className="w-full aspect-[4/5] bg-[#E8E4DE] rounded-[4px] overflow-hidden relative grayscale-[20%] contrast-[1.05]">
              <img 
                src="https://images.unsplash.com/photo-1559839734-2b71ea197ec2?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80" 
                alt="岩沢 太" 
                className="w-full h-full object-cover"
              />
              <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/50 to-transparent">
                <p className="text-white font-serif-jp text-[14px]">週5日、現場に立ち続けている。</p>
              </div>
            </div>
            
            <div className="flex flex-col gap-1">
              <p className="font-serif-jp text-[18px] font-bold text-[#1A1A1A]">岩沢 太</p>
              <p className="text-[12px] text-[#595959]">イワサワ フトシ</p>
              <p className="text-[12px] text-[#595959] font-inter tracking-wider">FOUNDER / PRACTITIONER</p>
            </div>

            <div className="bg-white/60 border border-[#E8E4DE] rounded-[4px] p-5 flex flex-col gap-3">
              <ul className="text-[13px] text-[#1A1A1A] flex flex-col gap-2.5 font-medium">
                <li className="flex gap-3 items-start">
                  <span className="text-[#C4956C] font-inter text-[11px] mt-1 font-bold tracking-wider">01</span>
                  <span>施術家として10年、現場で勤務</span>
                </li>
                <li className="flex gap-3 items-start">
                  <span className="text-[#C4956C] font-inter text-[11px] mt-1 font-bold tracking-wider">02</span>
                  <span>クルーズ船で鍼灸師として勤務</span>
                </li>
                <li className="flex gap-3 items-start">
                  <span className="text-[#C4956C] font-inter text-[11px] mt-1 font-bold tracking-wider">03</span>
                  <span>スタートアップでSaaS営業を経験</span>
                </li>
              </ul>
            </div>
          </div>

          <div className="w-full md:w-[62%] flex flex-col pt-2">
            <p className="font-inter text-[11px] text-[#595959] tracking-[0.2em] uppercase mb-4">A letter from the founder</p>
            
            <h2 className="font-serif-jp text-[28px] md:text-[40px] font-bold text-[#1A1A1A] leading-[1.45] mb-10 tracking-[-0.01em]">
              「エクセル開くの、<br className="hidden md:block"/>
              正直しんどい。」
              <span className="block text-[18px] md:text-[22px] text-[#595959] font-medium mt-4">——その違和感が、Tiramisuの出発点でした。</span>
            </h2>
            
            <div className="text-[15px] md:text-[16px] text-[#1A1A1A] flex flex-col gap-5 font-normal leading-[1.95]">
              <p>
                私は施術家として10年間、現場で働いてきました。クルーズ船で鍼灸師として働いたこともあれば、スタートアップの世界でSaaS営業に携わった時期もあります。
              </p>
              <p>
                だからこそ、整骨院の現場に戻ったときに強く感じたんです。<span className="font-bold">この業界は、利益を生まない仕事に、利益を生む時間を奪われすぎている。</span>
              </p>
              <p>
                院長たちはみんな、<span className="font-bold">「数字を見なきゃいけないのは分かってる」</span>と言います。<br/>
                でも、現場で8時間立ち続けたあとに残るのは疲労です。そこからエクセルを開いて、売上を見て、集計して、原因を探す。その気力まで残っている人は、ほとんどいません。
              </p>
              <p>
                しかも問題なのは、そうした集計や確認や共有のような<span className="font-bold">間接利益の業務が、直接利益の業務を圧迫している</span>ことです。<br/>
                ただでさえ低い利益率なのに、利益を生まない仕事が、さらにそれを削ってしまっている。私はそこに、ずっと強い違和感がありました。
              </p>
              <p>
                既存の整骨院向けシステムは、業務管理まではよくできています。でも、<span className="font-bold">「で、今月どうなの？」にその場で答えてくれるものは、なかった。</span> そこが、決定的に足りていないと感じました。
              </p>
              <p>
                だから私は、<span className="bg-[#C4956C]/15 px-1">AIが院の全データを見て、話しかけるだけで答えてくれる</span>仕組みを作ろうと思いました。<br/>
                「先月から売上落ちてる気がする」と一言つぶやけば、原因まで返ってくる。院長が数字を読みに行くのではなく、数字のほうから答えを返してくる。そんな状態を作りたかったんです。
              </p>
              <p className="text-[#595959]">
                数字を読むのは、もうAIの仕事でいい。<br/>
                院長は、院長にしかできない直接利益の仕事に、もっと時間を使ってください。
              </p>
            </div>

            <div className="mt-12 border-t border-[#E8E4DE] pt-6 flex flex-col gap-1">
              <p className="font-serif-jp text-[32px] text-[#1A1A1A] leading-none">岩沢 太</p>
              <p className="text-[12px] text-[#595959]">イワサワ フトシ</p>
              <p className="text-[12px] text-[#595959] mt-2 font-inter tracking-wider">FOUNDER / TIRAMISU</p>
              <a href="mailto:founder@tiramisu.clinic" className="text-[13px] text-[#2B3A3F] hover:text-[#C4956C] underline underline-offset-4 transition-colors w-fit mt-3">
                → 直接メールで質問する
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* ================= AI USE CASES (Scenario showcase) ================= */}
      <section id="ai-demo" className="w-full bg-[#FAF8F5] py-20 md:py-28">
        <div className="max-w-[1120px] mx-auto px-6 mobile-tight">
          <p className="font-inter text-[11px] text-[#C4956C] tracking-[0.2em] uppercase mb-3 font-bold">AI Chat / Real Scenarios</p>
          <h2 className="font-serif-jp text-[28px] md:text-[42px] font-bold text-[#1A1A1A] tracking-[-0.02em] mb-3 leading-[1.3]">
            AIに、こんなふうに聞けます。
          </h2>
          <p className="text-[15px] text-[#595959] mb-10 md:mb-14 max-w-xl leading-[1.9]">
            Tiramisu AIは院の売上・予約・シフト・患者データをリアルタイムに参照。会話するだけで経営判断の材料が揃います。
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
            {[
              {
                category: "売上分析",
                icon: TrendingUp,
                question: "今月、先月より売上落ちてない？",
                answer: "先月比-8.2%（¥324,000減）。自費メニューのリピート率が42%→31%。特に木曜夜枠の新規→2回目転換が58%→34%に悪化しています。",
                tag: "異変検知"
              },
              {
                category: "シフト最適化",
                icon: Users,
                question: "来月のシフト、削れる時間帯ある？",
                answer: "火曜10-12時と土曜18時以降の稼働率が25%切り。ここ閉めれば月28時間（人件費約¥42,000）削減可能。土曜夕方は新患率高いので火曜午前のみ推奨。",
                tag: "コスト最適化"
              },
              {
                category: "顧客管理",
                icon: MessageSquare,
                question: "要フォローの患者、誰？",
                answer: "過去6ヶ月で来院8回以上・自費率50%以上のVIPが23名。最終来院から30日以上空いている要フォロー対象が5名。LINE配信の自動ドラフトを作成しますか？",
                tag: "離脱防止"
              },
              {
                category: "スタッフ評価",
                icon: BarChart3,
                question: "先月、一番売上立てたのは誰？",
                answer: "1位は田中さん（¥890k）。注目は山田さん、施術件数は3位ですが自費率が院内トップ（68%）。新人の佐藤さんはリピート率82%で将来性あり。",
                tag: "人事判断"
              },
              {
                category: "経営KPI",
                icon: Brain,
                question: "うちの限界利益率、業界比でどう？",
                answer: "42.3%です。整骨院の一般水準（35-40%）を上回っています。特に物販の粗利寄与が大きい。ただしスタッフ稼働率が68%と低めで、ここに伸びしろがあります。",
                tag: "ベンチマーク"
              },
              {
                category: "予測",
                icon: Sparkles,
                question: "このまま行ったら来月どうなる？",
                answer: "今のトレンドで予測すると来月売上は¥3.52M（前月比+4.1%）。ただし新患獲得が2ヶ月連続で減速しているので、4月以降は警戒水準です。",
                tag: "予測分析"
              },
            ].map((scene, idx) => {
              const Icon = scene.icon;
              return (
                <div key={idx} className="bg-white border border-[#E8E4DE] rounded-[6px] p-5 md:p-6 hover:border-[#C4956C] hover:-translate-y-1 hover:shadow-[0_12px_30px_-10px_rgba(0,0,0,0.1)] transition-all">
                  <div className="flex items-center justify-between mb-4">
                    <div className="w-9 h-9 rounded-[6px] bg-[#C4956C]/10 flex items-center justify-center">
                      <Icon className="text-[#C4956C]" size={16} />
                    </div>
                    <span className="text-[9px] font-inter font-bold tracking-wider bg-[#F3EFE8] text-[#595959] px-2 py-0.5 rounded uppercase">
                      {scene.tag}
                    </span>
                  </div>
                  
                  {/* User question */}
                  <div className="mb-3 bg-[#2B3A3F] text-white rounded-[10px] rounded-tr-sm px-3 py-2 ml-6">
                    <p className="text-[12px] leading-[1.6]">{scene.question}</p>
                  </div>
                  
                  {/* AI answer */}
                  <div className="bg-[#FAF8F5] border border-[#E8E4DE] rounded-[10px] rounded-tl-sm px-3 py-2.5 mr-6">
                    <p className="text-[10px] font-bold text-[#C4956C] font-inter tracking-wider mb-1">TIRAMISU AI</p>
                    <p className="text-[12px] leading-[1.75] text-[#1A1A1A]">{scene.answer}</p>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-10 p-5 bg-white border border-[#E8E4DE] rounded-[4px] flex items-start gap-3">
            <AlertCircle className="text-[#C4956C] flex-shrink-0 mt-0.5" size={16} />
            <div className="flex-1">
              <p className="text-[13px] font-bold text-[#1A1A1A] mb-1">今あなたの頭にある質問、ぜひ試してみてください。</p>
              <p className="text-[12px] text-[#595959] leading-[1.8]">
                下の「AIに相談」コーナーで、実際にあなたの質問をTiramisu AIにぶつけられます。
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ================= PRICING ================= */}
      <section className="w-full bg-[#2B3A3F] text-[#FAF8F5] py-20 md:py-28">
        <div className="max-w-[1000px] mx-auto px-6 mobile-tight">
          <p className="font-inter text-[11px] text-[#C4956C] tracking-[0.2em] uppercase mb-3 font-bold">Pricing</p>
          <h2 className="font-serif-jp text-[28px] md:text-[40px] font-bold tracking-[-0.02em] mb-3 leading-[1.3]">
            料金は、シンプルです。
          </h2>
          <p className="text-[15px] text-[#FAF8F5]/70 mb-10 md:mb-14 max-w-xl">
            AI分析もAIチャットも、全機能が定額に含まれます。追加料金のオプションは、ありません。
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 md:gap-6">
            
            {/* Single clinic plan */}
            <div className="bg-white/5 border border-white/10 rounded-[6px] p-7 md:p-10 flex flex-col">
              <p className="font-inter text-[11px] tracking-widest text-[#FAF8F5]/60 mb-3 uppercase">For single clinic</p>
              <h3 className="font-serif-jp text-[24px] font-bold mb-3">単院プラン</h3>
              <p className="text-[13px] text-[#FAF8F5]/70 leading-[1.8] mb-6">
                1店舗運営の院長・個人経営向け。全機能・AI含めて完全定額。
              </p>
              
              <div className="flex items-baseline gap-1 mb-1">
                <span className="font-inter text-[48px] md:text-[56px] font-bold leading-none tracking-tight">¥12,000</span>
                <span className="text-[14px] text-[#FAF8F5]/70">/月（税抜）</span>
              </div>
              <p className="text-[12px] text-[#C4956C] font-mono mb-8">
                先行登録なら30%オフ永久: <span className="font-bold">¥8,400</span>/月
              </p>

              <div className="flex flex-col gap-2 text-[13px] text-[#FAF8F5]/90 mb-8 flex-1">
                {['予約・売上・スタッフ管理 全機能', 'AI経営チャット 無制限', 'AI分析ダッシュボード', 'LINE通知連携', 'データ移行サポート（無料）'].map(f => (
                  <div key={f} className="flex items-start gap-2">
                    <Check size={14} className="text-[#3F7D5C] flex-shrink-0 mt-0.5" />
                    <span>{f}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Multi-store plan */}
            <div className="bg-[#C4956C]/15 border-2 border-[#C4956C] rounded-[6px] p-7 md:p-10 flex flex-col relative md:-translate-y-2">
              <div className="absolute -top-3 left-6 bg-[#C4956C] text-white text-[10px] font-bold px-3 py-1 rounded font-inter tracking-wider">MULTI-STORE</div>
              <p className="font-inter text-[11px] tracking-widest text-[#C4956C] mb-3 uppercase">For chain / multiple clinics</p>
              <h3 className="font-serif-jp text-[24px] font-bold mb-3">多店舗プラン</h3>
              <p className="text-[13px] text-[#FAF8F5]/80 leading-[1.8] mb-6">
                2店舗以上のチェーン運営向け。10アカウント含む。本部一元管理・店舗間比較。
              </p>
              
              <div className="flex items-baseline gap-1 mb-1">
                <span className="font-inter text-[48px] md:text-[56px] font-bold leading-none tracking-tight">¥100,000</span>
                <span className="text-[14px] text-[#FAF8F5]/70">/月（税抜）</span>
              </div>
              <p className="text-[12px] text-[#FAF8F5]/70 font-mono mb-1">
                10アカウント込み
              </p>
              <p className="text-[12px] text-[#C4956C] font-mono mb-8">
                追加アカウント: <span className="font-bold">+¥8,000</span>/月・1アカウント
              </p>

              <div className="flex flex-col gap-2 text-[13px] text-[#FAF8F5]/90 mb-8 flex-1">
                {['単院プランの全機能', '店舗間データ横断比較', '本部ダッシュボード', '店舗別AI分析', '階層型権限管理（本部/店長/スタッフ）', 'SSO対応（法人様）'].map(f => (
                  <div key={f} className="flex items-start gap-2">
                    <Check size={14} className="text-[#3F7D5C] flex-shrink-0 mt-0.5" />
                    <span>{f}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Pricing details */}
          <div className="mt-10 bg-white/5 border border-white/10 rounded-[4px] p-6">
            <p className="font-bold text-[14px] mb-3 flex items-center gap-2">
              <AlertCircle className="text-[#C4956C]" size={18} />
              料金についての正直な話
            </p>
            <ul className="text-[13px] text-[#FAF8F5]/70 leading-[1.95] flex flex-col gap-1">
              <li>・ 上記の料金にはAIチャット・AI分析を含む全機能が入っています（オプション課金ゼロ）</li>
              <li>・ ただし、将来的にAIチャットのヘビーユーザー向けの従量課金プランを検討しています</li>
              <li>・ 先行登録200院までは<span className="text-[#C4956C] font-bold">月額永久30%オフ</span>（単院¥8,400・多店舗¥70,000）</li>
              <li>・ 月単位で解約可能。長期契約の縛りなし</li>
            </ul>
          </div>

          {/* Multi-store calculation example */}
          <div className="mt-6 bg-white/5 border border-white/10 rounded-[4px] p-6">
            <p className="text-[11px] text-[#FAF8F5]/60 font-mono tracking-widest uppercase mb-3">Example: 15-account multi-store</p>
            <div className="flex flex-col gap-2 text-[13px] text-[#FAF8F5]/80">
              <div className="flex justify-between pb-2 border-b border-white/10">
                <span>多店舗プラン（10アカウント込み）</span>
                <span className="font-inter font-bold">¥100,000</span>
              </div>
              <div className="flex justify-between pb-2 border-b border-white/10">
                <span>追加アカウント 5名分 (¥8,000 × 5)</span>
                <span className="font-inter font-bold">¥40,000</span>
              </div>
              <div className="flex justify-between pt-2">
                <span className="font-bold">合計（税抜）</span>
                <span className="font-inter font-bold text-[20px] text-[#C4956C]">¥140,000/月</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ================= COMPARISON TABLE ================= */}
      <section className="w-full bg-white py-20 md:py-28 border-t border-[#E8E4DE]">
        <div className="max-w-[1000px] mx-auto px-6 mobile-tight">
          <p className="font-inter text-[11px] text-[#C4956C] tracking-[0.2em] uppercase mb-3 font-bold">Comparison</p>
          <h2 className="font-serif-jp text-[28px] md:text-[38px] font-bold text-[#1A1A1A] tracking-[-0.02em] mb-3 leading-[1.3]">
            他の選択肢と、何が違うのか。
          </h2>
          <p className="text-[15px] text-[#595959] mb-10 md:mb-14 max-w-xl">
            既存の大手システム、Excel運用との比較。
          </p>

          <div className="hidden md:block overflow-hidden rounded-[4px] border border-[#E8E4DE]">
            <table className="w-full text-left">
              <thead className="bg-[#F3EFE8] border-b border-[#E8E4DE]">
                <tr>
                  <th className="py-4 px-5 text-[12px] font-bold text-[#595959] tracking-wider uppercase font-inter">観点</th>
                  <th className="py-4 px-5 text-[13px] font-bold text-[#1A1A1A]">Tiramisu</th>
                  <th className="py-4 px-5 text-[13px] font-medium text-[#595959]">既存の大手システム</th>
                  <th className="py-4 px-5 text-[13px] font-medium text-[#595959]">Excel運用</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ['月額（単院）', '¥12,000 定額・全機能込み', '¥30,000〜¥80,000+オプション', '¥0（人件費膨大）'],
                  ['AIチャット機能', '標準搭載・院のデータ参照', 'ほぼ未搭載', 'N/A'],
                  ['AI経営KPI分析', '標準搭載', '別料金オプションが多い', '手動集計'],
                  ['ロール別UI', '院長/スタッフ/患者で自動分離', 'オプション扱い', 'なし'],
                  ['導入のしやすさ', 'データ移行・初期設定は無料対応', '長期契約・初期費用あり', '簡単だが後戻り不可'],
                  ['現場の学習コスト', '施術家が設計。数時間で使える', 'マニュアル必須・教育期間長', '属人化・新人教育が地獄'],
                  ['開発者との距離', '代表に直接メールで届く', '代理店経由・遠い', 'N/A'],
                ].map((row, idx) => (
                  <tr key={idx} className={`border-b border-[#E8E4DE] last:border-b-0 ${idx % 2 === 0 ? 'bg-white' : 'bg-[#FAF8F5]/50'}`}>
                    <td className="py-4 px-5 text-[13px] font-bold text-[#1A1A1A]">{row[0]}</td>
                    <td className="py-4 px-5 text-[13px] text-[#1A1A1A] bg-[#C4956C]/5 border-l-2 border-[#C4956C]">
                      <span className="flex items-start gap-2">
                        <Check size={14} className="text-[#3F7D5C] mt-0.5 flex-shrink-0" />
                        {row[1]}
                      </span>
                    </td>
                    <td className="py-4 px-5 text-[13px] text-[#595959]">{row[2]}</td>
                    <td className="py-4 px-5 text-[13px] text-[#595959]">{row[3]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="md:hidden flex flex-col gap-4">
            {[
              { key: '月額（単院）', us: '¥12,000 定額・全機能込み', them: '¥30,000〜¥80,000+オプション', paper: '¥0（人件費膨大）' },
              { key: 'AIチャット', us: '標準搭載・院のデータ参照', them: 'ほぼ未搭載', paper: 'N/A' },
              { key: 'AI経営分析', us: '標準搭載', them: 'オプション料金', paper: '手動集計' },
              { key: 'ロール別UI', us: '3ロール自動分離', them: 'オプション扱い', paper: 'なし' },
            ].map((row, idx) => (
              <div key={idx} className="border border-[#E8E4DE] rounded-[4px] overflow-hidden">
                <div className="bg-[#F3EFE8] px-4 py-2 font-bold text-[13px] text-[#1A1A1A]">{row.key}</div>
                <div className="p-4 bg-[#C4956C]/5 border-l-2 border-[#C4956C] flex items-start gap-2">
                  <Check size={14} className="text-[#3F7D5C] mt-1 flex-shrink-0" />
                  <div>
                    <p className="text-[11px] font-bold text-[#C4956C] mb-0.5">Tiramisu</p>
                    <p className="text-[13px] text-[#1A1A1A]">{row.us}</p>
                  </div>
                </div>
                <div className="p-4 text-[12px] text-[#595959] border-t border-[#E8E4DE]">
                  <span className="font-bold">既存システム:</span> {row.them}<br/>
                  <span className="font-bold">Excel:</span> {row.paper}
                </div>
              </div>
            ))}
          </div>

          <p className="text-[11px] text-[#595959] mt-6 italic">※ 弊社調査および代表の現場経験に基づく一般的比較。個別システムの最新仕様は各社にご確認ください。</p>
        </div>
      </section>

      {/* ================= TIMELINE ================= */}
      <section className="w-full bg-[#FAF8F5] py-20 md:py-28 border-t border-[#E8E4DE]">
        <div className="max-w-[1000px] mx-auto px-6 mobile-tight">
          <p className="font-inter text-[11px] text-[#C4956C] tracking-[0.2em] uppercase mb-3 font-bold">Timeline</p>
          <h2 className="font-serif-jp text-[28px] md:text-[38px] font-bold text-[#1A1A1A] tracking-[-0.02em] mb-3 leading-[1.3]">
            ここから、ローンチまで。
          </h2>
          <p className="text-[15px] text-[#595959] mb-12 md:mb-16 max-w-xl">
            先行登録いただいた後、どう進むか。全てオープンに共有します。
          </p>

          <div className="relative">
            <div className="absolute left-4 md:left-1/2 top-0 bottom-0 w-px bg-[#E8E4DE] md:-translate-x-1/2"></div>

            {[
              { phase: 'NOW', date: '2026年 4月〜', title: '先行登録受付中', description: '毎月登録院数を更新。ニュースレターで進捗共有。', isActive: true },
              { phase: '01', date: '2026年 5月〜', title: 'クローズドβ版スタート', description: '先行登録順に順次ご案内。業務機能+AI分析の最小限版から。' },
              { phase: '02', date: '2026年 7月〜', title: 'AIチャット β解放', description: 'AI経営パートナー機能をβ参加者に解放。要望を反映して改善。' },
              { phase: '03', date: '2026年 10月', title: '正式ローンチ', description: '全機能込みで¥12,000（単院）・¥100,000（多店舗）で提供開始。' },
            ].map((item, idx) => (
              <div key={idx} className={`relative flex md:grid md:grid-cols-2 gap-6 md:gap-12 mb-10 md:mb-16 last:mb-0 items-start ${idx % 2 === 1 ? 'md:[&>div:first-child]:order-2 md:text-right' : ''}`}>
                <div className={`pl-12 md:pl-0 ${idx % 2 === 1 ? 'md:pl-12' : 'md:pr-12'} w-full`}>
                  <div className={`font-inter text-[11px] font-bold tracking-widest ${item.isActive ? 'text-[#3F7D5C]' : 'text-[#595959]'} uppercase mb-1`}>
                    {item.phase}
                  </div>
                  <div className="font-mono text-[12px] text-[#595959] mb-2">{item.date}</div>
                  <h3 className="font-serif-jp text-[20px] md:text-[22px] font-bold text-[#1A1A1A] mb-2 leading-[1.4]">{item.title}</h3>
                  <p className="text-[14px] text-[#595959] leading-[1.9]">{item.description}</p>
                </div>
                <div className={`absolute left-4 md:left-1/2 top-1 md:-translate-x-1/2 w-3 h-3 rounded-full border-2 ${item.isActive ? 'bg-[#3F7D5C] border-[#3F7D5C] subtle-pulse' : 'bg-white border-[#E8E4DE]'}`}></div>
                <div className="hidden md:block"></div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ================= STATUS ================= */}
      <section className="w-full bg-white py-20 md:py-28 border-t border-[#E8E4DE]">
        <div className="max-w-[1000px] mx-auto px-6 mobile-tight">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-14 gap-4">
            <div>
              <p className="font-inter text-[11px] text-[#C4956C] tracking-[0.2em] uppercase mb-3 font-bold">Current Status</p>
              <h2 className="font-serif-jp text-[28px] md:text-[38px] font-bold text-[#1A1A1A] tracking-[-0.02em] leading-[1.3]">
                今、こうなっています。
              </h2>
            </div>
            <p className="text-[13px] text-[#595959] flex items-center gap-2 font-mono">
              <span className="w-2 h-2 rounded-full bg-[#3F7D5C] subtle-pulse"></span>
              Updated {lpData.lastUpdated}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 border-y border-[#E8E4DE]">
            <div className="py-10 md:py-12 px-4 border-b md:border-b-0 md:border-r border-[#E8E4DE] flex flex-col items-center justify-center text-center">
              <div className="flex items-baseline gap-1">
                <span className="font-inter text-[72px] md:text-[88px] font-bold text-[#2B3A3F] leading-none tracking-tighter">
                  {lpData.registeredCount}
                </span>
                <span className="font-serif-jp text-[18px] font-bold text-[#2B3A3F]">院</span>
              </div>
              <p className="text-[13px] text-[#595959] mt-4">先行登録クリニック</p>
              <div className="mt-2 text-[11px] text-[#3F7D5C] font-bold bg-[#3F7D5C]/10 px-2 py-0.5 rounded-full font-mono">
                +{monthlyIncrease} last month
              </div>
            </div>
            
            <div className="py-10 md:py-12 px-4 border-b md:border-b-0 md:border-r border-[#E8E4DE] flex flex-col items-center justify-center text-center">
              <div className="flex items-baseline gap-1">
                <span className="font-inter text-[60px] md:text-[72px] font-bold text-[#2B3A3F] leading-none tracking-tighter">
                  {lpData.prefectureCount}
                </span>
                <span className="font-serif-jp text-[16px] font-bold text-[#2B3A3F]">都道府県</span>
              </div>
              <p className="text-[13px] text-[#595959] mt-4">導入検討エリア</p>
            </div>

            <div className="py-10 md:py-12 px-4 flex flex-col items-center justify-center text-center">
              <span className="font-serif-jp text-[32px] md:text-[40px] font-bold text-[#2B3A3F] leading-none tracking-tight">
                {lpData.launchMonth}
              </span>
              <p className="text-[13px] text-[#595959] mt-4">正式ローンチ予定</p>
            </div>
          </div>

          <div className="mt-16">
            <h3 className="font-serif-jp text-[20px] font-bold text-[#1A1A1A] mb-8">どんな院が登録しているか</h3>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6 md:gap-8">
              {[
                { label: "個人経営 (1店舗)", count: lpData.clinicSize.single },
                { label: "小規模チェーン (2〜5店舗)", count: lpData.clinicSize.small },
                { label: "中規模チェーン (6〜20店舗)", count: lpData.clinicSize.medium },
                { label: "企業経営 (21店舗以上)", count: lpData.clinicSize.enterprise },
              ].map((item, idx) => {
                const percentage = (item.count / lpData.registeredCount) * 100;
                return (
                  <div key={idx} className="flex flex-col gap-2.5">
                    <div className="flex flex-col gap-1">
                      <span className="text-[12px] text-[#595959] leading-tight min-h-[32px]">{item.label}</span>
                      <span className="font-inter text-[28px] font-bold text-[#1A1A1A]">{item.count}<span className="font-serif-jp text-[13px] ml-1 font-normal">院</span></span>
                    </div>
                    <div className="h-1 w-full bg-[#F3EFE8] rounded-full overflow-hidden">
                      <div className="h-full bg-[#C4956C] rounded-full transition-all duration-1000" style={{ width: `${percentage}%` }}></div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* ================= AI CONSULTANT (Live try-it) ================= */}
      <section id="ai-consult" className="w-full bg-[#F3EFE8] py-20 md:py-24 border-t border-[#E8E4DE] scroll-mt-20">
        <div className="max-w-[800px] mx-auto px-6 mobile-tight">
          <div className="bg-white rounded-[8px] shadow-[0_8px_30px_-10px_rgba(0,0,0,0.08)] border border-[#E8E4DE] p-8 md:p-12 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 bg-[#C4956C] opacity-[0.04] rounded-full blur-3xl -translate-y-1/2 translate-x-1/3"></div>
            
            <div className="relative z-10">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#C4956C] to-[#2B3A3F] flex items-center justify-center">
                  <Brain className="text-white" size={18} />
                </div>
                <div>
                  <p className="font-inter text-[10px] text-[#C4956C] tracking-widest font-bold uppercase">Try Tiramisu AI</p>
                  <h2 className="font-serif-jp text-[22px] md:text-[24px] font-bold text-[#1A1A1A]">
                    院の“重い仕事”を、AIに投げてみてください
                  </h2>
                </div>
              </div>
              <p className="text-[14px] text-[#595959] mb-6 leading-[1.9]">
                売上、シフト、患者、スタッフ。Tiramisu AIは、院の全データを横断して答えます。まずは近い悩みを選んで、どこまで返せるか試してみてください。
              </p>

              <div className="mb-6 rounded-[10px] border border-[#E8E4DE] bg-[#FAF8F5] px-4 py-4">
                <p className="text-[11px] font-inter tracking-[0.16em] uppercase text-[#595959] font-bold mb-2">READMEから反映している範囲</p>
                <p className="text-[13px] text-[#1A1A1A] leading-[1.8]">
                  予約、患者、日報、収益、スタッフ、AIチャット、AIインサイト、多店舗管理などの業務基盤を前提に回答します。
                </p>
              </div>

              <div className="mb-6 flex flex-wrap gap-2">
                <button
                  onClick={scrollToForm}
                  className="inline-flex items-center gap-2 rounded-full border border-[#E8E4DE] bg-[#FAF8F5] px-4 py-2 text-[12px] font-bold text-[#2B3A3F] hover:border-[#C4956C] hover:text-[#C4956C] transition-colors"
                >
                  先に先行登録する
                </button>
                <a
                  href="#ai-demo"
                  className="inline-flex items-center gap-2 rounded-full border border-[#E8E4DE] bg-[#FAF8F5] px-4 py-2 text-[12px] font-bold text-[#2B3A3F] hover:border-[#C4956C] hover:text-[#C4956C] transition-colors"
                >
                  質問例を見る
                </a>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2 mb-6">
                {AI_CAPABILITIES.map((capability) => {
                  const Icon = capability.icon;
                  const isActive = capability.id === activeCapability.id;
                  return (
                    <button
                      key={capability.id}
                      onClick={() => setActiveCapabilityId(capability.id)}
                      className={`rounded-[8px] border px-4 py-3 text-left transition-all ${
                        isActive
                          ? 'border-[#C4956C] bg-[#C4956C]/8 shadow-[0_6px_20px_-12px_rgba(196,149,108,0.7)]'
                          : 'border-[#E8E4DE] bg-[#FAF8F5] hover:border-[#C4956C]/50'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <div className={`w-8 h-8 rounded-[6px] flex items-center justify-center ${isActive ? 'bg-[#C4956C] text-white' : 'bg-white text-[#2B3A3F]'}`}>
                          <Icon size={16} />
                        </div>
                        <span className="text-[12px] font-bold text-[#1A1A1A]">{capability.label}</span>
                      </div>
                    </button>
                  );
                })}
              </div>

              <div className="mb-6 rounded-[10px] border border-[#E8E4DE] bg-[#FAF8F5] p-5">
                <div className="flex flex-col gap-2">
                  <p className="font-serif-jp text-[20px] font-bold text-[#1A1A1A]">{activeCapability.headline}</p>
                  <p className="text-[13px] text-[#595959] leading-[1.8]">{activeCapability.description}</p>
                </div>
                <div className="mt-5">
                  <p className="text-[11px] font-inter tracking-[0.16em] uppercase text-[#C4956C] font-bold mb-2">よくある質問</p>
                  <div className="flex flex-wrap gap-2">
                    {activeCapability.samplePrompts.map((prompt) => (
                      <button
                        key={prompt}
                        onClick={() => setAiInput(prompt)}
                        className="rounded-full border border-[#E8E4DE] bg-white px-4 py-2 text-[12px] font-bold text-[#2B3A3F] hover:border-[#C4956C] hover:text-[#C4956C] transition-colors"
                      >
                        {prompt}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="rounded-[8px] border border-[#E8E4DE] bg-white px-4 py-4">
                    <p className="text-[11px] font-inter tracking-[0.16em] uppercase text-[#595959] font-bold mb-2">参照するデータ</p>
                    <div className="flex flex-wrap gap-2">
                      {activeCapability.dataSources.map((source) => (
                        <span key={source} className="inline-flex items-center rounded-full bg-[#F3EFE8] px-3 py-1 text-[11px] font-bold text-[#2B3A3F]">
                          {source}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="rounded-[8px] border border-[#E8E4DE] bg-white px-4 py-4">
                    <p className="text-[11px] font-inter tracking-[0.16em] uppercase text-[#595959] font-bold mb-2">返ってくること</p>
                    <div className="flex flex-wrap gap-2">
                      {activeCapability.outputs.map((output) => (
                        <span key={output} className="inline-flex items-center rounded-full bg-[#F3EFE8] px-3 py-1 text-[11px] font-bold text-[#2B3A3F]">
                          {output}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-3">
                <textarea
                  value={aiInput}
                  onChange={(e) => setAiInput(e.target.value)}
                  placeholder={activeCapability.samplePrompts[0]}
                  rows="3"
                  className="w-full p-4 rounded-[4px] border border-[#E8E4DE] bg-[#FAF8F5] text-[#1A1A1A] text-[14px] focus:bg-white focus:border-[#C4956C] focus:ring-2 focus:ring-[#C4956C]/20 outline-none transition-all resize-none"
                />
                <button
                  onClick={handleAiSubmit}
                  disabled={isAiLoading || !aiInput.trim()}
                  className="w-full md:w-auto self-end px-6 py-3 bg-[#2B3A3F] text-white font-bold text-[14px] rounded-[4px] transition-all hover:bg-[#1f292d] shadow-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {isAiLoading ? <Loader2 className="animate-spin" size={16} /> : <Brain size={14} />}
                  {isAiLoading ? "分析中..." : "AIに相談する"}
                </button>
              </div>

              {aiError && (
                <div className="mt-5 p-3 bg-red-50 text-red-600 text-[13px] rounded-[4px] border border-red-200">
                  {aiError}
                </div>
              )}

              {aiResponse && (
                <div className="mt-6 pt-6 border-t border-[#E8E4DE] fade-up-enter">
                  <div className="flex gap-3">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#C4956C] to-[#2B3A3F] flex-shrink-0 flex items-center justify-center">
                      <Brain className="text-white" size={16} />
                    </div>
                    <div className="flex-1 bg-[#FAF8F5] p-4 rounded-[8px] rounded-tl-sm border border-[#E8E4DE]">
                      <p className="text-[12px] font-bold text-[#1A1A1A] mb-2 flex items-center gap-2">
                        Tiramisu AI <span className="bg-[#C4956C]/10 text-[#C4956C] text-[9px] px-1.5 py-0.5 rounded font-inter tracking-wider">DEMO</span>
                      </p>
                      <p className="text-[14px] text-[#1A1A1A] leading-[1.85] whitespace-pre-wrap">
                        {aiResponse}
                      </p>
                    </div>
                  </div>
                  <p className="text-[11px] text-[#595959] mt-3 font-mono italic">
                    ※ 上記はLPでの体験版。実際は院のリアルデータを参照して回答します。
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ================= EFFICIENCY CALCULATOR ================= */}
      <section className="w-full bg-white py-20 md:py-24 border-t border-[#E8E4DE]">
        <div className="max-w-[1120px] mx-auto px-6 mobile-tight">
          <div className="max-w-[760px] mb-12">
            <p className="font-inter text-[11px] text-[#C4956C] tracking-[0.2em] uppercase mb-3 font-bold">Back Office Impact</p>
            <h2 className="font-serif-jp text-[28px] md:text-[40px] font-bold text-[#1A1A1A] leading-[1.35] tracking-[-0.02em]">
              あなたの院で、毎月どれくらい時間が戻るか試算できます。
            </h2>
            <p className="text-[15px] text-[#595959] mt-4 leading-[1.9]">
              日報、経営数字の確認、スタッフ共有。いま院長が「診療以外」に使っている時間を入れると、Tiramisu導入時の削減余地をざっくり試算できます。
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[1.1fr_0.9fr] gap-8 items-start">
            <div className="bg-[#F3EFE8] border border-[#E8E4DE] rounded-[12px] p-6 md:p-8">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <EfficiencySlider
                  label="日報に使っている時間 / 日"
                  value={calculatorInputs.dailyReportMinutes}
                  min={0}
                  max={90}
                  suffix="分"
                  onChange={(value) => updateCalculatorInput('dailyReportMinutes', value)}
                />
                <EfficiencySlider
                  label="経営分析に使っている時間 / 日"
                  value={calculatorInputs.analysisMinutes}
                  min={0}
                  max={120}
                  suffix="分"
                  onChange={(value) => updateCalculatorInput('analysisMinutes', value)}
                />
                <EfficiencySlider
                  label="スタッフ共有・確認に使っている時間 / 日"
                  value={calculatorInputs.communicationMinutes}
                  min={0}
                  max={90}
                  suffix="分"
                  onChange={(value) => updateCalculatorInput('communicationMinutes', value)}
                />
                <EfficiencySlider
                  label="月の営業日数"
                  value={calculatorInputs.workingDays}
                  min={12}
                  max={31}
                  suffix="日"
                  onChange={(value) => updateCalculatorInput('workingDays', value)}
                />
                <EfficiencySlider
                  label="平均顧客単価"
                  value={calculatorInputs.averageUnitPrice}
                  min={3000}
                  max={15000}
                  step={500}
                  suffix="円"
                  onChange={(value) => updateCalculatorInput('averageUnitPrice', value)}
                />
                <EfficiencySlider
                  label="1時間あたり対応できる患者数"
                  value={calculatorInputs.patientsPerHour}
                  min={0.5}
                  max={4}
                  step={0.5}
                  suffix="人"
                  onChange={(value) => updateCalculatorInput('patientsPerHour', value)}
                />
              </div>

              <div className="mt-8">
                <p className="text-[13px] font-bold text-[#1A1A1A] mb-3">削減シナリオ</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {EFFICIENCY_SCENARIOS.map((scenario) => (
                    <button
                      key={scenario.id}
                      onClick={() => updateCalculatorInput('scenarioId', scenario.id)}
                      className={`rounded-[8px] border px-4 py-3 text-left transition-colors ${
                        calculatorInputs.scenarioId === scenario.id
                          ? 'border-[#C4956C] bg-[#C4956C]/10 text-[#1A1A1A]'
                          : 'border-[#E8E4DE] bg-white text-[#595959] hover:border-[#C4956C]/50'
                      }`}
                    >
                      <p className="text-[12px] font-bold">{scenario.label}</p>
                      <p className="text-[11px] mt-1">{Math.round(scenario.reductionRate * 100)}%削減</p>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="bg-[#2B3A3F] text-white rounded-[12px] p-6 md:p-8 shadow-[0_20px_50px_-30px_rgba(0,0,0,0.25)]">
              <p className="font-inter text-[11px] tracking-[0.18em] uppercase text-white/50 font-bold">Estimated Impact</p>
              <div className="mt-6 space-y-5">
                <div className="pb-5 border-b border-white/10">
                  <p className="text-[12px] text-white/60 mb-1">現在の月間バックオフィス時間</p>
                  <p className="font-inter text-[36px] font-bold leading-none">{currentBackofficeHours.toFixed(1)}<span className="text-[16px] ml-1 font-normal">時間</span></p>
                </div>
                <div className="pb-5 border-b border-white/10">
                  <p className="text-[12px] text-white/60 mb-1">毎月削減できる見込み時間</p>
                  <p className="font-inter text-[36px] font-bold leading-none text-[#E8B87A]">{monthlySavedHours.toFixed(1)}<span className="text-[16px] ml-1 font-normal">時間</span></p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-[12px] text-white/60 mb-1">年間で戻る時間</p>
                    <p className="font-inter text-[24px] font-bold leading-none">{yearlySavedHours.toFixed(1)}<span className="text-[13px] ml-1 font-normal">時間</span></p>
                  </div>
                  <div>
                    <p className="text-[12px] text-white/60 mb-1">追加売上ポテンシャル / 月</p>
                    <p className="font-inter text-[24px] font-bold leading-none">¥{Math.round(revenuePotential).toLocaleString()}</p>
                  </div>
                </div>
              </div>

              <p className="text-[12px] text-white/65 leading-[1.8] mt-8">
                ※ 追加売上ポテンシャルは、浮いた時間を新患対応・リピート施策・スタッフ育成に充てた場合の試算です。患者枠や施術キャパシティによって実際の効果は異なります。
              </p>
              <p className="text-[12px] text-white/50 leading-[1.8] mt-2">
                ※ これは LP 上の簡易試算です。実際の効果は院の運用状況、予約率、単価、活用度によって変わります。
              </p>

              <button
                onClick={scrollToForm}
                className="mt-6 w-full px-6 py-3.5 bg-white text-[#2B3A3F] text-[14px] font-bold rounded-[6px] inline-flex items-center justify-center gap-2 hover:bg-[#F3EFE8] transition-colors"
              >
                この削減余地を自院で試したい <ArrowRight size={14} />
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ================= REGISTRATION FORM ================= */}
      <section id="registration-form" className="w-full bg-[#F3EFE8] py-20 md:py-28 scroll-mt-24">
        <div className="max-w-[720px] mx-auto px-6 mobile-tight">
          
          <div className="text-center mb-10">
            <p className="font-inter text-[11px] text-[#C4956C] tracking-[0.2em] uppercase mb-3 font-bold">Registration</p>
            <h2 className="font-serif-jp text-[28px] md:text-[38px] font-bold text-[#1A1A1A] tracking-[-0.02em] mb-3 leading-[1.3]">
              先行登録（2分で完了）
            </h2>
            <p className="text-[13px] text-[#595959] max-w-md mx-auto">
              30%オフ永久は先着200院限定。現在残り<span className="font-bold text-[#C4956C]">{discountRemaining}</span>枠です。
            </p>
          </div>

          <div className="bg-white rounded-[8px] shadow-[0_8px_30px_-10px_rgba(0,0,0,0.06)] p-6 md:p-10 border border-[#E8E4DE]">
            <RegistrationFormFields formState={formState} formError={formError} handleFormSubmit={handleFormSubmit} />
          </div>

          <p className="text-[12px] text-[#595959] text-center mt-6 leading-[1.7]">
            <Shield size={12} className="inline mr-1 -mt-0.5" />
            送信情報は先行登録管理にのみ利用。第三者提供なし。
          </p>
        </div>
      </section>

      {/* ================= FAQ ================= */}
      <section className="w-full bg-white py-20 md:py-28 border-t border-[#E8E4DE]">
        <div className="max-w-[800px] mx-auto px-6 mobile-tight">
          <p className="font-inter text-[11px] text-[#C4956C] tracking-[0.2em] uppercase mb-3 font-bold text-center">FAQ</p>
          <h2 className="font-serif-jp text-[26px] md:text-[32px] font-bold text-[#1A1A1A] text-center mb-12">
            よくあるご質問
          </h2>

          <div className="flex flex-col border-t border-[#E8E4DE]">
            {FAQ_ITEMS.map((faq, idx) => {
              const isOpen = openFAQ === idx;
              const buttonId = `faq-trigger-${idx}`;
              const panelId = `faq-panel-${idx}`;
              return (
                <div key={idx} className="border-b border-[#E8E4DE]">
                  <h3 className="m-0">
                    <button
                      id={buttonId}
                      type="button"
                      aria-expanded={isOpen}
                      aria-controls={panelId}
                      onClick={() => setOpenFAQ(isOpen ? null : idx)}
                      className="w-full text-left py-5 md:py-6 flex justify-between items-center group focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#C4956C]"
                    >
                      <span className="font-serif-jp font-bold text-[#1A1A1A] text-[15px] md:text-[16px] group-hover:text-[#C4956C] transition-colors pr-6 leading-[1.5]">
                        {faq.q}
                      </span>
                      <span
                        aria-hidden="true"
                        className={`transform transition-transform duration-300 text-[#2B3A3F] flex-shrink-0 ${isOpen ? 'rotate-45' : ''}`}
                      >
                        <Plus size={18} />
                      </span>
                    </button>
                  </h3>
                  <div
                    id={panelId}
                    role="region"
                    aria-labelledby={buttonId}
                    hidden={!isOpen}
                    className={`overflow-hidden transition-all duration-300 ease-in-out ${isOpen ? 'max-h-96 opacity-100 pb-5' : 'max-h-0 opacity-0'}`}
                  >
                    <p className="text-[#595959] text-[14px] leading-[1.9] pl-3 border-l-2 border-[#C4956C]/30">
                      {faq.a}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ================= FOOTER ================= */}
      <footer className="w-full bg-[#2B3A3F] pt-16 pb-24 md:pb-8 mobile-bottom-safe text-[#FAF8F5]">
        <div className="max-w-[1120px] mx-auto px-6 mobile-tight">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-10 md:gap-8 mb-12">
            
            <div className="flex flex-col gap-4">
              <span className="font-serif-en text-[32px] font-bold tracking-tight leading-none">Tiramisu</span>
              <p className="text-[13px] text-[#FAF8F5]/70 leading-[1.7]">
                整骨院のAI経営パートナー
              </p>
              <div className="mt-2 text-[12px] text-[#FAF8F5]/60 font-mono">
                <p>Founder / 岩沢 太</p>
              </div>
            </div>

            <div className="flex flex-col gap-2.5">
              <p className="font-inter text-[11px] mb-2 tracking-widest text-[#FAF8F5]/50 font-bold uppercase">Links</p>
              {[
                { label: "先行登録", action: () => navigateToPage('preRegister') },
                { label: "AIチャットを試す", action: () => navigateToPage('aiChat') },
                { label: "開発者に相談", action: () => navigateToPage('developerContact') },
                { label: "プライバシーポリシー", action: () => navigateToPage('privacy') },
                { label: "利用規約", action: () => navigateToPage('terms') },
                { label: "特定商取引法に基づく表記", action: () => navigateToPage('commerce') },
              ].map((link) => (
                <button
                  key={link.label}
                  onClick={link.action}
                  className="text-[13px] text-[#FAF8F5]/80 hover:text-white transition-colors w-fit text-left"
                >
                  {link.label}
                </button>
              ))}
            </div>

            <div className="flex flex-col gap-2.5">
              <p className="font-inter text-[11px] mb-2 tracking-widest text-[#FAF8F5]/50 font-bold uppercase">Contact</p>
              <a href="mailto:founder@tiramisu.clinic" className="text-[13px] text-[#FAF8F5]/80 hover:text-white transition-colors font-inter">
                founder@tiramisu.clinic
              </a>
              <p className="text-[12px] text-[#FAF8F5]/60 mt-2 leading-[1.7]">
                〒150-0002<br />
                東京都渋谷区〇〇 1-2-3
              </p>
              <div className="mt-3 px-3 py-2 bg-white/10 rounded-[4px] border border-white/10 text-[11px] text-[#FAF8F5]/80 w-fit">
                warm intro 大歓迎です
              </div>
            </div>
          </div>

          <div className="border-t border-white/10 pt-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
            <p className="text-[11px] font-mono text-[#FAF8F5]/40">
              © 2026 Tiramisu. All rights reserved.
            </p>
            <p className="text-[10px] text-[#FAF8F5]/30 font-mono">
              Last updated: {lpData.lastUpdated}
            </p>
          </div>
        </div>
      </footer>

      {/* ================= STICKY BOTTOM CTA ================= */}
      <div 
        className={`fixed bottom-0 left-0 w-full bg-white/95 backdrop-blur-md border-t border-[#E8E4DE] py-3 px-4 md:px-6 z-50 transition-transform duration-500 shadow-[0_-4px_20px_rgba(0,0,0,0.05)] ${showStickyCTA ? 'translate-y-0' : 'translate-y-[100%]'}`}
      >
        <div className="w-full max-w-[1120px] mx-auto flex justify-between items-center gap-3">
          <div className="hidden md:flex flex-col">
            <p className="text-[13px] font-bold text-[#1A1A1A]">単院¥8,400/月〜（30%オフ永久）</p>
            <p className="text-[11px] text-[#595959]">残り <span className="font-inter font-bold text-[#C4956C]">{discountRemaining}</span> 院</p>
          </div>
          <div className="md:hidden flex flex-col">
            <p className="text-[11px] text-[#595959]">先着残り枠</p>
            <p className="text-[14px] font-inter font-bold text-[#C4956C]">{discountRemaining}院</p>
          </div>
          <div className="flex flex-1 md:flex-initial gap-2">
            <button
              onClick={scrollToAiConsult}
              className="flex-1 md:flex-initial md:w-auto px-4 md:px-5 py-3 bg-transparent border border-[#2B3A3F]/20 text-[#2B3A3F] text-[13px] md:text-[14px] font-bold rounded-[4px] hover:bg-[#2B3A3F]/5 transition-colors flex justify-center items-center gap-2"
            >
              AIに質問 <Brain size={14} />
            </button>
            <button 
              onClick={scrollToForm}
              className="flex-1 md:flex-initial md:w-auto px-6 py-3 bg-[#2B3A3F] text-white text-[14px] font-bold rounded-[4px] shadow-sm hover:bg-[#1f292d] transition-colors flex justify-center items-center gap-2"
            >
              先行登録する <ArrowRight size={14} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
