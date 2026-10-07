'use client'

import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  Bot,
  Check,
  ChevronDown,
  CircleHelp,
  Command,
  CornerDownLeft,
  Plus,
  Radio,
  Send,
  Sparkles,
  Trash2,
  Wallet,
  X,
} from 'lucide-react'
import { FormEvent, useEffect, useState } from 'react'

type Quote = {
  ticker: string
  price: number
  previous_price: number
  change: number
  change_percent: number
  timestamp: number
  direction: 'up' | 'down' | 'flat'
}

type WatchItem = { ticker: string; price: Quote | null }
type Snapshot = { total_value: number; recorded_at: string }
type Position = {
  ticker: string
  quantity: number
  avg_cost: number
  current_price: number
  market_value: number
  unrealized_pnl: number
  change_percent: number
}
type Portfolio = {
  cash_balance: number
  market_value: number
  total_value: number
  unrealized_pnl: number
  positions: Position[]
}
type ChatMessage = { role: 'user' | 'assistant'; content: string; actions?: string[] }

const API = process.env.NEXT_PUBLIC_API_URL ?? (process.env.NODE_ENV === 'development' ? 'http://localhost:8000' : '')
const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })
const compactCurrency = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  notation: 'compact',
  maximumFractionDigits: 2,
})
const percent = (value: number) => `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(`${API}${path}`, { cache: 'no-store' })
  if (!response.ok) {
    const body = await response.json().catch(() => ({}))
    throw new Error(body.detail || `Request failed (${response.status})`)
  }
  return response.json() as Promise<T>
}

function Sparkline({ points, direction }: { points: number[]; direction: string }) {
  if (points.length < 2) return <span className="sparkline-empty" />
  const min = Math.min(...points)
  const max = Math.max(...points)
  const spread = max - min || 1
  const line = points
    .map((value, index) => `${(index / (points.length - 1)) * 100},${20 - ((value - min) / spread) * 17}`)
    .join(' ')
  return (
    <svg className={`sparkline ${direction}`} viewBox="0 0 100 22" preserveAspectRatio="none" aria-hidden="true">
      <polyline points={line} fill="none" stroke="currentColor" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

function PriceChart({ points, positive }: { points: number[]; positive: boolean }) {
  const min = points.length ? Math.min(...points) : 0
  const max = points.length ? Math.max(...points) : 1
  const spread = max - min || 1
  const line = points.length > 1
    ? points.map((value, index) => `${(index / (points.length - 1)) * 1000},${240 - ((value - min) / spread) * 205}`).join(' ')
    : '0,145 1000,145'
  const color = positive ? '#bded69' : '#fa756c'
  return (
    <svg className="price-chart" viewBox="0 0 1000 260" preserveAspectRatio="none" role="img" aria-label="Selected ticker price history">
      <defs>
        <linearGradient id="chart-area" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity=".19" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {[45, 95, 145, 195, 245].map((y) => <line key={y} x1="0" x2="1000" y1={y} y2={y} className="chart-grid" />)}
      <polygon points={`0,260 ${line} 1000,260`} fill="url(#chart-area)" />
      <polyline points={line} fill="none" stroke={color} strokeWidth="2.2" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

function PerformanceChart({ points }: { points: number[] }) {
  const min = points.length ? Math.min(...points) : 0
  const max = points.length ? Math.max(...points) : 1
  const spread = max - min || 1
  const line = points.length > 1
    ? points.map((value, index) => `${(index / (points.length - 1)) * 1000},${42 - ((value - min) / spread) * 34}`).join(' ')
    : '0,25 1000,25'
  return (
    <svg className="performance-svg" viewBox="0 0 1000 50" preserveAspectRatio="none" role="img" aria-label="Portfolio value history">
      {[12, 25, 38].map((y) => <line key={y} x1="0" x2="1000" y1={y} y2={y} className="performance-grid" />)}
      <polyline points={line} fill="none" stroke="#77c9c3" strokeWidth="2" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

function App() {
  const [watchlist, setWatchlist] = useState<WatchItem[]>([])
  const [quotes, setQuotes] = useState<Record<string, Quote>>({})
  const [history, setHistory] = useState<Record<string, number[]>>({})
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null)
  const [portfolioHistory, setPortfolioHistory] = useState<number[]>([])
  const [selected, setSelected] = useState('AAPL')
  const [connection, setConnection] = useState<'connecting' | 'connected' | 'disconnected'>('connecting')
  const [tickerInput, setTickerInput] = useState('')
  const [quantity, setQuantity] = useState('1')
  const [chatInput, setChatInput] = useState('')
  const [chat, setChat] = useState<ChatMessage[]>([
    { role: 'assistant', content: 'Good morning. Your simulated portfolio is ready. What would you like to look into?' },
  ])
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')

  const selectedQuote = quotes[selected]
  const selectedHistory = history[selected] || []
  const selectedChange = selectedQuote?.change_percent || 0
  const positions = portfolio?.positions || []
  const positionWeight = Math.max(portfolio?.market_value || 1, 1)
  const sortedPositions = [...positions].sort((left, right) => right.market_value - left.market_value)

  useEffect(() => {
    let active = true
    const refresh = async () => {
      try {
        const [nextWatchlist, nextPortfolio, nextHistory, nextChat] = await Promise.all([
          getJson<WatchItem[]>('/api/watchlist'),
          getJson<Portfolio>('/api/portfolio'),
          getJson<Snapshot[]>('/api/portfolio/history'),
          getJson<ChatMessage[]>('/api/chat/history'),
        ])
        if (!active) return
        setWatchlist(nextWatchlist)
        setPortfolio(nextPortfolio)
        setPortfolioHistory(nextHistory.map((snapshot) => snapshot.total_value))
        if (nextChat.length) setChat(nextChat)
        if (nextWatchlist.length && !nextWatchlist.some((item) => item.ticker === selected)) {
          setSelected(nextWatchlist[0].ticker)
        }
      } catch (error) {
        if (active) setNotice(error instanceof Error ? error.message : 'Could not connect to the API.')
      }
    }
    void refresh()
    const timer = window.setInterval(() => { void refresh() }, 5000)
    const events = new EventSource(`${API}/api/stream/prices`)
    events.onopen = () => { setConnection('connected'); setNotice('') }
    events.onerror = () => setConnection('disconnected')
    events.onmessage = (event) => {
      try {
        const updates = JSON.parse(event.data) as Record<string, Quote>
        setQuotes((current) => ({ ...current, ...updates }))
        setHistory((current) => {
          const next = { ...current }
          for (const [symbol, quote] of Object.entries(updates)) {
            next[symbol] = [...(current[symbol] || []).slice(-47), quote.price]
          }
          return next
        })
      } catch {
        setConnection('disconnected')
      }
    }
    return () => { active = false; window.clearInterval(timer); events.close() }
  }, [selected])

  async function refreshPortfolio() {
    const [nextPortfolio, nextWatchlist, nextHistory] = await Promise.all([
      getJson<Portfolio>('/api/portfolio'),
      getJson<WatchItem[]>('/api/watchlist'),
      getJson<Snapshot[]>('/api/portfolio/history'),
    ])
    setPortfolio(nextPortfolio)
    setWatchlist(nextWatchlist)
    setPortfolioHistory(nextHistory.map((snapshot) => snapshot.total_value))
  }

  async function submitTrade(side: 'buy' | 'sell') {
    setBusy(true)
    setNotice('')
    try {
      const response = await fetch(`${API}/api/portfolio/trade`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticker: selected, quantity: Number(quantity), side }),
      })
      const body = await response.json()
      if (!response.ok) throw new Error(body.detail || 'Trade could not be completed.')
      await refreshPortfolio()
      setNotice(`${side === 'buy' ? 'Bought' : 'Sold'} ${quantity} ${selected} at ${currency.format(body.price)}.`)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Trade could not be completed.')
    } finally {
      setBusy(false)
    }
  }

  async function addTicker(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const ticker = tickerInput.trim().toUpperCase()
    if (!ticker) return
    try {
      await fetch(`${API}/api/watchlist`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticker }),
      }).then(async (response) => {
        const body = await response.json()
        if (!response.ok) throw new Error(body.detail || 'Could not add ticker.')
      })
      setSelected(ticker)
      setTickerInput('')
      await refreshPortfolio()
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not add ticker.')
    }
  }

  async function removeTicker(ticker: string) {
    try {
      const response = await fetch(`${API}/api/watchlist/${encodeURIComponent(ticker)}`, { method: 'DELETE' })
      const body = await response.json()
      if (!response.ok) throw new Error(body.detail || 'Could not remove ticker.')
      await refreshPortfolio()
      if (selected === ticker) setSelected(watchlist.find((item) => item.ticker !== ticker)?.ticker || 'AAPL')
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not remove ticker.')
    }
  }

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const message = chatInput.trim()
    if (!message || busy) return
    setChat((current) => [...current, { role: 'user', content: message }])
    setChatInput('')
    setBusy(true)
    try {
      const response = await fetch(`${API}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message }),
      })
      const body = await response.json()
      if (!response.ok) throw new Error(body.detail || 'Assistant is unavailable.')
      const actions = (body.actions || []).map((action: { status: string; ticker?: string; side?: string; quantity?: number; reason?: string }) =>
        action.status === 'executed'
          ? `${action.side ? `${action.side} ${action.quantity} ` : ''}${action.ticker || 'Watchlist'} ${action.status}`
          : `${action.ticker || 'Action'} rejected: ${action.reason || action.status}`,
      )
      setChat((current) => [...current, { role: 'assistant', content: body.message, actions }])
      await refreshPortfolio()
    } catch (error) {
      setChat((current) => [...current, {
        role: 'assistant',
        content: error instanceof Error ? error.message : 'Assistant is unavailable.',
      }])
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="terminal-shell">
      <header className="topbar">
        <div className="brand-block">
          <div className="brand-mark"><Activity size={17} strokeWidth={2.5} /></div>
          <div className="brand-name">Fin<span>Ally</span><small>MARKETS</small></div>
        </div>
        <div className="top-context"><span className="market-tag"><span className="market-dot" /> SIMULATED MARKET</span><span className="context-divider" /> US EQUITIES <ChevronDown size={13} /></div>
        <div className="top-actions">
          <div className={`connection ${connection}`}><span />{connection === 'connected' ? 'LIVE' : connection === 'connecting' ? 'CONNECTING' : 'RECONNECTING'}</div>
          <button className="icon-button help-button" title="Help" aria-label="Help"><CircleHelp size={17} /></button>
          <div className="avatar">FA</div>
        </div>
      </header>

      <section className="ticker-strip" aria-label="Market overview">
        <span className="strip-label">MARKET PULSE</span>
        {['SPX', 'NDX', 'DJI', 'VIX'].map((ticker, index) => (
          <div className="index-item" key={ticker}><span>{ticker}</span><b>{index === 3 ? '16.42' : (5224.76 - index * 178.9).toLocaleString('en-US', { minimumFractionDigits: 2 })}</b><small className={index === 3 ? 'negative' : 'positive'}>{index === 3 ? '-0.82%' : '+0.36%'}</small></div>
        ))}
        <div className="ticker-date">PAPER TRADING <span>·</span> PRICES SIMULATED</div>
      </section>

      <section className="portfolio-ribbon">
        <div className="account-label"><span className="eyebrow">PAPER ACCOUNT</span><span className="account-id">DEFAULT <ChevronDown size={12} /></span></div>
        <div className="ribbon-divider" />
        <div className="metric-main"><span className="eyebrow">TOTAL EQUITY</span><strong>{currency.format(portfolio?.total_value ?? 10000)}</strong><small className={(portfolio?.unrealized_pnl || 0) >= 0 ? 'positive' : 'negative'}>{(portfolio?.unrealized_pnl || 0) >= 0 ? '+' : ''}{currency.format(portfolio?.unrealized_pnl || 0)} <span>UNREALIZED</span></small></div>
        <div className="ribbon-metric"><span className="eyebrow">CASH AVAILABLE</span><strong>{currency.format(portfolio?.cash_balance ?? 10000)}</strong></div>
        <div className="ribbon-metric"><span className="eyebrow">MARKET VALUE</span><strong>{currency.format(portfolio?.market_value ?? 0)}</strong></div>
        <div className="ribbon-metric"><span className="eyebrow">OPEN POSITIONS</span><strong>{String(positions.length).padStart(2, '0')} <small>ASSETS</small></strong></div>
        <div className="ribbon-end"><Wallet size={16} /><span>SIMULATION</span></div>
      </section>

      <div className="workspace-grid">
        <section className="primary-column">
          <div className="panel chart-panel">
            <div className="panel-heading chart-heading">
              <div><span className="eyebrow">INSTRUMENT</span><div className="instrument-title"><h1>{selected}</h1><span className="instrument-name">{selected === 'AAPL' ? 'Apple Inc.' : selected === 'MSFT' ? 'Microsoft Corp.' : `${selected} EQUITY`}</span><span className="exchange-tag">NASDAQ</span></div></div>
              <div className="chart-price"><strong>{selectedQuote ? currency.format(selectedQuote.price) : '—'}</strong><span className={selectedChange >= 0 ? 'positive' : 'negative'}>{selectedChange >= 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}{percent(selectedChange)}</span></div>
            </div>
            <div className="chart-toolbar"><div className="time-tabs"><button className="active">1D</button><button>1W</button><button>1M</button><button>3M</button><button>1Y</button></div><div className="chart-meta"><Radio size={13} /> LIVE TICK <span>·</span> USD</div></div>
            <div className="chart-wrap"><div className="chart-value-labels"><span>{currency.format((selectedQuote?.price || 0) * 1.015)}</span><span>{currency.format(selectedQuote?.price || 0)}</span><span>{currency.format((selectedQuote?.price || 0) * 0.985)}</span></div><PriceChart points={selectedHistory} positive={selectedChange >= 0} /></div>
            <div className="chart-footer"><span>09:30</span><span>11:00</span><span>12:30</span><span>14:00</span><span>16:00 <small>ET</small></span><div className="volume-indicator"><span /> SIMULATED FEED</div></div>
          </div>

          <div className="trade-row panel">
            <div className="trade-title"><span className="eyebrow">QUICK ORDER</span><span className="trade-symbol">{selected} <small>MARKET</small></span></div>
            <label className="quantity-field"><span>QUANTITY</span><input aria-label="Quantity" type="number" min="0.0001" step="0.0001" value={quantity} onChange={(event) => setQuantity(event.target.value)} /></label>
            <div className="order-estimate"><span>EST. ORDER VALUE</span><b>{currency.format((Number(quantity) || 0) * (selectedQuote?.price || 0))}</b></div>
            <button className="order-button buy-button" disabled={busy || !selectedQuote} onClick={() => void submitTrade('buy')}><ArrowUpRight size={16} /> BUY</button>
            <button className="order-button sell-button" disabled={busy || !selectedQuote} onClick={() => void submitTrade('sell')}><ArrowDownRight size={16} /> SELL</button>
          </div>

          <div className="panel positions-panel">
            <div className="panel-heading compact-heading"><div><span className="eyebrow">ACCOUNT</span><h2>Open positions <span className="count-badge">{positions.length}</span></h2></div><button className="text-action">VIEW ACTIVITY <ArrowUpRight size={13} /></button></div>
            <div className="table-scroll"><table><thead><tr><th>INSTRUMENT</th><th>SHARES</th><th>AVG. COST</th><th>MARK</th><th>MARKET VALUE</th><th>UNREALIZED P&amp;L</th><th /></tr></thead><tbody>
              {positions.length ? positions.map((position) => <tr key={position.ticker} onClick={() => setSelected(position.ticker)} className="position-row"><td><span className="symbol-cell">{position.ticker}</span><span className="table-sub">US EQUITY</span></td><td>{position.quantity.toLocaleString('en-US', { maximumFractionDigits: 4 })}</td><td>{currency.format(position.avg_cost)}</td><td>{currency.format(position.current_price)}</td><td>{currency.format(position.market_value)}</td><td className={position.unrealized_pnl >= 0 ? 'positive' : 'negative'}>{position.unrealized_pnl >= 0 ? '+' : ''}{currency.format(position.unrealized_pnl)} <small>({percent(position.change_percent)})</small></td><td><button className="row-action" title={`Trade ${position.ticker}`} onClick={(event) => { event.stopPropagation(); setSelected(position.ticker) }}><ArrowUpRight size={15} /></button></td></tr>) : <tr><td colSpan={7} className="empty-table"><Wallet size={17} /> No open positions <span>Place a paper order to get started.</span></td></tr>}
            </tbody></table></div>
          </div>

          <div className="lower-grid">
            <div className="panel allocation-panel"><div className="panel-heading compact-heading"><div><span className="eyebrow">EXPOSURE</span><h2>Portfolio allocation</h2></div><span className="mini-note">BY MARKET VALUE</span></div>
              {sortedPositions.length ? <div className="allocation-grid">{sortedPositions.map((position, index) => <button key={position.ticker} className={`allocation-tile tile-${index % 5}`} style={{ flexGrow: Math.max(1, position.market_value / positionWeight * 100) }} onClick={() => setSelected(position.ticker)}><span>{position.ticker}</span><b>{(position.market_value / positionWeight * 100).toFixed(0)}%</b><small>{currency.format(position.market_value)}</small></button>)}</div> : <div className="empty-visual">Your exposure map will populate when you hold a position.</div>}
            </div>
            <div className="panel performance-panel"><div className="panel-heading compact-heading"><div><span className="eyebrow">ACCOUNT VALUE</span><h2>Performance</h2></div><span className="period-chip">1D <ChevronDown size={12} /></span></div><div className="performance-total">{compactCurrency.format(portfolio?.total_value || 10000)} <small>SIMULATED</small></div><div className="performance-chart"><PerformanceChart points={portfolioHistory} /></div><div className="chart-footer perf-footer"><span>09:30</span><span>12:00</span><span>16:00</span></div></div>
          </div>
          {notice && <div className="notice-bar"><span><Check size={14} /> {notice}</span><button aria-label="Dismiss notice" onClick={() => setNotice('')}><X size={15} /></button></div>}
        </section>

        <aside className="side-column">
          <section className="panel watchlist-panel">
            <div className="panel-heading side-heading"><div><span className="eyebrow">MARKET MONITOR</span><h2>Watchlist <span className="count-badge">{watchlist.length}</span></h2></div><span className="live-small"><span /> LIVE</span></div>
            <div className="watchlist-header"><span>SYMBOL</span><span>LAST / CHANGE</span><span>24H</span></div>
            <div className="watchlist-rows">{watchlist.map(({ ticker }) => {
              const quote = quotes[ticker]
              const change = quote?.change_percent || 0
              return <div key={ticker} className={`watch-row ${selected === ticker ? 'selected' : ''}`}>
                <button className="watch-select" onClick={() => setSelected(ticker)}><span className="watch-symbol">{ticker}</span><span className="watch-market">US EQUITY</span></button>
                <button className={`watch-price ${quote?.direction || 'flat'}`} onClick={() => setSelected(ticker)}><b>{quote ? currency.format(quote.price) : '—'}</b><small className={change >= 0 ? 'positive' : 'negative'}>{change >= 0 ? '+' : ''}{change.toFixed(2)}%</small></button>
                <Sparkline points={history[ticker] || []} direction={change >= 0 ? 'positive' : 'negative'} />
                <button className="remove-watch" aria-label={`Remove ${ticker}`} title={`Remove ${ticker}`} onClick={() => void removeTicker(ticker)}><Trash2 size={13} /></button>
              </div>
            })}</div>
            <form className="add-ticker-form" onSubmit={addTicker}><span className="add-icon"><Plus size={14} /></span><input aria-label="Add ticker symbol" placeholder="Add symbol" value={tickerInput} onChange={(event) => setTickerInput(event.target.value)} maxLength={12} /><button type="submit" disabled={!tickerInput.trim()} aria-label="Add to watchlist"><CornerDownLeft size={15} /></button></form>
          </section>

          <section className="panel assistant-panel">
            <div className="assistant-heading"><div className="assistant-icon"><Bot size={17} /></div><div><span className="eyebrow">FINALLY AI</span><h2>Market copilot <span className="online-dot" /></h2></div><button className="icon-button assistant-menu" title="Assistant options" aria-label="Assistant options"><Command size={15} /></button></div>
            <div className="assistant-context"><Sparkles size={13} /><span>CONTEXT: PORTFOLIO + LIVE MARKET</span><button title="Refresh context" onClick={() => void refreshPortfolio()}><Activity size={13} /></button></div>
            <div className="chat-messages">{chat.map((message, index) => <div className={`chat-message ${message.role}`} key={`${message.role}-${index}`}><div className="chat-avatar">{message.role === 'assistant' ? <Sparkles size={13} /> : 'YOU'}</div><div className="chat-content"><span className="chat-role">{message.role === 'assistant' ? 'FINALLY' : 'YOU'} <small>{index === 0 ? 'JUST NOW' : 'NOW'}</small></span><p>{message.content}</p>{message.actions?.map((action, actionIndex) => <div className="action-receipt" key={actionIndex}><Check size={12} />{action}</div>)}</div></div>)}{busy && <div className="thinking"><span /><span /><span /> ANALYZING</div>}</div>
            <form className="chat-input-wrap" onSubmit={sendMessage}><input aria-label="Message the AI copilot" placeholder="Ask about your portfolio..." value={chatInput} onChange={(event) => setChatInput(event.target.value)} /><button type="submit" aria-label="Send message" disabled={busy || !chatInput.trim()}><Send size={15} /></button><div className="chat-hint"><span>AI CAN MAKE MISTAKES</span><span>ENTER <CornerDownLeft size={10} /></span></div></form>
          </section>
        </aside>
      </div>

      <footer className="statusbar"><div><span className={`status-indicator ${connection}`} />{connection === 'connected' ? 'MARKET DATA CONNECTED' : 'MARKET DATA RECONNECTING'} <span className="footer-divider">|</span> SIMULATOR v1.0</div><div>ALL TRADES ARE SIMULATED <span className="footer-divider">|</span> <span className="status-clock">{new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: '2-digit' })}</span></div></footer>
    </main>
  )
}

export default function Home() {
  return <App />
}