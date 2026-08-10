import { FormEvent, MouseEvent as ReactMouseEvent, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight, BookOpen, Check, ChevronRight, Clock3, Command, ExternalLink,
  Code2, Globe2, Menu, MessageSquareText, Moon, Search, Sparkles, Sun, X,
} from 'lucide-react';
import { submitFeedback, track } from './lib/analytics';
import feedData from '../content/feed.json';
import insightData from '../content/insights.json';
import registryData from '../content/registry.json';

type Lang = 'zh' | 'en';
type Theme = 'light' | 'dark';
type Category = 'all' | 'models' | 'research' | 'products' | 'industry' | 'policy' | 'open-source';
type Localized = { zh: string; en: string };
type Story = {
  id: string; category: Exclude<Category, 'all'>; title: Localized; summary: Localized;
  source: string; time: string; url: string; featured?: boolean; signal: Localized;
};

type ContentLocale = { en: string; 'zh-Hans': string };
type FeedItem = { id: string; canonicalUrl: string; publishedAt: string; title: ContentLocale; summary: ContentLocale; category: string; org: string; source: { name: string }; featured?: boolean; verification?: string };
type InsightItem = { id: string; title: ContentLocale; dek: ContentLocale; body: ContentLocale; publishedAt: string; claims: Array<{ id: string; text: ContentLocale; citationIds: string[]; confidence: number }>; sources: Array<{ id: string; title: string; url: string; publisher: string; evidenceSnippet: string }> };
type RegistrySource = { id: string; kind: 'organization' | 'media' | 'person' | 'project'; name: string; url: string; category: string; platform: string };

const localized = (value: ContentLocale | { en: string; zh: string }): Localized => ({ en: value.en, zh: 'zh-Hans' in value ? value['zh-Hans'] : value.zh });
const mapCategory = (value: string): Exclude<Category, 'all'> => {
  if (value.includes('model')) return 'models';
  if (value.includes('research') || value.includes('safety')) return 'research';
  if (value.includes('product') || value.includes('agent')) return 'products';
  if (value.includes('policy')) return 'policy';
  if (value.includes('open')) return 'open-source';
  return 'industry';
};
const formatDate = (iso: string, lang: Lang) => new Intl.DateTimeFormat(lang === 'zh' ? 'zh-CN' : 'en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(new Date(iso));
const formatGeneratedAt = (iso: string, lang: Lang) => new Intl.DateTimeFormat(lang === 'zh' ? 'zh-CN' : 'en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'UTC', timeZoneName: 'short' }).format(new Date(iso));

const copy = {
  zh: {
    nav: ['最新', '洞察', '研究', '产品', '开源'], latest: '实时情报', heroEyebrow: '今日重点 · 编辑精选',
    search: '搜索公司、人物、论文或主题…', searchShort: '搜索', command: '按 / 快速搜索',
    all: '全部', models: '模型', research: '研究', products: '产品', industry: '产业', policy: '政策', 'open-source': '开源',
    live: '已核验信息流', updated: '信息流生成于', read: '阅读全文', feed: '最新动态', feedSub: '来自全球可信来源的逐条更新',
    insight: '今日洞察', insightTitle: '推理成本曲线，正在重写 AI 产品的边界',
    insightBody: '更低的单位推理成本并不只是让现有功能变便宜。它会把过去只能异步完成的工作流，推向实时、持续运行的智能系统。真正的产品分水岭，将从“有没有模型”转向“能否把高频推理嵌入可靠的工作流”。',
    evidence: '趋势信号', readInsight: '查看洞察与来源', sources: '来源与延伸阅读',
    empty: '没有匹配的内容', emptySub: '试试更短的关键词或切换分类。', clear: '清除筛选',
    feedback: '反馈', feedbackTitle: '帮助我们做得更好', feedbackSub: '问题、建议或遗漏的来源，我们都会认真查看。',
    feedbackPlaceholder: '告诉我们发生了什么…', email: '邮箱（选填）', cancel: '取消', send: '发送反馈', sent: '已收到，谢谢你的反馈。',
    footer: '面向认真读者的 AGI 情报系统', coverage: '个一手来源已核验',
  },
  en: {
    nav: ['Latest', 'Insights', 'Research', 'Products', 'Open source'], latest: 'Live intelligence', heroEyebrow: "Today's brief · Editor's pick",
    search: 'Search companies, people, papers, or topics…', searchShort: 'Search', command: 'Press / to search',
    all: 'All', models: 'Models', research: 'Research', products: 'Products', industry: 'Industry', policy: 'Policy', 'open-source': 'Open source',
    live: 'Verified intelligence feed', updated: 'Feed generated', read: 'Read the story', feed: 'The latest', feedSub: 'Item-level updates from trusted sources worldwide',
    insight: 'Today’s insight', insightTitle: 'The inference cost curve is redrawing the limits of AI products',
    insightBody: 'Cheaper inference does more than reduce the bill for existing features. It turns formerly asynchronous workflows into real-time, continuously running systems. The product divide is shifting from access to models toward the ability to embed frequent inference in dependable workflows.',
    evidence: 'Trend signal', readInsight: 'View insight and sources', sources: 'Sources & further reading',
    empty: 'No matching intelligence', emptySub: 'Try a shorter query or switch categories.', clear: 'Clear filters',
    feedback: 'Feedback', feedbackTitle: 'Help us make AGI Times better', feedbackSub: 'Share a bug, an idea, or a source we missed. We read every note.',
    feedbackPlaceholder: 'Tell us what happened…', email: 'Email (optional)', cancel: 'Cancel', send: 'Send feedback', sent: 'Received — thank you for helping.',
    footer: 'AGI intelligence for people who take it seriously', coverage: 'verified first-party sources',
  },
} as const;

const mapFeedItems = (items: Array<Record<string, any>>): Story[] => items.map((item) => ({
  id: String(item.id),
  category: mapCategory(String(item.category || item.topics?.[0] || item.type || 'industry')),
  featured: Boolean(item.featured),
  source: String(item.org || item.source?.name || 'AGI Times'),
  title: localized(item.title as ContentLocale | { en: string; zh: string }),
  summary: localized(item.summary as ContentLocale | { en: string; zh: string }),
  time: String(item.publishedAt),
  url: String(item.canonicalUrl || item.url),
  signal: { zh: item.verification === 'verified_first_party' ? '一手来源已核验' : '来源已核验', en: item.verification === 'verified_first_party' ? 'Verified first party' : 'Source verified' },
}));
const bundledStories = mapFeedItems(feedData.items as unknown as Array<Record<string, any>>);
const bundledInsights = insightData.items as InsightItem[];
const bundledInsight = bundledInsights[0];
const normalizeInsight = (item: Record<string, any>): InsightItem => {
  const toContentLocale = (value: Record<string, string>): ContentLocale => ({ en: value.en, 'zh-Hans': value['zh-Hans'] || value.zh });
  return { ...item, title: toContentLocale(item.title), dek: toContentLocale(item.dek), body: toContentLocale(item.body), claims: (item.claims || []).map((claim: Record<string, any>) => ({ ...claim, text: toContentLocale(claim.text) })) } as InsightItem;
};
const registryCounts = registryData.counts;
const registryTotal = Object.values(registryCounts).reduce((sum, count) => sum + count, 0);

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
  const [category, setCategory] = useState<Category>(() => { const value = new URLSearchParams(location.search).get('category') as Category | null; return value && categories.includes(value) ? value : 'all'; });
  const [query, setQuery] = useState(() => new URLSearchParams(location.search).get('q') || '');
  const [mobileOpen, setMobileOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedbackSent, setFeedbackSent] = useState(false);
  const [feedbackError, setFeedbackError] = useState('');
  const [feedbackBusy, setFeedbackBusy] = useState(false);
  const [insightOpen, setInsightOpen] = useState(false);
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [sourceQuery, setSourceQuery] = useState('');
  const [sourceKind, setSourceKind] = useState<'all' | RegistrySource['kind']>('all');
  const [sourceLimit, setSourceLimit] = useState(80);
  const [stories, setStories] = useState<Story[]>(bundledStories);
  const [insight, setInsight] = useState<InsightItem>(bundledInsight);
  const [insights, setInsights] = useState<InsightItem[]>(bundledInsights);
  const [selectedInsight, setSelectedInsight] = useState<InsightItem | null>(null);
  const [feedGeneratedAt, setFeedGeneratedAt] = useState(feedData.generatedAt);
  const searchRef = useRef<HTMLInputElement>(null);
  const t = copy[lang];

  useEffect(() => { document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en'; localStorage.setItem('agi-lang', lang); }, [lang]);
  useEffect(() => {
    const url = new URL(location.href);
    query.trim() ? url.searchParams.set('q', query.trim()) : url.searchParams.delete('q');
    category !== 'all' ? url.searchParams.set('category', category) : url.searchParams.delete('category');
    history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
  }, [query, category]);
  useEffect(() => {
    const restoreDiscovery = () => {
      const params = new URLSearchParams(location.search);
      setQuery(params.get('q') || '');
      const nextCategory = params.get('category') as Category | null;
      setCategory(nextCategory && categories.includes(nextCategory) ? nextCategory : 'all');
    };
    addEventListener('popstate', restoreDiscovery);
    return () => removeEventListener('popstate', restoreDiscovery);
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    Promise.allSettled([
      fetch('/api/v1/feed?limit=50', { signal: controller.signal }).then(async response => { if (!response.ok) throw new Error(`Feed ${response.status}`); return response.json() as Promise<{ items?: Array<Record<string, any>>; generatedAt?: string }>; }),
      fetch('/api/v1/insights?limit=20', { signal: controller.signal }).then(async response => { if (!response.ok) throw new Error(`Insights ${response.status}`); return response.json() as Promise<{ items?: Array<Record<string, any>> }>; }),
    ]).then(([feedResult, insightResult]) => {
      if (feedResult.status === 'fulfilled') {
        if (feedResult.value.items?.length) setStories(mapFeedItems(feedResult.value.items));
        if (feedResult.value.generatedAt) setFeedGeneratedAt(feedResult.value.generatedAt);
      }
      if (insightResult.status === 'fulfilled') {
        const currentItems = (insightResult.value.items || []).filter(item => item?.title && item?.dek && item?.body).map(normalizeInsight);
        if (currentItems.length) { setInsights(currentItems); setInsight(currentItems[0]); }
      }
      if ([feedResult, insightResult].some(result => result.status === 'rejected' && !(result.reason instanceof Error && result.reason.name === 'AbortError'))) track('error_seen', { area: 'content_api', fallback: true });
    });
    return () => controller.abort();
  }, []);
  useEffect(() => { track('page_viewed', { theme, language: lang }); }, []);
  const modalOpen = feedbackOpen || insightOpen || sourcesOpen;
  useEffect(() => {
    if (!modalOpen) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const frame = requestAnimationFrame(() => {
      const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
      dialog?.querySelector<HTMLElement>('button, [href], input, textarea, [tabindex]:not([tabindex="-1"])')?.focus();
    });
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const trapFocus = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
      if (!dialog) return;
      const controls = [...dialog.querySelectorAll<HTMLElement>('button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')].filter(control => control.offsetParent !== null);
      if (!controls.length) return;
      const first = controls[0]; const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    addEventListener('keydown', trapFocus);
    return () => { cancelAnimationFrame(frame); removeEventListener('keydown', trapFocus); document.body.style.overflow = originalOverflow; previous?.focus(); };
  }, [modalOpen]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === '/' && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
        event.preventDefault(); searchRef.current?.focus();
      }
      if (event.key === 'Escape') { setFeedbackOpen(false); setMobileOpen(false); setInsightOpen(false); setSourcesOpen(false); }
    };
    addEventListener('keydown', onKey); return () => removeEventListener('keydown', onKey);
  }, []);

  const results = useMemo(() => stories.filter((story) => {
    const inCategory = category === 'all' || story.category === category;
    const haystack = `${story.title.zh} ${story.title.en} ${story.summary.zh} ${story.summary.en} ${story.source}`.toLowerCase();
    return inCategory && haystack.includes(query.trim().toLowerCase());
  }), [category, query]);
  const featured = stories[0];
  const activeInsight = selectedInsight || insight;
  const uniqueSourceCount = new Set(stories.map((story) => story.source)).size;
  const matchingSources = useMemo(() => (registryData.sources as RegistrySource[]).filter((source) => {
    const matchesKind = sourceKind === 'all' || source.kind === sourceKind;
    const needle = sourceQuery.trim().toLowerCase();
    return matchesKind && (!needle || `${source.name} ${source.category} ${source.platform}`.toLowerCase().includes(needle));
  }), [sourceKind, sourceQuery]);
  const visibleSources = matchingSources.slice(0, sourceLimit);
  useEffect(() => setSourceLimit(80), [sourceKind, sourceQuery]);

  const isNavActive = (index: number) => insightOpen ? index === 1 : sourcesOpen && sourceKind === 'project' ? index === 4 : index === 0 ? category === 'all' : index === 2 ? category === 'research' : index === 3 ? category === 'products' : false;
  function handlePrimaryNav(event: ReactMouseEvent<HTMLAnchorElement>, index: number) {
    if (index === 1) {
      event.preventDefault(); setSelectedInsight(insight); setInsightOpen(true); setMobileOpen(false); track('insight_opened', { insight_id: insight.id, placement: 'navigation' });
      return;
    }
    if (index === 4) {
      event.preventDefault(); setSourceKind('project'); setSourcesOpen(true); setMobileOpen(false); track('source_link_clicked', { target: 'source_directory', source_kind: 'project', placement: 'navigation' });
      return;
    }
    const targetCategory: Category = index === 2 ? 'research' : index === 3 ? 'products' : 'all';
    setQuery(''); setCategory(targetCategory); setMobileOpen(false); track('filter_changed', { category: targetCategory, placement: 'navigation' });
  }

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
        <a href="#top" className="wordmark" aria-label={lang === 'zh' ? 'AGI Times — 首页' : 'AGI Times — Home'}><span className="mark" aria-hidden="true">A</span><span>AGI Times</span></a>
        <nav className="desktop-nav" aria-label={lang === 'zh' ? '主导航' : 'Primary'}>
          {t.nav.map((item, i) => <a className={isNavActive(i) ? 'active' : ''} href={i === 1 ? '#insight' : '#feed'} onClick={event => handlePrimaryNav(event, i)} key={item}>{item}</a>)}
        </nav>
        <div className="header-actions">
          <button className="icon-button search-trigger" onClick={() => searchRef.current?.focus()} aria-label={t.searchShort}><Search size={18}/></button>
          <button className="language-toggle" onClick={() => { const next = lang === 'zh' ? 'en' : 'zh'; setLang(next); track('language_changed', { from: lang, to: next }); }} aria-label={lang === 'zh' ? 'Switch to English' : '切换至中文'}><Globe2 size={16}/><span>{lang === 'zh' ? 'EN' : '中'}</span></button>
          <button className="icon-button" onClick={() => { const next = theme === 'light' ? 'dark' : 'light'; setTheme(next); track('theme_changed', { from: theme, to: next }); }} aria-label={lang === 'zh' ? `切换至${theme === 'light' ? '深色' : '浅色'}模式` : `Use ${theme === 'light' ? 'dark' : 'light'} theme`}>{theme === 'light' ? <Moon size={18}/> : <Sun size={18}/>}</button>
          <button className="icon-button mobile-menu" onClick={() => setMobileOpen(!mobileOpen)} aria-label={lang === 'zh' ? (mobileOpen ? '关闭菜单' : '打开菜单') : (mobileOpen ? 'Close menu' : 'Open menu')} aria-expanded={mobileOpen} aria-controls="mobile-nav">{mobileOpen ? <X size={20}/> : <Menu size={20}/>}</button>
        </div>
      </div>
      {mobileOpen && <nav id="mobile-nav" className="mobile-nav" aria-label={lang === 'zh' ? '移动导航' : 'Mobile navigation'}>{t.nav.map((item, i) => <a onClick={event => handlePrimaryNav(event, i)} href={i === 1 ? '#insight' : '#feed'} key={item}>{item}<ChevronRight size={17}/></a>)}</nav>}
    </header>

    <main id="main">
      <section className="hero" id="top">
        <div className="ambient ambient-one"/><div className="ambient ambient-two"/>
        <div className="container hero-grid">
          <div className="hero-copy">
            <div className="eyebrow"><span className="live-dot"/>{t.heroEyebrow}</div>
            <h1>{featured.title[lang]}</h1>
            <p>{featured.summary[lang]}</p>
            <div className="hero-meta"><span className="source-logo">O</span><strong>{featured.source}</strong><span>·</span><span>{formatDate(featured.time, lang)}</span><span className="verified"><Check size={12}/>{featured.signal[lang]}</span></div>
            <a className="primary-link" href={featured.url} target="_blank" rel="noreferrer" onClick={() => track('article_opened', { article_id: featured.id, source: featured.source })}>{t.read}<ArrowRight size={17}/></a>
          </div>
          <div className="signal-panel" role="region" aria-label={lang === 'zh' ? '实时信息流摘要' : 'Live coverage summary'}>
            <div className="signal-top"><div><span className="mini-label">AGI PULSE</span><strong>{t.live}</strong></div><div className="pulse-orbit"><Sparkles size={22}/></div></div>
            <div className="signal-chart" aria-hidden="true"><svg viewBox="0 0 440 120" preserveAspectRatio="none"><defs><linearGradient id="area" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="var(--accent)" stopOpacity=".32"/><stop offset="1" stopColor="var(--accent)" stopOpacity="0"/></linearGradient></defs><path className="chart-area" d="M0,102 C35,96 48,78 75,81 C112,86 121,63 153,67 C190,71 200,54 228,59 C267,65 280,29 315,38 C350,47 362,20 395,26 C417,29 428,14 440,9 L440,120 L0,120 Z"/><path className="chart-line" d="M0,102 C35,96 48,78 75,81 C112,86 121,63 153,67 C190,71 200,54 228,59 C267,65 280,29 315,38 C350,47 362,20 395,26 C417,29 428,14 440,9"/></svg></div>
            <div className="signal-stats"><div><b>{stories.length}</b><span>{lang === 'zh' ? '条当前更新' : 'current updates'}</span></div><div><b>{uniqueSourceCount}</b><span>{lang === 'zh' ? '个一手来源' : 'primary sources'}</span></div><div><b>100%</b><span>{lang === 'zh' ? '文章级链接' : 'item-level links'}</span></div></div>
            <div className="signal-footer"><Clock3 size={14}/>{t.updated} {formatGeneratedAt(feedGeneratedAt, lang)}</div>
          </div>
        </div>
      </section>

      <section className="discovery container" aria-label={lang === 'zh' ? '内容检索' : 'Content discovery'}>
        <div className="search-box"><Search size={20}/><input ref={searchRef} value={query} onChange={e => { setQuery(e.target.value); if (e.target.value.trim().length === 2) track('search_performed', { query_length: e.target.value.trim().length }); }} placeholder={t.search} aria-label={t.search}/>{query && <button onClick={() => setQuery('')} aria-label={lang === 'zh' ? '清除搜索' : 'Clear search'}><X size={17}/></button>}<span className="key-hint"><Command size={13}/> K</span></div>
        <div className="category-row" role="group" aria-label={lang === 'zh' ? '内容分类' : 'Categories'}>{categories.map(cat => <button key={cat} className={category === cat ? 'selected' : ''} onClick={() => { setCategory(cat); track('filter_changed', { category: cat }); }}>{t[cat]}</button>)}</div>
        <div className="coverage-strip" id="source-index" role="region" aria-label={lang === 'zh' ? '来源索引覆盖' : 'Source index coverage'}>
          <button className="coverage-entry" onClick={() => { setSourcesOpen(true); track('source_link_clicked', { target: 'source_directory' }); }}><strong>{registryTotal}</strong><span>{lang === 'zh' ? '浏览全部来源 →' : 'browse all sources →'}</span></button>
          <div><strong>{registryCounts.organization}</strong><span>{lang === 'zh' ? '机构' : 'organizations'}</span></div>
          <div><strong>{registryCounts.media}</strong><span>{lang === 'zh' ? '媒体' : 'media outlets'}</span></div>
          <div><strong>{registryCounts.person}</strong><span>{lang === 'zh' ? '行业人物' : 'people'}</span></div>
          <div><strong>{registryCounts.project}</strong><span>{lang === 'zh' ? '开源项目' : 'projects'}</span></div>
        </div>
      </section>

      <section className="content-grid container" id="feed">
        <div className="feed-column">
          <div className="section-heading"><div><span className="section-kicker">{t.latest}</span><h2>{t.feed}</h2><p>{t.feedSub}</p></div><span className="result-count">{results.length.toString().padStart(2, '0')}</span></div>
          <div className="story-list" aria-live="polite">
            {results.map(story => <article className="story-card" key={story.id}>
              <div className="story-rail"><span className="source-avatar">{story.source.charAt(0)}</span><span className="rail-line"/></div>
              <div className="story-content">
                <div className="story-meta"><span>{story.source}</span><span>·</span><span>{formatDate(story.time, lang)}</span><span className="tag">{t[story.category]}</span></div>
                <h3><a href={story.url} target="_blank" rel="noreferrer" onClick={() => track('article_opened', { article_id: story.id, source: story.source })}>{story.title[lang]}<ExternalLink className="external" size={14}/></a></h3>
                <p>{story.summary[lang]}</p>
                <div className="story-bottom"><span className="story-signal"><Check size={12}/>{story.signal[lang]}</span><a href={story.url} target="_blank" rel="noreferrer" aria-label={`${t.read}: ${story.title[lang]}`}><ArrowRight size={16}/></a></div>
              </div>
            </article>)}
            {results.length === 0 && <div className="empty-state"><Search size={28}/><h3>{t.empty}</h3><p>{t.emptySub}</p><button onClick={() => { setQuery(''); setCategory('all'); }}>{t.clear}</button></div>}
          </div>
        </div>

        <aside className="insight-card" id="insight">
          <div className="insight-head"><span><Sparkles size={15}/>{t.insight}</span><span>{formatDate(insight.publishedAt, lang)}</span></div>
          <div className="insight-visual"><div className="orb orb-a"/><div className="orb orb-b"/><div className="orb-core"><span>∞</span><small>{lang === 'zh' ? '持续运行的安全控制' : 'continuous safety controls'}</small></div></div>
          <h2>{localized(insight.title)[lang]}</h2><p>{localized(insight.dek)[lang]}</p>
          <div className="evidence"><span className="mini-label">{t.evidence}</span><div className="insight-claim">{localized(insight.claims[0].text)[lang]}</div></div>
          <div className="citation-row"><BookOpen size={15}/><span>{t.sources}</span><span>{insight.sources.map((source, index) => <span key={source.id}>{index > 0 && ' · '}<a href={source.url} target="_blank" rel="noreferrer" onClick={() => track('source_link_clicked', { source: source.publisher, insight_id: insight.id })}>{source.publisher}</a></span>)}</span></div>
          <button className="insight-link" onClick={() => { setSelectedInsight(insight); setInsightOpen(true); track('insight_opened', { insight_id: insight.id }); }}>{t.readInsight}<ArrowRight size={16}/></button>
        </aside>
      </section>
    </main>

    <footer><div className="container footer-inner"><div><div className="wordmark footer-mark"><span className="mark" aria-hidden="true">A</span><span>AGI Times</span></div><p>{t.footer}</p></div><a className="footer-status" href="#source-index"><span className="live-dot"/>{lang === 'zh' ? `${registryTotal} 个来源已建立索引` : `${registryTotal} sources indexed`}</a><div className="footer-links"><a href="https://github.com/tensor0549/agi-times-v2" target="_blank" rel="noreferrer"><Code2 size={17}/>GitHub</a><button onClick={() => { setFeedbackOpen(true); track('feedback_opened', { placement: 'footer' }); }}><MessageSquareText size={17}/>{t.feedback}</button></div></div></footer>

    <button className="feedback-fab" aria-label={lang === 'zh' ? '提交反馈' : 'Send feedback'} onClick={() => { setFeedbackOpen(true); track('feedback_opened', { placement: 'floating_button' }); }}><MessageSquareText size={18}/><span>{t.feedback}</span></button>

    {insightOpen && <div className="detail-backdrop"><div className="detail-scrim" aria-hidden="true" onClick={() => setInsightOpen(false)}/><section className="detail-panel" role="dialog" aria-modal="true" aria-labelledby="insight-detail-title"><button className="detail-close" onClick={() => setInsightOpen(false)} aria-label={lang === 'zh' ? '关闭洞察' : 'Close insight'}><X size={20}/></button><div className="detail-kicker"><Sparkles size={15}/>{t.insight} · {formatDate(activeInsight.publishedAt, lang)}</div><h2 id="insight-detail-title" tabIndex={-1}>{localized(activeInsight.title)[lang]}</h2><p className="detail-dek">{localized(activeInsight.dek)[lang]}</p><div className="insight-body">{localized(activeInsight.body)[lang].split('\n\n').map((paragraph, index) => <p key={index}>{paragraph.replace(/\[\^[^\]]+\]/g, '').replace(/\*\*/g, '')}</p>)}</div><h3>{lang === 'zh' ? '逐条论据与来源' : 'Claims and supporting sources'}</h3><div className="claim-list">{activeInsight.claims.map((claim, index) => <section className="claim-card" key={claim.id}><span>{String(index + 1).padStart(2, '0')}</span><p>{localized(claim.text)[lang]}</p><div>{claim.citationIds.map(citationId => { const source = activeInsight.sources.find(item => item.id === citationId); return source ? <a key={source.id} href={source.url} target="_blank" rel="noreferrer" onClick={() => track('source_link_clicked', { source: source.publisher, claim_id: claim.id, insight_id: activeInsight.id })}>{source.publisher} · {source.title}<ExternalLink size={12}/></a> : null; })}</div></section>)}</div>{insights.length > 1 && <><h3>{lang === 'zh' ? '更多洞察' : 'More insights'}</h3><div className="insight-archive">{insights.filter(item => item.id !== activeInsight.id).map(item => <button key={item.id} onClick={() => { setSelectedInsight(item); track('insight_opened', { insight_id: item.id, placement: 'archive' }); requestAnimationFrame(() => { document.getElementById('insight-detail-title')?.focus({ preventScroll: true }); document.querySelector('.detail-panel')?.scrollTo({ top: 0, behavior: 'smooth' }); }); }}><span>{formatDate(item.publishedAt, lang)}</span><strong>{localized(item.title)[lang]}</strong><ArrowRight size={15}/></button>)}</div></>}</section></div>}

    {sourcesOpen && <div className="detail-backdrop"><div className="detail-scrim" aria-hidden="true" onClick={() => setSourcesOpen(false)}/><section className="detail-panel source-panel" role="dialog" aria-modal="true" aria-labelledby="sources-title"><button className="detail-close" onClick={() => setSourcesOpen(false)} aria-label={lang === 'zh' ? '关闭来源目录' : 'Close source directory'}><X size={20}/></button><div className="detail-kicker"><BookOpen size={15}/>{registryTotal} {lang === 'zh' ? '个来源' : 'sources'}</div><h2 id="sources-title">{lang === 'zh' ? '来源目录' : 'Source directory'}</h2><p className="detail-dek">{lang === 'zh' ? '按机构、媒体、行业人物和开源项目浏览我们的信息源索引。' : 'Browse the intelligence index across organizations, media, people, and open-source projects.'}</p><div className="directory-tools"><div className="directory-search"><Search size={17}/><input value={sourceQuery} onChange={e => setSourceQuery(e.target.value)} placeholder={lang === 'zh' ? '搜索来源、分类或平台…' : 'Search sources, categories, or platforms…'}/></div><div className="directory-filters">{(['all','organization','media','person','project'] as const).map(kind => <button className={sourceKind === kind ? 'selected' : ''} key={kind} onClick={() => setSourceKind(kind)}>{lang === 'zh' ? ({all:'全部',organization:'机构',media:'媒体',person:'人物',project:'项目'} as const)[kind] : ({all:'All',organization:'Organizations',media:'Media',person:'People',project:'Projects'} as const)[kind]}</button>)}</div></div><div className="source-results" aria-live="polite">{visibleSources.map(source => <a href={source.url} target="_blank" rel="noreferrer" key={source.id} onClick={() => track('source_link_clicked', { source_id: source.id, source_kind: source.kind })}><span className="source-kind">{source.kind.slice(0,1).toUpperCase()}</span><span><strong>{source.name}</strong><small>{source.category.replaceAll('-', ' ')} · {source.platform}</small></span><ExternalLink size={14}/></a>)}</div><div className="directory-footer"><p className="directory-count">{lang === 'zh' ? `显示 ${visibleSources.length} / ${matchingSources.length} 个结果` : `Showing ${visibleSources.length} of ${matchingSources.length}`}</p>{visibleSources.length < matchingSources.length && <button onClick={() => setSourceLimit(limit => limit + 80)}>{lang === 'zh' ? '加载更多' : 'Load more'}<ArrowRight size={14}/></button>}</div></section></div>}

    {feedbackOpen && <div className="modal-backdrop" role="presentation" onMouseDown={e => { if (e.currentTarget === e.target) setFeedbackOpen(false); }}><div className="feedback-modal" role="dialog" aria-modal="true" aria-labelledby="feedback-title"><button className="modal-close" onClick={() => setFeedbackOpen(false)} aria-label={lang === 'zh' ? '关闭' : 'Close'}><X size={19}/></button>{feedbackSent ? <div className="sent-state"><span><Check size={25}/></span><h2>{t.sent}</h2></div> : <><span className="modal-icon"><MessageSquareText size={20}/></span><h2 id="feedback-title">{t.feedbackTitle}</h2><p>{t.feedbackSub}</p><form onSubmit={handleFeedback}><textarea name="message" required autoFocus minLength={3} placeholder={t.feedbackPlaceholder}/><input name="email" type="email" placeholder={t.email}/>{feedbackError && <div className="form-error" role="alert">{feedbackError}</div>}<div className="form-actions"><button type="button" onClick={() => setFeedbackOpen(false)}>{t.cancel}</button><button className="submit-button" type="submit" disabled={feedbackBusy}>{feedbackBusy ? (lang === 'zh' ? '发送中…' : 'Sending…') : t.send}<ArrowRight size={15}/></button></div></form></>}</div></div>}
  </div>;
}
