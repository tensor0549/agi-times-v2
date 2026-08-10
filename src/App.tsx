import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight, BookOpen, Check, ChevronRight, Clock3, Command, ExternalLink,
  Code2, Globe2, Menu, MessageSquareText, Moon, Search, Sparkles, Sun, X,
} from 'lucide-react';
import { submitFeedback, track } from './lib/analytics';

type Lang = 'zh' | 'en';
type Theme = 'light' | 'dark';
type Category = 'all' | 'models' | 'research' | 'products' | 'industry' | 'policy' | 'open-source';
type Localized = { zh: string; en: string };
type Story = {
  id: string; category: Exclude<Category, 'all'>; title: Localized; summary: Localized;
  source: string; time: Localized; url: string; featured?: boolean; signal: Localized;
};

const copy = {
  zh: {
    nav: ['最新', '洞察', '研究', '产品', '开源'], latest: '实时情报', heroEyebrow: '今日重点 · 编辑精选',
    search: '搜索公司、人物、论文或主题…', searchShort: '搜索', command: '按 / 快速搜索',
    all: '全部', models: '模型', research: '研究', products: '产品', industry: '产业', policy: '政策', 'open-source': '开源',
    live: '数据接入中', updated: '预览数据 · 上线前将由实时信息流替换', read: '阅读全文', feed: '最新动态', feedSub: '来自全球可信来源的逐条更新',
    insight: '今日洞察', insightTitle: '推理成本曲线，正在重写 AI 产品的边界',
    insightBody: '更低的单位推理成本并不只是让现有功能变便宜。它会把过去只能异步完成的工作流，推向实时、持续运行的智能系统。真正的产品分水岭，将从“有没有模型”转向“能否把高频推理嵌入可靠的工作流”。',
    evidence: '趋势信号', readInsight: '查看洞察与来源', sources: '来源与延伸阅读',
    empty: '没有匹配的内容', emptySub: '试试更短的关键词或切换分类。', clear: '清除筛选',
    feedback: '反馈', feedbackTitle: '帮助我们做得更好', feedbackSub: '问题、建议或遗漏的来源，我们都会认真查看。',
    feedbackPlaceholder: '告诉我们发生了什么…', email: '邮箱（选填）', cancel: '取消', send: '发送反馈', sent: '已收到，谢谢你的反馈。',
    footer: '面向认真读者的 AGI 情报系统', coverage: '实时信息源接入中',
  },
  en: {
    nav: ['Latest', 'Insights', 'Research', 'Products', 'Open source'], latest: 'Live intelligence', heroEyebrow: "Today's brief · Editor's pick",
    search: 'Search companies, people, papers, or topics…', searchShort: 'Search', command: 'Press / to search',
    all: 'All', models: 'Models', research: 'Research', products: 'Products', industry: 'Industry', policy: 'Policy', 'open-source': 'Open source',
    live: 'Data integration in progress', updated: 'Preview data · replaced by the live feed before launch', read: 'Read the story', feed: 'The latest', feedSub: 'Item-level updates from trusted sources worldwide',
    insight: 'Today’s insight', insightTitle: 'The inference cost curve is redrawing the limits of AI products',
    insightBody: 'Cheaper inference does more than reduce the bill for existing features. It turns formerly asynchronous workflows into real-time, continuously running systems. The product divide is shifting from access to models toward the ability to embed frequent inference in dependable workflows.',
    evidence: 'Trend signal', readInsight: 'View insight and sources', sources: 'Sources & further reading',
    empty: 'No matching intelligence', emptySub: 'Try a shorter query or switch categories.', clear: 'Clear filters',
    feedback: 'Feedback', feedbackTitle: 'Help us make AGI Times better', feedbackSub: 'Share a bug, an idea, or a source we missed. We read every note.',
    feedbackPlaceholder: 'Tell us what happened…', email: 'Email (optional)', cancel: 'Cancel', send: 'Send feedback', sent: 'Received — thank you for helping.',
    footer: 'AGI intelligence for people who take it seriously', coverage: 'Live source integration in progress',
  },
} as const;

const stories: Story[] = [
  {
    id: 'openai-gpt5', category: 'models', featured: true, source: 'OpenAI',
    title: { zh: 'GPT-5 正式发布：推理、编码与可靠性进入统一系统', en: 'GPT-5 arrives as a unified system for reasoning, coding, and reliability' },
    summary: { zh: 'OpenAI 将快速回答与深度推理整合进单一体验，并通过路由系统按任务复杂度自动分配计算。', en: 'OpenAI combines fast responses and deeper reasoning in one experience, with routing that allocates compute by task complexity.' },
    time: { zh: '官方公告', en: 'Official announcement' }, url: 'https://openai.com/index/introducing-gpt-5/',
    signal: { zh: '官方发布', en: 'Primary source' },
  },
  {
    id: 'anthropic-claude4', category: 'models', source: 'Anthropic',
    title: { zh: 'Claude 4：面向长时运行代理与复杂编码任务', en: 'Claude 4 targets long-running agents and complex coding work' },
    summary: { zh: '新一代 Opus 与 Sonnet 模型聚焦持续推理、工具使用和软件工程。', en: 'The new Opus and Sonnet models focus on sustained reasoning, tool use, and software engineering.' },
    time: { zh: '官方公告', en: 'Official announcement' }, url: 'https://www.anthropic.com/news/claude-4', signal: { zh: '模型发布', en: 'Model release' },
  },
  {
    id: 'deepmind-alphafold', category: 'research', source: 'Google DeepMind',
    title: { zh: 'AlphaFold 的下一步：从结构预测走向生物学发现平台', en: 'AlphaFold’s next chapter moves from structure prediction to discovery' },
    summary: { zh: '研究团队梳理蛋白质结构模型如何嵌入药物与基础生物学工作流。', en: 'The research team maps how protein-structure models are becoming part of drug and basic-biology workflows.' },
    time: { zh: '官方博客', en: 'Official blog' }, url: 'https://deepmind.google/discover/blog/alphafold-a-gift-to-humanity/', signal: { zh: '研究进展', en: 'Research' },
  },
  {
    id: 'github-copilot-agent', category: 'products', source: 'GitHub',
    title: { zh: 'GitHub Copilot 编码代理进入公开预览', en: 'GitHub Copilot coding agent enters public preview' },
    summary: { zh: '代理可接手 Issue，在隔离环境中修改代码并提交可审阅的 Pull Request。', en: 'The agent can take an issue, edit code in an isolated environment, and open a pull request for review.' },
    time: { zh: '产品公告', en: 'Product announcement' }, url: 'https://github.blog/news-insights/product-news/github-copilot-meet-the-new-coding-agent/', signal: { zh: '产品更新', en: 'Product update' },
  },
  {
    id: 'hf-smollm', category: 'open-source', source: 'Hugging Face',
    title: { zh: 'SmolLM3 发布：小模型继续缩小本地智能的能力差距', en: 'SmolLM3 narrows the capability gap for local intelligence' },
    summary: { zh: '开放权重、训练细节与评测结果，为端侧和私有部署提供新的基线。', en: 'Open weights, training details, and evaluations provide a new baseline for private and on-device deployment.' },
    time: { zh: '官方发布', en: 'Official release' }, url: 'https://huggingface.co/blog/smollm3', signal: { zh: '开源发布', en: 'Open release' },
  },
  {
    id: 'eu-ai-act', category: 'policy', source: 'European Commission',
    title: { zh: '欧盟发布通用 AI 模型合规实施指引', en: 'EU publishes implementation guidance for general-purpose AI models' },
    summary: { zh: '文件细化透明度、版权与系统性风险义务，为模型提供者给出执行路径。', en: 'The guidance clarifies transparency, copyright, and systemic-risk duties for model providers.' },
    time: { zh: '政策文件', en: 'Policy document' }, url: 'https://digital-strategy.ec.europa.eu/en/library/code-practice-general-purpose-ai-models', signal: { zh: '政策原文', en: 'Policy source' },
  },
];

const categories: Category[] = ['all', 'models', 'research', 'products', 'industry', 'policy', 'open-source'];

function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => {
    const saved = localStorage.getItem('agi-theme') as Theme | null;
    return saved || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  });
  useEffect(() => { document.documentElement.dataset.theme = theme; localStorage.setItem('agi-theme', theme); }, [theme]);
  return [theme, setTheme] as const;
}

export function App() {
  const [lang, setLang] = useState<Lang>(() => (localStorage.getItem('agi-lang') as Lang) || 'zh');
  const [theme, setTheme] = useTheme();
  const [category, setCategory] = useState<Category>('all');
  const [query, setQuery] = useState('');
  const [mobileOpen, setMobileOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedbackSent, setFeedbackSent] = useState(false);
  const [feedbackError, setFeedbackError] = useState('');
  const [feedbackBusy, setFeedbackBusy] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const t = copy[lang];

  useEffect(() => { document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en'; localStorage.setItem('agi-lang', lang); }, [lang]);
  useEffect(() => { track('page_viewed', { theme, language: lang }); }, []);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === '/' && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
        event.preventDefault(); searchRef.current?.focus();
      }
      if (event.key === 'Escape') { setFeedbackOpen(false); setMobileOpen(false); }
    };
    addEventListener('keydown', onKey); return () => removeEventListener('keydown', onKey);
  }, []);

  const results = useMemo(() => stories.filter((story) => {
    const inCategory = category === 'all' || story.category === category;
    const haystack = `${story.title.zh} ${story.title.en} ${story.summary.zh} ${story.summary.en} ${story.source}`.toLowerCase();
    return inCategory && haystack.includes(query.trim().toLowerCase());
  }), [category, query]);
  const featured = stories[0];

  async function handleFeedback(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setFeedbackBusy(true); setFeedbackError('');
    try {
      await submitFeedback({ message: String(form.get('message') || ''), email: String(form.get('email') || ''), locale: lang, context: { theme } });
      setFeedbackSent(true);
    } catch {
      setFeedbackError(lang === 'zh' ? '暂时无法发送，请稍后重试。' : 'Could not send right now. Please try again.');
    } finally { setFeedbackBusy(false); }
  }

  return <div className="app-shell">
    <a className="skip-link" href="#main">{lang === 'zh' ? '跳至主要内容' : 'Skip to content'}</a>
    <header className="site-header">
      <div className="header-inner">
        <a href="#top" className="wordmark" aria-label="AGI Times home"><span className="mark">A</span><span>AGI Times</span></a>
        <nav className="desktop-nav" aria-label="Primary">
          {t.nav.map((item, i) => <a className={i === 0 ? 'active' : ''} href={i === 1 ? '#insight' : '#feed'} key={item}>{item}</a>)}
        </nav>
        <div className="header-actions">
          <button className="icon-button search-trigger" onClick={() => searchRef.current?.focus()} aria-label={t.searchShort}><Search size={18}/></button>
          <button className="language-toggle" onClick={() => { const next = lang === 'zh' ? 'en' : 'zh'; setLang(next); track('language_changed', { from: lang, to: next }); }} aria-label={lang === 'zh' ? 'Switch to English' : '切换至中文'}><Globe2 size={16}/><span>{lang === 'zh' ? 'EN' : '中'}</span></button>
          <button className="icon-button" onClick={() => { const next = theme === 'light' ? 'dark' : 'light'; setTheme(next); track('theme_changed', { from: theme, to: next }); }} aria-label={lang === 'zh' ? `切换至${theme === 'light' ? '深色' : '浅色'}模式` : `Use ${theme === 'light' ? 'dark' : 'light'} theme`}>{theme === 'light' ? <Moon size={18}/> : <Sun size={18}/>}</button>
          <button className="icon-button mobile-menu" onClick={() => setMobileOpen(!mobileOpen)} aria-expanded={mobileOpen} aria-controls="mobile-nav">{mobileOpen ? <X size={20}/> : <Menu size={20}/>}</button>
        </div>
      </div>
      {mobileOpen && <nav id="mobile-nav" className="mobile-nav" aria-label="Mobile navigation">{t.nav.map((item, i) => <a onClick={() => setMobileOpen(false)} href={i === 1 ? '#insight' : '#feed'} key={item}>{item}<ChevronRight size={17}/></a>)}</nav>}
    </header>

    <main id="main">
      <section className="hero" id="top">
        <div className="ambient ambient-one"/><div className="ambient ambient-two"/>
        <div className="container hero-grid">
          <div className="hero-copy">
            <div className="eyebrow"><span className="live-dot"/>{t.heroEyebrow}</div>
            <h1>{featured.title[lang]}</h1>
            <p>{featured.summary[lang]}</p>
            <div className="hero-meta"><span className="source-logo">O</span><strong>{featured.source}</strong><span>·</span><span>{featured.time[lang]}</span><span className="verified"><Check size={12}/>{featured.signal[lang]}</span></div>
            <a className="primary-link" href={featured.url} target="_blank" rel="noreferrer" onClick={() => track('article_opened', { article_id: featured.id, source: featured.source })}>{t.read}<ArrowRight size={17}/></a>
          </div>
          <div className="signal-panel" aria-label="Live coverage summary">
            <div className="signal-top"><div><span className="mini-label">AGI PULSE</span><strong>{t.live}</strong></div><div className="pulse-orbit"><Sparkles size={22}/></div></div>
            <div className="signal-chart" aria-hidden="true"><svg viewBox="0 0 440 120" preserveAspectRatio="none"><defs><linearGradient id="area" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="var(--accent)" stopOpacity=".32"/><stop offset="1" stopColor="var(--accent)" stopOpacity="0"/></linearGradient></defs><path className="chart-area" d="M0,102 C35,96 48,78 75,81 C112,86 121,63 153,67 C190,71 200,54 228,59 C267,65 280,29 315,38 C350,47 362,20 395,26 C417,29 428,14 440,9 L440,120 L0,120 Z"/><path className="chart-line" d="M0,102 C35,96 48,78 75,81 C112,86 121,63 153,67 C190,71 200,54 228,59 C267,65 280,29 315,38 C350,47 362,20 395,26 C417,29 428,14 440,9"/></svg></div>
            <div className="signal-stats"><div><b>AI</b><span>{lang === 'zh' ? '公司动态' : 'company updates'}</span></div><div><b>↗</b><span>{lang === 'zh' ? '研究进展' : 'research progress'}</span></div><div><b>⌘</b><span>{lang === 'zh' ? '开源项目' : 'open projects'}</span></div></div>
            <div className="signal-footer"><Clock3 size={14}/>{t.updated}</div>
          </div>
        </div>
      </section>

      <section className="discovery container" aria-label="Content discovery">
        <div className="search-box"><Search size={20}/><input ref={searchRef} value={query} onChange={e => { setQuery(e.target.value); if (e.target.value.trim().length === 2) track('search_performed', { query_length: e.target.value.trim().length }); }} placeholder={t.search} aria-label={t.search}/>{query && <button onClick={() => setQuery('')} aria-label="Clear search"><X size={17}/></button>}<span className="key-hint"><Command size={13}/> K</span></div>
        <div className="category-row" role="group" aria-label="Categories">{categories.map(cat => <button key={cat} className={category === cat ? 'selected' : ''} onClick={() => { setCategory(cat); track('filter_changed', { category: cat }); }}>{t[cat]}</button>)}</div>
      </section>

      <section className="content-grid container" id="feed">
        <div className="feed-column">
          <div className="section-heading"><div><span className="section-kicker">{t.latest}</span><h2>{t.feed}</h2><p>{t.feedSub}</p></div><span className="result-count">{results.length.toString().padStart(2, '0')}</span></div>
          <div className="story-list" aria-live="polite">
            {results.map(story => <article className="story-card" key={story.id}>
              <div className="story-rail"><span className="source-avatar">{story.source.charAt(0)}</span><span className="rail-line"/></div>
              <div className="story-content">
                <div className="story-meta"><span>{story.source}</span><span>·</span><span>{story.time[lang]}</span><span className="tag">{t[story.category]}</span></div>
                <h3><a href={story.url} target="_blank" rel="noreferrer" onClick={() => track('article_opened', { article_id: story.id, source: story.source })}>{story.title[lang]}<ExternalLink className="external" size={14}/></a></h3>
                <p>{story.summary[lang]}</p>
                <div className="story-bottom"><span className="story-signal"><Check size={12}/>{story.signal[lang]}</span><a href={story.url} target="_blank" rel="noreferrer" aria-label={`${t.read}: ${story.title[lang]}`}><ArrowRight size={16}/></a></div>
              </div>
            </article>)}
            {results.length === 0 && <div className="empty-state"><Search size={28}/><h3>{t.empty}</h3><p>{t.emptySub}</p><button onClick={() => { setQuery(''); setCategory('all'); }}>{t.clear}</button></div>}
          </div>
        </div>

        <aside className="insight-card" id="insight">
          <div className="insight-head"><span><Sparkles size={15}/>{t.insight}</span><span>{lang === 'zh' ? '内容预览' : 'CONTENT PREVIEW'}</span></div>
          <div className="insight-visual"><div className="orb orb-a"/><div className="orb orb-b"/><div className="orb-core"><span>↓</span><small>{lang === 'zh' ? '推理成本趋势' : 'inference cost trend'}</small></div></div>
          <h2>{t.insightTitle}</h2><p>{t.insightBody}</p>
          <div className="evidence"><span className="mini-label">{t.evidence}</span><div className="evidence-row"><div className="evidence-bar"><i style={{width:'72%'}}/></div><span>{lang === 'zh' ? '下降' : 'declining'}</span></div><small>{lang === 'zh' ? '方向性信号；具体口径请查看原始报告' : 'Directional signal; see the original reports for methodology'}</small></div>
          <div className="citation-row"><BookOpen size={15}/><span>{t.sources}</span><span><a href="https://hai.stanford.edu/ai-index/2025-ai-index-report" target="_blank" rel="noreferrer">Stanford AI Index 2025</a> · <a href="https://epoch.ai/trends" target="_blank" rel="noreferrer">Epoch AI Trends</a></span></div>
          <a className="insight-link" href="#insight" onClick={() => track('insight_opened', { insight_id: 'inference-cost-curve-preview' })}>{t.readInsight}<ArrowRight size={16}/></a>
        </aside>
      </section>
    </main>

    <footer><div className="container footer-inner"><div><div className="wordmark footer-mark"><span className="mark">A</span><span>AGI Times</span></div><p>{t.footer}</p></div><div className="footer-status"><span className="live-dot"/>{t.coverage}</div><div className="footer-links"><a href="#feed">RSS</a><a href="https://github.com" target="_blank" rel="noreferrer"><Code2 size={17}/>GitHub</a><button onClick={() => { setFeedbackOpen(true); track('feedback_opened', { placement: 'footer' }); }}><MessageSquareText size={17}/>{t.feedback}</button></div></div></footer>

    <button className="feedback-fab" onClick={() => { setFeedbackOpen(true); track('feedback_opened', { placement: 'floating_button' }); }}><MessageSquareText size={18}/><span>{t.feedback}</span></button>
    {feedbackOpen && <div className="modal-backdrop" role="presentation" onMouseDown={e => { if (e.currentTarget === e.target) setFeedbackOpen(false); }}><div className="feedback-modal" role="dialog" aria-modal="true" aria-labelledby="feedback-title"><button className="modal-close" onClick={() => setFeedbackOpen(false)} aria-label={lang === 'zh' ? '关闭' : 'Close'}><X size={19}/></button>{feedbackSent ? <div className="sent-state"><span><Check size={25}/></span><h2>{t.sent}</h2></div> : <><span className="modal-icon"><MessageSquareText size={20}/></span><h2 id="feedback-title">{t.feedbackTitle}</h2><p>{t.feedbackSub}</p><form onSubmit={handleFeedback}><textarea name="message" required autoFocus minLength={3} placeholder={t.feedbackPlaceholder}/><input name="email" type="email" placeholder={t.email}/>{feedbackError && <div className="form-error" role="alert">{feedbackError}</div>}<div className="form-actions"><button type="button" onClick={() => setFeedbackOpen(false)}>{t.cancel}</button><button className="submit-button" type="submit" disabled={feedbackBusy}>{feedbackBusy ? (lang === 'zh' ? '发送中…' : 'Sending…') : t.send}<ArrowRight size={15}/></button></div></form></>}</div></div>}
  </div>;
}
