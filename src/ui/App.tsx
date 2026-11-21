import { createContext, useContext, useEffect, useState } from 'react'
import { Link, Navigate, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import {
  Activity, CalendarDays, ChevronRight, ClipboardList, Database, FlaskConical,
  LayoutDashboard, LogOut, Menu, MoonStar, Settings2, ShieldCheck, UserRound, UsersRound, X,
} from 'lucide-react'
import type { Identity, Patient, Snapshot } from '../domain'
import { demoIdentities, identityKey } from '../data/fixtures'
import { dataService } from '../data/local'
import { Overview } from './Overview'
import { Sleep } from './Sleep'
import { Patients } from './Patients'
import { Tasks } from './Tasks'
import { Awaiting, Badge, Brand, Empty, errorText, Feedback, Heading, Loading, Panel } from './shared'

const adminNav = [
  { url: '/admin', label: '项目总览', icon: LayoutDashboard },
  { url: '/admin/patients', label: '患者与病历', icon: UsersRound },
  { url: '/admin/monitoring', label: '监测数据', icon: Activity },
  { url: '/admin/reports', label: '健康报告', icon: ClipboardList },
  { url: '/admin/tasks', label: '任务与设置', icon: Settings2 },
]
const subjectNav = [
  { url: '/me', label: '健康总览', icon: LayoutDashboard },
  { url: '/me/sleep', label: '睡眠监测', icon: MoonStar },
  { url: '/me/reports', label: '健康报告', icon: ClipboardList },
  { url: '/me/profile', label: '个人信息', icon: UserRound },
]

interface ViewData {
  snapshot: Snapshot
  patient: Patient
  choosePatient: (patientId: string) => void
  account: Identity
  logout: () => void
}
const ViewContext = createContext<ViewData | null>(null)
export const useView = () => useContext(ViewContext)!

function Login({ onLogin }: { onLogin: (key: string) => void }) {
  const [key, setKey] = useState('admin')
  const [error, setError] = useState('')
  const account = demoIdentities.find(item => identityKey(item) === key)!
  return <main className="login-layout">
    <section className="login-story">
      <Brand light />
      <div className="login-copy">
        <span className="login-eyebrow"><Activity size={16} /> 夜间健康监测</span>
        <h1>居家夜间<br />健康监测</h1>
        <p>从夜间监测到长期趋势，查看睡眠结构、生命体征和历史就诊记录。</p>
      </div>
      <div className="login-graphic" aria-hidden="true">
        <div className="login-grid" />
        <div className="orbit orbit-1" /><div className="orbit orbit-2" /><div className="orbit orbit-3" />
        <svg viewBox="0 0 600 170" preserveAspectRatio="none">
          <path d="M0 101H116l15-9 16 24 20-35 17 18h64l18-12 16 22 27-77 24 101 22-42 16 9h47l16-12 14 18 17-14h135" />
        </svg>
      </div>
      <div className="login-footer"><FlaskConical size={17} /> 无恙计划 V1.2 演示</div>
    </section>
    <section className="login-main">
      <form className="login-form" onSubmit={event => {
        event.preventDefault()
        try { onLogin(key) } catch (cause) { setError(errorText(cause)) }
      }}>
        <div className="login-mobile-brand"><Brand /></div>
        <Badge><FlaskConical size={14} /> 模拟数据</Badge>
        <h2>登录演示系统</h2>
        <p>选择身份进入对应工作台。</p>
        <label htmlFor="identity">演示身份</label>
        <select id="identity" value={key} onChange={event => setKey(event.target.value)}>
          {demoIdentities.map(item => <option value={identityKey(item)} key={identityKey(item)}>
            {item.role === 'admin' ? '研究管理员' : item.patientId + ' · ' + item.name + '（受试者）'}
          </option>)}
        </select>
        <div className="identity-detail">
          {account.role === 'admin' ? <ShieldCheck size={18} /> : <UserRound size={18} />}
          {account.role === 'admin' ? '管理演示患者、病历和夜间监测。' : '查看本人演示监测与健康报告。'}
        </div>
        <Feedback error={error} />
        <button className="button primary login-submit" type="submit">进入工作台</button>
        <p className="login-storage"><Database size={15} /> 演示记录保存在当前浏览器。</p>
      </form>
    </section>
  </main>
}

function Reports() {
  const { account } = useView()
  return <>
    <Heading title="健康报告" detail={account.role === 'admin' ? '查看分析报告及其发布状态。' : '查看本人已发布的健康报告。'} />
    <Panel title={account.role === 'admin' ? '报告列表' : '已发布报告'}>
      <Awaiting message={account.role === 'admin' ? '分析服务接入并发布报告后，这里会显示报告及历史版本。' : '有新的报告发布后，你可以在这里查看。'} />
    </Panel>
  </>
}

function Profile() {
  const { patient, logout } = useView()
  return <>
    <Heading title="个人信息" detail="查看当前登录身份和关联档案。" />
    <Panel title="我的档案" action={<Badge>模拟档案</Badge>}>
      <div className="profile-person"><span className="avatar large">{patient.name.slice(0, 1)}</span><div><h3>{patient.name}</h3><p>{patient.id} · 受试者</p></div></div>
      <dl className="profile-details">
        <div><dt>患者编号</dt><dd>{patient.id}</dd></div>
        <div><dt>档案摘要</dt><dd>{patient.description || '—'}</dd></div>
        <div><dt>显示时区</dt><dd>北京时间 UTC+08:00</dd></div>
      </dl>
      <button className="button secondary" onClick={logout}><LogOut size={16} />退出登录</button>
    </Panel>
  </>
}

function Shell({ account, logout }: { account: Identity; logout: () => void }) {
  const location = useLocation()
  const navigate = useNavigate()
  const [snapshot, setSnapshot] = useState<Snapshot>()
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const [selected, setSelected] = useState(() => sessionStorage.getItem('wuyang-selected') || 'P001')
  const [menu, setMenu] = useState(false)
  const admin = account.role === 'admin'
  const navigation = admin ? adminNav : subjectNav
  const base = navigation[0].url

  useEffect(() => {
    let active = true
    let request = 0
    async function read() {
      const index = ++request
      try {
        const value = await dataService.snapshot()
        if (active && index === request) { setSnapshot(value); setError('') }
      } catch (cause) {
        if (active && index === request) setError(errorText(cause))
      }
    }
    const readOnReturn = () => { if (!document.hidden) void read() }
    void read()
    const unsubscribe = dataService.subscribe(read)
    document.addEventListener('visibilitychange', readOnReturn)
    return () => { active = false; unsubscribe(); document.removeEventListener('visibilitychange', readOnReturn) }
  }, [account, attempt])
  useEffect(() => { setMenu(false); window.scrollTo(0, 0) }, [location.pathname])

  const query = new URLSearchParams(location.search)
  const linkedPatient = admin && location.pathname === '/admin/monitoring'
    ? snapshot?.nights.find(night => night.id === query.get('night'))?.patientId
    : admin && location.pathname === '/admin/patients'
      ? snapshot?.encounters.find(visit => visit.id === query.get('visit'))?.patientId
      : undefined
  useEffect(() => {
    if (!linkedPatient) return
    setSelected(linkedPatient)
    sessionStorage.setItem('wuyang-selected', linkedPatient)
  }, [linkedPatient])
  const patientId = account.role === 'subject' ? account.patientId : linkedPatient ?? selected
  const patient = snapshot?.patients.find(item => item.id === patientId) ?? snapshot?.patients[0]
  const choosePatient = (value: string) => {
    setSelected(value)
    sessionStorage.setItem('wuyang-selected', value)
    if (location.search) navigate(location.pathname, { replace: true })
  }
  const current = navigation.find(item => item.url === location.pathname)?.label ?? navigation[0].label

  if (location.pathname !== base && !location.pathname.startsWith(base + '/')) return <Navigate to={base} replace />
  return <div className="app-layout">
    {menu && <button className="sidebar-scrim" aria-label="关闭导航" onClick={() => setMenu(false)} />}
    <aside className={'sidebar' + (menu ? ' sidebar-open' : '')}>
      <Link className="sidebar-brand" to={base}><Brand /></Link>
      <button className="icon-button sidebar-close" aria-label="关闭菜单" onClick={() => setMenu(false)}><X size={22} /></button>
      <nav aria-label="主导航">
        <div className="nav-caption">{admin ? '研究工作台' : '个人空间'}</div>
        {navigation.map(({ url, label, icon: Icon }) => <NavLink className="nav-item" to={url} key={url} end>
          <Icon size={19} /><span>{label}</span><ChevronRight className="nav-chevron" size={16} />
        </NavLink>)}
      </nav>
      <div className="sidebar-bottom">
        <div className="sidebar-demo"><FlaskConical size={17} /><div><strong>模拟数据</strong><small>V1.2 · 本地演示</small></div></div>
        <div className="sidebar-account">
          <span className="avatar">{admin ? '研' : account.name.slice(0, 1)}</span>
          <div><strong>{account.name}</strong><small>{admin ? '管理员' : account.patientId + ' · 受试者'}</small></div>
          <button className="icon-button" title="退出登录" aria-label="退出登录" onClick={logout}><LogOut size={18} /></button>
        </div>
      </div>
    </aside>
    <div className="workspace">
      <header className="topbar">
        <div className="breadcrumbs"><button className="icon-button mobile-menu" aria-label="打开菜单" aria-expanded={menu} onClick={() => setMenu(!menu)}><Menu size={22} /></button>
          <span className="breadcrumb-root">{admin ? '研究工作台' : '个人空间'}</span><ChevronRight className="breadcrumb-root" size={14} /><strong>{current}</strong>
        </div>
        <div className="toolbar"><span className="timezone"><CalendarDays size={15} /> 北京时间</span>
          {admin && patient && snapshot && <label className="patient-select">
            <UsersRound size={16} /><span className="sr-only">当前患者</span>
            <select value={patient.id} onChange={event => choosePatient(event.target.value)}>
              {snapshot.patients.map(item => <option key={item.id} value={item.id}>{item.name} · {item.id}</option>)}
            </select>
          </label>}
          {!admin ? <Badge>模拟数据</Badge> : <span className="admin-mobile-demo"><Badge>模拟数据</Badge></span>}
        </div>
      </header>
      <main className="page-content">
        <Feedback error={error} />
        {error && !snapshot && <button className="button secondary" onClick={() => setAttempt(value => value + 1)}>重新读取</button>}
        {!snapshot && !error && <Loading>正在生成首批演示监测数据…</Loading>}
        {snapshot && !patient && <Empty title="暂无患者档案" />}
        {snapshot && patient && <ViewContext.Provider value={{ snapshot, patient, choosePatient, account, logout }}>
          <Routes>
            <Route path={base} element={<Overview key={patient.id} />} />
            {admin && <Route path="/admin/patients" element={<Patients key={patient.id} />} />}
            <Route path={admin ? '/admin/monitoring' : '/me/sleep'} element={<Sleep key={patient.id} />} />
            <Route path={base + '/reports'} element={<Reports />} />
            {admin ? <Route path="/admin/tasks" element={<Tasks key={patient.id} />} />
              : <Route path="/me/profile" element={<Profile />} />}
            <Route path="*" element={<Navigate to={base} replace />} />
          </Routes>
        </ViewContext.Provider>}
      </main>
    </div>
  </div>
}

export function App() {
  const [account, setAccount] = useState(dataService.getIdentity)
  const navigate = useNavigate()
  const location = useLocation()
  function login(key: string) {
    setAccount(dataService.login(key))
  }
  function logout() {
    dataService.logout()
    setAccount(null)
    navigate('/login', { replace: true })
  }
  if (!account) {
    if (location.pathname !== '/login' && location.pathname !== '/') {
      return <Navigate to="/login" state={{ from: location.pathname + location.search }} replace />
    }
    return <Login onLogin={login} />
  }
  if (location.pathname === '/login' || location.pathname === '/') {
    const base = account.role === 'admin' ? '/admin' : '/me'
    const from = (location.state as { from?: string } | null)?.from
    const target = from && (from.split('?')[0] === base || from.startsWith(base + '/')) ? from : base
    return <Navigate to={target} replace />
  }
  return <Shell key={identityKey(account)} account={account} logout={logout} />
}
