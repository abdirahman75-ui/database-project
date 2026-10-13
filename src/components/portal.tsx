'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  ArrowDownToLine,
  ArrowRight,
  Bell,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleHelp,
  Clock3,
  CreditCard,
  FileCheck2,
  FileText,
  Globe2,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageSquare,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  Siren,
  SlidersHorizontal,
  UploadCloud,
  UserRound,
  UsersRound,
  X,
} from 'lucide-react';
import type {
  Application,
  ApplicationStatus,
  Announcement,
  Bootstrap,
  Document,
  Service,
  User,
} from '@/lib/types';

type Tab =
  | 'overview'
  | 'services'
  | 'applications'
  | 'documents'
  | 'appointments'
  | 'payments'
  | 'notifications'
  | 'profile'
  | 'people'
  | 'announcements'
  | 'reports';
type Dialog =
  | { kind: 'apply'; service: Service }
  | { kind: 'case'; id: string }
  | { kind: 'service'; service: Service }
  | { kind: 'staff' }
  | { kind: 'announcement'; announcement?: Announcement }
  | { kind: 'slot' }
  | null;
type Mutation = (
  path: string,
  body?: unknown,
  method?: string,
  message?: string,
) => Promise<boolean>;

const money = (value: number) =>
  new Intl.NumberFormat('en-MY', {
    style: 'currency',
    currency: 'MYR',
    maximumFractionDigits: 2,
  }).format(value);
const date = (value: string, withTime = false) =>
  new Intl.DateTimeFormat('en-MY', {
    timeZone: 'Asia/Kuala_Lumpur',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    ...(withTime ? { hour: 'numeric', minute: '2-digit' } : {}),
  }).format(new Date(value));
const label = (value: string) =>
  value
    .toLowerCase()
    .replaceAll('_', ' ')
    .replace(/^./, (c) => c.toUpperCase());
const serviceIcon = (code: string): LucideIcon =>
  /EMERGENCY/i.test(code)
    ? Siren
    : /VISA/i.test(code)
      ? Globe2
      : /REGISTRATION|ID_CARD|NATIONAL/i.test(code)
        ? UserRound
        : /ANNOUNCEMENT|COMMUNITY/i.test(code)
          ? MessageSquare
          : FileText;
function Badge({ value }: { value: string }) {
  return (
    <span className={`badge badge-${value.toLowerCase()}`}>{label(value)}</span>
  );
}
function Empty({
  icon: Icon = FileText,
  title,
  text,
  children,
}: {
  icon?: LucideIcon;
  title: string;
  text: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="empty">
      <span className="empty-icon">
        <Icon size={28} />
      </span>
      <h3>{title}</h3>
      <p>{text}</p>
      {children}
    </div>
  );
}
function Field({
  label: text,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <label className="field">
      <span>{text}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}
function FormButtons({
  busy,
  text = 'Save changes',
}: {
  busy: boolean;
  text?: string;
}) {
  return (
    <button className="button primary" type="submit" disabled={busy}>
      {busy ? 'Saving…' : text}
      <ArrowRight size={16} />
    </button>
  );
}
function Heading({
  eyebrow,
  title,
  text,
  children,
}: {
  eyebrow?: string;
  title: string;
  text?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
        {text && <p>{text}</p>}
      </div>
      {children}
    </div>
  );
}

async function request(path: string, body?: unknown, method = 'GET') {
  const multipart = body instanceof FormData;
  const res = await fetch(`/api/${path}`, {
    method,
    credentials: 'same-origin',
    headers:
      body && !multipart ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? (multipart ? body : JSON.stringify(body)) : undefined,
  });
  const result = await res.json().catch(() => ({}));
  if (!res.ok)
    throw new Error(
      result.error || 'The request could not be completed. Please try again.',
    );
  return result;
}

function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    document.body.style.overflow = 'hidden';
    const node = ref.current;
    node
      ?.querySelector<HTMLElement>('button, input, select, textarea')
      ?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key === 'Tab') {
        const elements = Array.from(
          node?.querySelectorAll<HTMLElement>(
            'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href]',
          ) || [],
        );
        const first = elements[0],
          last = elements.at(-1);
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener('keydown', key);
    return () => {
      document.body.style.overflow = '';
      document.removeEventListener('keydown', key);
      previous?.focus();
    };
  }, [onClose]);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="modal"
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="modal-heading">
          <div>
            <p className="eyebrow">ConsulEase</p>
            <h2>{title}</h2>
          </div>
          <button
            className="icon-button"
            onClick={onClose}
            aria-label="Close dialog"
          >
            <X size={21} />
          </button>
        </div>
        <div className="modal-content">{children}</div>
      </div>
    </div>
  );
}

function Login({ onLogin }: { onLogin: () => Promise<void> }) {
  const [register, setRegister] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  async function signIn(
    event?: React.FormEvent<HTMLFormElement>,
    demoEmail?: string,
  ) {
    event?.preventDefault();
    setBusy(true);
    setError('');
    try {
      const name = event
        ? new FormData(event.currentTarget).get('name')
        : undefined;
      await request(
        `auth/${register && !demoEmail ? 'register' : 'login'}`,
        {
          email: demoEmail || email,
          password: demoEmail ? 'ConsulEase2026!' : password,
          name,
        },
        'POST',
      );
      await onLogin();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="login-page">
      <div className="login-story">
        <a href="/" className="brand light">
          <span className="brand-mark">
            <ShieldCheck size={28} />
          </span>
          <span>
            ConsulEase<small>EMBASSY OF SOMALIA · MALAYSIA</small>
          </span>
        </a>
        <div className="login-intro">
          <span className="pill light-pill">
            <Globe2 size={14} /> Your embassy, wherever you are
          </span>
          <h1>
            Closer to home.
            <br />
            <span>One service at a time.</span>
          </h1>
          <p>
            A connected way to access consular services, manage your documents,
            and stay informed—from application to completion.
          </p>
          <div className="login-benefits">
            <div>
              <FileCheck2 size={22} />
              <span>
                Apply online<small>Your documents, submitted once.</small>
              </span>
            </div>
            <div>
              <CalendarDays size={22} />
              <span>
                Plan your visit<small>Book a time that works for you.</small>
              </span>
            </div>
            <div>
              <Bell size={22} />
              <span>
                Stay in the loop<small>Clear progress at every step.</small>
              </span>
            </div>
          </div>
        </div>
        <div className="login-footer">
          <span>Serving our community in Malaysia</span>
          <span>Academic prototype · Illustrative fees</span>
        </div>
        <div className="orb orb-one" />
        <div className="orb orb-two" />
      </div>
      <div className="login-panel">
        <div className="login-card">
          <p className="eyebrow">Welcome to ConsulEase</p>
          <h2>
            {register
              ? 'Create your citizen account'
              : 'Your consular journey starts here.'}
          </h2>
          <p>
            {register
              ? 'Keep your profile and documents together for every application.'
              : 'Sign in to access your services and application updates.'}
          </p>
          <div className="auth-tabs">
            <button
              className={!register ? 'active' : ''}
              onClick={() => {
                setRegister(false);
                setError('');
              }}
            >
              Sign in
            </button>
            <button
              className={register ? 'active' : ''}
              onClick={() => {
                setRegister(true);
                setError('');
              }}
            >
              Create account
            </button>
          </div>
          <form onSubmit={signIn}>
            {register && (
              <Field label="Full name">
                <input
                  name="name"
                  required
                  autoComplete="name"
                  maxLength={120}
                />
              </Field>
            )}
            <Field label="Email">
              <input
                name="email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
              />
            </Field>
            <Field
              label="Password"
              hint={
                register
                  ? 'At least 10 characters, with uppercase, lowercase, and a number.'
                  : undefined
              }
            >
              <input
                name="password"
                type="password"
                required
                minLength={register ? 10 : undefined}
                autoComplete={register ? 'new-password' : 'current-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
              />
            </Field>
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <button className="button primary wide" disabled={busy}>
              {busy ? 'Please wait…' : register ? 'Create account' : 'Sign in'}
              <ArrowRight size={17} />
            </button>
          </form>
          <div className="demo-accounts">
            <span>EXPLORE THE DEMO</span>
            <p>Use sample data to try each role.</p>
            <div>
              {[
                ['Citizen', 'citizen'],
                ['Officer', 'officer'],
                ['Admin', 'admin'],
              ].map(([name, role]) => (
                <button
                  className="button subtle"
                  key={role}
                  disabled={busy}
                  onClick={() => signIn(undefined, `${role}@consulease.test`)}
                >
                  {name}
                  <ChevronRight size={14} />
                </button>
              ))}
            </div>
          </div>
          <p className="login-note">
            <ShieldCheck size={15} /> Documents and applications are visible to
            authorized users.
          </p>
        </div>
      </div>
    </main>
  );
}

export default function Portal() {
  const [data, setData] = useState<Bootstrap | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [tab, setTab] = useState<Tab>('overview');
  const [dialog, setDialog] = useState<Dialog>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{
    message: string;
    error: boolean;
  } | null>(null);
  const [mobileNav, setMobileNav] = useState(false);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('ALL');
  const close = useCallback(() => setDialog(null), []);
  const reload = useCallback(async () => {
    const value = await request('bootstrap');
    setData(value);
    setLoadError('');
  }, []);
  useEffect(() => {
    request('bootstrap')
      .then(setData)
      .catch((e) => {
        if (
          !(e as Error).message.toLowerCase().includes('sign in') &&
          !(e as Error).message.toLowerCase().includes('authentication')
        )
          setLoadError((e as Error).message);
      })
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(null), toast.error ? 10000 : 5000);
      return () => clearTimeout(t);
    }
  }, [toast]);
  const mutate: Mutation = async (
    path,
    body,
    method = 'POST',
    message = 'Changes saved.',
  ) => {
    setBusy(true);
    try {
      await request(path, body, method);
      await reload();
      setToast({ message, error: false });
      return true;
    } catch (e) {
      setToast({ message: (e as Error).message, error: true });
      return false;
    } finally {
      setBusy(false);
    }
  };
  function navigate(next: Tab) {
    setTab(next);
    setMobileNav(false);
    setSearch('');
    setFilter('ALL');
  }
  async function logout() {
    try {
      await request('auth/logout', {}, 'POST');
      setData(null);
      setDialog(null);
      setTab('overview');
    } catch (e) {
      setToast({ message: (e as Error).message, error: true });
    }
  }
  if (loading)
    return (
      <div className="loading-screen">
        <ShieldCheck size={42} />
        <h2>ConsulEase</h2>
        <p>Connecting your services…</p>
      </div>
    );
  if (!data)
    return (
      <>
        <Login onLogin={reload} />
        {loadError && (
          <div className="toast error" role="alert">
            {loadError}
            <button
              className="icon-button"
              onClick={() => setLoadError('')}
              aria-label="Dismiss message"
            >
              <X size={16} />
            </button>
          </div>
        )}
      </>
    );
  const staff = data.user.role !== 'CITIZEN',
    admin = data.user.role === 'ADMIN';
  const unread = data.notifications.filter((n) => !n.read).length;
  const nav: { tab: Tab; name: string; icon: LucideIcon; count?: number }[] = [
    { tab: 'overview', name: 'Overview', icon: LayoutDashboard },
    {
      tab: 'applications',
      name: staff ? 'Application queue' : 'My applications',
      icon: FileText,
    },
    {
      tab: 'services',
      name: admin ? 'Service management' : 'Consular services',
      icon: Globe2,
    },
    {
      tab: 'documents',
      name: staff ? 'Document review' : 'My documents',
      icon: FileCheck2,
    },
    { tab: 'appointments', name: 'Appointments', icon: CalendarDays },
    { tab: 'payments', name: 'Payments & receipts', icon: CreditCard },
    { tab: 'notifications', name: 'Notifications', icon: Bell, count: unread },
    ...(admin
      ? [
          { tab: 'people' as Tab, name: 'Staff & accounts', icon: UsersRound },
          {
            tab: 'announcements' as Tab,
            name: 'Announcements',
            icon: MessageSquare,
          },
          { tab: 'reports' as Tab, name: 'Reports', icon: SlidersHorizontal },
        ]
      : []),
    { tab: 'profile', name: 'My profile', icon: UserRound },
  ];
  const activeApplications = data.applications.filter(
    (a) => !['DRAFT', 'COMPLETED', 'REJECTED'].includes(a.status),
  );
  const upcoming = data.appointments
    .filter((a) => ['BOOKED', 'CHECKED_IN'].includes(a.status))
    .sort((a, b) => a.slot.startsAt.localeCompare(b.slot.startsAt));
  const filteredApplications = data.applications
    .filter(
      (a) =>
        (filter === 'ALL' ||
          (filter === 'PRIORITY' ? a.priority : a.status === filter)) &&
        `${a.reference} ${a.service.name} ${a.user.name}`
          .toLowerCase()
          .includes(search.toLowerCase()),
    )
    .sort(
      (a, b) =>
        Number(b.priority) - Number(a.priority) ||
        b.updatedAt.localeCompare(a.updatedAt),
    );
  const selectedApplication =
    dialog?.kind === 'case'
      ? data.applications.find((a) => a.id === dialog.id)
      : undefined;
  function applicationTable(apps: Application[], compact = false) {
    return apps.length ? (
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Application</th>
              {staff && <th>Applicant</th>}
              <th>Status</th>
              <th>{compact ? 'Updated' : 'Submitted'}</th>
              <th aria-label="Open application" />
            </tr>
          </thead>
          <tbody>
            {apps.map((a) => (
              <tr key={a.id}>
                <td>
                  <button
                    className="table-link"
                    onClick={() => setDialog({ kind: 'case', id: a.id })}
                  >
                    {a.service.name}
                    {a.priority && (
                      <span className="priority-tag">
                        <Siren size={12} /> Priority
                      </span>
                    )}
                    <small>{a.reference}</small>
                  </button>
                </td>
                {staff && (
                  <td>
                    <strong className="small-strong">{a.user.name}</strong>
                    <small className="table-small">{a.user.email}</small>
                  </td>
                )}
                <td>
                  <Badge value={a.status} />
                </td>
                <td className="muted">
                  {date(compact ? a.updatedAt : a.submittedAt || a.createdAt)}
                </td>
                <td>
                  <button
                    className="icon-button"
                    aria-label={`Open ${a.reference}`}
                    onClick={() => setDialog({ kind: 'case', id: a.id })}
                  >
                    <ChevronRight size={18} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    ) : (
      <Empty
        title="No applications yet"
        text={
          staff
            ? 'Submitted applications will appear in this queue.'
            : 'Choose a consular service to start your first application.'
        }
      >
        {!staff && (
          <button
            className="button primary"
            onClick={() => navigate('services')}
          >
            Explore services
            <ArrowRight size={16} />
          </button>
        )}
      </Empty>
    );
  }
  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileNav ? 'open' : ''}`}>
        <a href="/" className="brand">
          <span className="brand-mark">
            <ShieldCheck size={27} />
          </span>
          <span>
            ConsulEase<small>CONSULAR SERVICES PORTAL</small>
          </span>
        </a>
        <div className="workspace-label">
          <span className="online-dot" />
          {staff ? 'Staff workspace' : 'Citizen workspace'}
          <span className="workspace-role">{label(data.user.role)}</span>
        </div>
        <nav aria-label="Main navigation">
          {nav.map((item) => (
            <button
              key={item.tab}
              className={`nav-item ${tab === item.tab ? 'active' : ''}`}
              onClick={() => navigate(item.tab)}
            >
              <item.icon size={18} />
              <span>{item.name}</span>
              {!!item.count && <span className="nav-count">{item.count}</span>}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="help-card">
            <CircleHelp size={21} />
            <strong>Here to help</strong>
            <p>
              Need assistance? Contact the embassy through its official
              channels.
            </p>
            <span>Embassy of Somalia in Malaysia</span>
          </div>
          <div className="account">
            <span className="avatar">
              {data.user.name
                .split(' ')
                .slice(0, 2)
                .map((n) => n[0])
                .join('')}
            </span>
            <div>
              <strong>{data.user.name}</strong>
              <small>{label(data.user.role)}</small>
            </div>
            <button
              className="icon-button"
              aria-label="Sign out"
              onClick={logout}
            >
              <LogOut size={17} />
            </button>
          </div>
        </div>
      </aside>
      {mobileNav && (
        <button
          className="nav-overlay"
          aria-label="Close navigation"
          onClick={() => setMobileNav(false)}
        />
      )}
      <div className="app-main">
        <header className="topbar">
          <div>
            <button
              className="icon-button menu-toggle"
              onClick={() => setMobileNav(!mobileNav)}
              aria-label="Open navigation"
            >
              <Menu size={22} />
            </button>
            <span className="breadcrumb">
              Workspace <ChevronRight size={13} />
              <strong>{nav.find((n) => n.tab === tab)?.name}</strong>
            </span>
          </div>
          <div className="topbar-end">
            <span className="location">
              <Globe2 size={14} /> Kuala Lumpur, Malaysia
            </span>
            <button
              className="notification-button icon-button"
              aria-label="View notifications"
              onClick={() => navigate('notifications')}
            >
              <Bell size={19} />
              {unread > 0 && <i />}
            </button>
            <span className="mini-avatar">{data.user.name[0]}</span>
          </div>
        </header>
        <main className="content" id="main-content">
          {tab === 'overview' && (
            <>
              <Heading
                eyebrow={staff ? 'Consular operations' : 'Your citizen portal'}
                title={`Good ${new Date().getUTCHours() + 8 < 12 ? 'morning' : 'day'}, ${data.user.name.split(' ')[0]}.`}
                text={
                  staff
                    ? 'A clear view of your cases, appointments, and next actions.'
                    : 'Your services, documents, and appointments. All in one place.'
                }
              >
                <span className="today">
                  <CalendarDays size={16} />
                  {date(new Date().toISOString())}
                </span>
              </Heading>
              <section className="welcome-banner">
                <div>
                  <span className="pill">
                    <ShieldCheck size={13} />
                    {staff
                      ? 'Connected consular workflow'
                      : 'Consular services, connected'}
                  </span>
                  <h2>
                    {staff
                      ? 'Every case. A clear next step.'
                      : 'Less waiting. More peace of mind.'}
                  </h2>
                  <p>
                    {staff
                      ? 'Review submissions, verify documents, and help our community move forward.'
                      : 'Submit an application online and track every step of your journey. We’ll let you know when it’s time to visit.'}
                  </p>
                  <button
                    className="button white"
                    onClick={() =>
                      navigate(staff ? 'applications' : 'services')
                    }
                  >
                    {staff ? 'Review applications' : 'Start an application'}
                    <ArrowRight size={17} />
                  </button>
                </div>
                <div className="banner-art" aria-hidden="true">
                  <div className="art-circle">
                    <Globe2 size={124} strokeWidth={0.65} />
                  </div>
                  <div className="art-card">
                    <FileCheck2 size={23} />
                    <span>
                      Your journey<small>Connected from start to finish</small>
                    </span>
                    <CheckCircle2 size={21} />
                  </div>
                  <span className="art-star">✦</span>
                </div>
              </section>
              <section className="stat-grid" aria-label="Workspace statistics">
                {[
                  {
                    title: staff ? 'Active cases' : 'Active applications',
                    value: activeApplications.length,
                    caption: staff
                      ? `${data.applications.filter((a) => a.priority).length} priority cases`
                      : 'We’re keeping things moving',
                    icon: FileText,
                    color: 'blue',
                  },
                  {
                    title: 'Upcoming appointments',
                    value: upcoming.length,
                    caption: 'All times in Malaysia (MYT)',
                    icon: CalendarDays,
                    color: 'teal',
                  },
                  {
                    title: staff ? 'Documents to review' : 'Saved documents',
                    value: staff
                      ? data.documents.filter((d) => d.status === 'PENDING')
                          .length
                      : data.documents.length,
                    caption: staff
                      ? 'Awaiting verification'
                      : 'Ready to reuse in applications',
                    icon: FileCheck2,
                    color: 'violet',
                  },
                  {
                    title: staff ? 'Recorded payments' : 'Unread updates',
                    value: staff
                      ? money(
                          data.payments
                            .filter((p) => p.status === 'PAID')
                            .reduce((n, p) => n + p.amount, 0),
                        )
                      : unread,
                    caption: staff
                      ? 'Confirmed collection, MYR'
                      : 'Stay up to date with your cases',
                    icon: staff ? CreditCard : Bell,
                    color: 'orange',
                  },
                ].map((s) => (
                  <div className="stat-card" key={s.title}>
                    <div>
                      <span>{s.title}</span>
                      <span className={`stat-icon ${s.color}`}>
                        <s.icon size={19} />
                      </span>
                    </div>
                    <strong>{s.value}</strong>
                    <small>{s.caption}</small>
                  </div>
                ))}
              </section>
              <div className="dashboard-grid">
                <section className="panel">
                  <div className="panel-heading">
                    <div>
                      <h2>
                        {staff
                          ? 'Applications needing attention'
                          : 'Recent applications'}
                      </h2>
                      <p>
                        {staff
                          ? 'Priority cases are shown first.'
                          : 'Follow your progress at a glance.'}
                      </p>
                    </div>
                    <button
                      className="text-button"
                      onClick={() => navigate('applications')}
                    >
                      View all
                      <ArrowRight size={15} />
                    </button>
                  </div>
                  {applicationTable(filteredApplications.slice(0, 4), true)}
                </section>
                <section className="panel appointment-panel">
                  <div className="panel-heading">
                    <h2>Your next appointment</h2>
                    <CalendarDays size={20} />
                  </div>
                  {upcoming[0] ? (
                    <>
                      <span className="appointment-date">
                        {date(upcoming[0].slot.startsAt, true)}
                      </span>
                      <h3>
                        {data.applications.find(
                          (a) => a.id === upcoming[0].applicationId,
                        )?.service.name ||
                          upcoming[0].application?.service.name}
                      </h3>
                      <p>
                        {upcoming[0].slot.purpose}
                        <br />
                        Embassy of Somalia, Malaysia
                      </p>
                      <span className="pill soft">
                        <Clock3 size={13} /> Queue #{upcoming[0].queueNumber}
                      </span>
                      <button
                        className="button subtle wide"
                        onClick={() => navigate('appointments')}
                      >
                        Manage appointment
                        <ChevronRight size={16} />
                      </button>
                    </>
                  ) : (
                    <Empty
                      icon={CalendarDays}
                      title="No visit scheduled"
                      text="Book an appointment when your application requires a visit."
                    />
                  )}
                </section>
              </div>
              <div className="section-heading">
                <div>
                  <h2>
                    {staff ? 'Community updates' : 'How can we help you today?'}
                  </h2>
                  <p>
                    {staff
                      ? 'Announcements published for our community.'
                      : 'Explore the most requested consular services.'}
                  </p>
                </div>
                <button
                  className="text-button"
                  onClick={() =>
                    navigate(staff && admin ? 'announcements' : 'services')
                  }
                >
                  View all
                  <ArrowRight size={15} />
                </button>
              </div>
              {!staff ? (
                <div className="quick-services">
                  {data.services
                    .filter((s) => s.active && s.applicationEnabled)
                    .slice(0, 4)
                    .map((s) => {
                      const Icon = serviceIcon(s.code);
                      return (
                        <button
                          className="quick-service"
                          key={s.id}
                          onClick={() =>
                            setDialog({ kind: 'apply', service: s })
                          }
                        >
                          <span className="service-icon">
                            <Icon size={24} />
                          </span>
                          <strong>{s.name}</strong>
                          <small>
                            {s.requiresAppointment
                              ? 'Online + embassy visit'
                              : 'Apply online'}
                          </small>
                          <ChevronRight size={18} />
                        </button>
                      );
                    })}
                </div>
              ) : (
                <Announcements data={data} />
              )}
              {!staff && data.announcements.length > 0 && (
                <div className="announcement-strip">
                  <MessageSquare size={23} />
                  <div>
                    <span>COMMUNITY NOTICE</span>
                    <strong>{data.announcements[0].title}</strong>
                    <p>{data.announcements[0].body}</p>
                  </div>
                  <button
                    className="text-button"
                    onClick={() => navigate('notifications')}
                  >
                    Read updates
                    <ArrowRight size={15} />
                  </button>
                </div>
              )}
            </>
          )}
          {tab === 'services' && (
            <>
              <Heading
                eyebrow={admin ? 'Administration' : 'Available services'}
                title={admin ? 'Service management' : 'How can we help?'}
                text="One profile. Reusable documents. A clear path through each service."
              />
              <div className="notice">
                <ShieldCheck size={18} />
                <p>
                  Fees and requirements shown here are illustrative prototype
                  data. Confirm official requirements with the embassy before
                  applying.
                </p>
              </div>
              <div className="service-grid">
                {data.services
                  .filter((s) => admin || s.active)
                  .map((s) => {
                    const Icon = serviceIcon(s.code);
                    return (
                      <article
                        className={`service-card ${/EMERGENCY/i.test(s.code) ? 'emergency' : ''}`}
                        key={s.id}
                      >
                        <div className="service-top">
                          <span className="service-icon">
                            <Icon size={25} />
                          </span>
                          {!s.active ? (
                            <Badge value="INACTIVE" />
                          ) : s.priorityAllowed ? (
                            <span className="priority-tag">
                              <Siren size={12} /> Priority available
                            </span>
                          ) : (
                            <span className="tiny-label">
                              {s.requiresAppointment
                                ? 'VISIT REQUIRED'
                                : 'ONLINE SERVICE'}
                            </span>
                          )}
                        </div>
                        <h2>{s.name}</h2>
                        <p>{s.description}</p>
                        <div className="service-meta">
                          <span>
                            <FileCheck2 size={14} />
                            {
                              s.requirements.filter((r) => r.required).length
                            }{' '}
                            required documents
                          </span>
                          <span>
                            <Clock3 size={14} />
                            {s.requiresAppointment
                              ? 'Appointment needed'
                              : 'Online processing'}
                          </span>
                        </div>
                        <div className="service-bottom">
                          <div>
                            <small>
                              {s.applicationEnabled
                                ? 'Standard fee'
                                : 'Community service'}
                            </small>
                            <strong>{money(s.standardFee)}</strong>
                          </div>
                          {admin ? (
                            <button
                              className="button subtle"
                              onClick={() =>
                                setDialog({ kind: 'service', service: s })
                              }
                            >
                              <Settings2 size={15} />
                              Configure
                            </button>
                          ) : s.applicationEnabled ? (
                            <button
                              className="button primary"
                              onClick={() =>
                                setDialog({ kind: 'apply', service: s })
                              }
                            >
                              Apply
                              <ArrowRight size={15} />
                            </button>
                          ) : (
                            <button
                              className="button subtle"
                              onClick={() => navigate('notifications')}
                            >
                              Read notices
                              <ArrowRight size={15} />
                            </button>
                          )}
                        </div>
                      </article>
                    );
                  })}
              </div>
            </>
          )}
          {tab === 'applications' && (
            <>
              <Heading
                eyebrow={staff ? 'Case management' : 'Application tracking'}
                title={staff ? 'Application queue' : 'My applications'}
                text={
                  staff
                    ? 'Review, verify, and manage every stage of a consular case.'
                    : 'Your applications and their progress, from draft to completion.'
                }
              >
                {!staff && (
                  <button
                    className="button primary"
                    onClick={() => navigate('services')}
                  >
                    <Plus size={16} />
                    New application
                  </button>
                )}
              </Heading>
              <div className="filters">
                <div className="search-box">
                  <Search size={17} />
                  <input
                    aria-label="Search applications"
                    placeholder="Search reference, service, or name…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
                <select
                  aria-label="Filter application status"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                >
                  <option value="ALL">All statuses</option>
                  <option value="PRIORITY">Priority cases</option>
                  {[
                    'DRAFT',
                    'SUBMITTED',
                    'UNDER_REVIEW',
                    'NEEDS_INFO',
                    'APPOINTMENT_REQUIRED',
                    'APPROVED',
                    'READY_FOR_COLLECTION',
                    'COMPLETED',
                    'REJECTED',
                  ].map((s) => (
                    <option value={s} key={s}>
                      {label(s)}
                    </option>
                  ))}
                </select>
                <span className="muted">
                  {filteredApplications.length} applications
                </span>
              </div>
              <section className="panel">
                {applicationTable(filteredApplications)}
              </section>
            </>
          )}
          {tab === 'documents' && (
            <DocumentsView data={data} busy={busy} mutate={mutate} />
          )}
          {tab === 'appointments' && (
            <AppointmentsView
              data={data}
              busy={busy}
              mutate={mutate}
              onSlot={() => setDialog({ kind: 'slot' })}
            />
          )}
          {tab === 'payments' && (
            <PaymentsView data={data} busy={busy} mutate={mutate} />
          )}
          {tab === 'profile' && (
            <ProfileView user={data.user} busy={busy} mutate={mutate} />
          )}
          {tab === 'notifications' && (
            <>
              <Heading
                eyebrow="Stay connected"
                title="Notifications & community"
                text="Application updates and the latest news from the embassy."
              >
                <button
                  className="button subtle"
                  disabled={busy || !unread}
                  onClick={() =>
                    mutate(
                      'notifications/read',
                      {},
                      'POST',
                      'All notifications marked as read.',
                    )
                  }
                >
                  <Check size={16} />
                  Mark all as read
                </button>
              </Heading>
              <div className="dashboard-grid">
                <section className="panel">
                  <div className="panel-heading">
                    <h2>Your updates</h2>
                    <span className="pill soft">{unread} unread</span>
                  </div>
                  {data.notifications.length ? (
                    data.notifications.map((n) => (
                      <article
                        className={`notification-item ${!n.read ? 'unread' : ''}`}
                        key={n.id}
                      >
                        <span className="notification-icon">
                          <Bell size={17} />
                        </span>
                        <div>
                          <strong>{n.title}</strong>
                          <p>{n.message}</p>
                          <small>{date(n.createdAt, true)}</small>
                        </div>
                        {!n.read && <span className="online-dot" />}
                      </article>
                    ))
                  ) : (
                    <Empty
                      icon={Bell}
                      title="You're all caught up"
                      text="Application and appointment updates will appear here."
                    />
                  )}
                </section>
                <section>
                  <div className="section-heading">
                    <h2>Community announcements</h2>
                  </div>
                  <Announcements data={data} />
                </section>
              </div>
            </>
          )}
          {tab === 'people' && admin && (
            <>
              <Heading
                eyebrow="Administration"
                title="Staff & accounts"
                text="Manage access and responsibilities across your team."
              >
                <button
                  className="button primary"
                  onClick={() => setDialog({ kind: 'staff' })}
                >
                  <Plus size={16} />
                  Add staff member
                </button>
              </Heading>
              <section className="panel">
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Name & email</th>
                        <th>Role</th>
                        <th>Access</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.users?.map((u) => (
                        <tr key={u.id}>
                          <td>
                            <strong className="small-strong">{u.name}</strong>
                            <small className="table-small">{u.email}</small>
                          </td>
                          <td>
                            {u.role === 'CITIZEN' ? (
                              <Badge value={u.role} />
                            ) : (
                              <select
                                aria-label={`Role for ${u.name}`}
                                value={u.role}
                                disabled={busy || u.id === data.user.id}
                                onChange={(e) =>
                                  mutate(
                                    `users/${u.id}`,
                                    { role: e.target.value },
                                    'PATCH',
                                    'Staff role updated.',
                                  )
                                }
                              >
                                <option value="OFFICER">Officer</option>
                                <option value="ADMIN">Admin</option>
                              </select>
                            )}
                          </td>
                          <td>
                            <Badge value={u.active ? 'ACTIVE' : 'INACTIVE'} />
                          </td>
                          <td>
                            <button
                              className="button subtle small"
                              disabled={busy || u.id === data.user.id}
                              onClick={() =>
                                mutate(
                                  `users/${u.id}`,
                                  { active: !u.active },
                                  'PATCH',
                                  'Account access updated.',
                                )
                              }
                            >
                              {u.active ? 'Deactivate' : 'Activate'}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          )}
          {tab === 'announcements' && admin && (
            <>
              <Heading
                eyebrow="Administration"
                title="Community announcements"
                text="Publish news and service notices for citizen accounts."
              >
                <button
                  className="button primary"
                  onClick={() => setDialog({ kind: 'announcement' })}
                >
                  <Plus size={16} />
                  New announcement
                </button>
              </Heading>
              <div className="announcement-grid">
                {data.announcements.map((a) => (
                  <article className="panel announcement-card" key={a.id}>
                    <div>
                      <Badge value={a.published ? 'PUBLISHED' : 'DRAFT'} />
                      <small>{date(a.createdAt)}</small>
                    </div>
                    <h2>{a.title}</h2>
                    <p>{a.body}</p>
                    <div className="action-row">
                      <button
                        className="button subtle"
                        onClick={() =>
                          setDialog({ kind: 'announcement', announcement: a })
                        }
                      >
                        Edit
                      </button>
                      <button
                        className="button subtle"
                        disabled={busy}
                        onClick={() =>
                          mutate(
                            `announcements/${a.id}`,
                            { published: !a.published },
                            'PATCH',
                            'Announcement updated.',
                          )
                        }
                      >
                        {a.published ? 'Unpublish' : 'Publish'}
                      </button>
                      <button
                        className="button danger"
                        disabled={busy}
                        onClick={() => {
                          if (window.confirm('Delete this announcement?'))
                            mutate(
                              `announcements/${a.id}`,
                              {},
                              'DELETE',
                              'Announcement deleted.',
                            );
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </>
          )}
          {tab === 'reports' && admin && data.report && (
            <>
              <Heading
                eyebrow="Administration"
                title="Reports & insights"
                text="Live operational statistics from the consular database."
              >
                <a
                  className="button primary"
                  href="/api/reports?format=csv"
                  download
                >
                  <ArrowDownToLine size={16} />
                  Export CSV
                </a>
              </Heading>
              <section className="stat-grid">
                {[
                  {
                    label: 'Total applications',
                    value: data.report.totalApplications,
                  },
                  {
                    label: 'Collected revenue',
                    value: money(data.report.collectedRevenue),
                  },
                  {
                    label: 'Registered citizens',
                    value: data.report.totalCitizens,
                  },
                  {
                    label: 'Average completion',
                    value: `${data.report.averageCompletionDays.toFixed(1)} days`,
                  },
                ].map((s) => (
                  <div className="stat-card" key={s.label}>
                    <span>{s.label}</span>
                    <strong>{s.value}</strong>
                    <small>Live database statistics</small>
                  </div>
                ))}
              </section>
              <div className="dashboard-grid">
                <section className="panel report-panel">
                  <h2>Application status</h2>
                  {Object.entries(data.report.byStatus).map(([name, count]) => (
                    <div className="report-row" key={name}>
                      <span>{label(name)}</span>
                      <div>
                        <i
                          style={{
                            width: `${Math.max(2, (count / Math.max(1, data.report!.totalApplications)) * 100)}%`,
                          }}
                        />
                      </div>
                      <strong>{count}</strong>
                    </div>
                  ))}
                </section>
                <section className="panel report-panel">
                  <h2>Service usage</h2>
                  {data.report.byService.map((s) => (
                    <div className="report-row" key={s.service}>
                      <span>{s.service}</span>
                      <strong>{s.count}</strong>
                    </div>
                  ))}
                  <div className="report-note">
                    <span>
                      Waived fees:{' '}
                      <strong>{money(data.report.waivedAmount)}</strong>
                    </span>
                    <span>
                      Recorded appointments:{' '}
                      <strong>{data.report.appointmentCount}</strong>
                    </span>
                    <span>
                      Audit events: <strong>{data.report.auditCount}</strong>
                    </span>
                  </div>
                </section>
              </div>
            </>
          )}
          <footer className="content-footer">
            <span>ConsulEase · Embassy of Somalia in Malaysia</span>
            <span>
              Academic prototype · All appointment times in MYT (UTC+8)
            </span>
          </footer>
        </main>
      </div>
      {toast && (
        <div
          className={`toast ${toast.error ? 'error' : 'success'}`}
          role={toast.error ? 'alert' : 'status'}
        >
          {toast.error ? <CircleHelp size={19} /> : <CheckCircle2 size={19} />}
          <span>{toast.message}</span>
          <button
            className="icon-button"
            onClick={() => setToast(null)}
            aria-label="Dismiss message"
          >
            <X size={16} />
          </button>
        </div>
      )}
      {dialog?.kind === 'apply' && (
        <Modal title={dialog.service.name} onClose={close}>
          <ApplicationForm
            service={dialog.service}
            documents={data.documents}
            user={data.user}
            busy={busy}
            mutate={mutate}
            onDone={close}
          />
        </Modal>
      )}
      {dialog?.kind === 'case' && selectedApplication && (
        <Modal title={selectedApplication.reference} onClose={close}>
          <CaseView
            application={selectedApplication}
            data={data}
            busy={busy}
            mutate={mutate}
          />
        </Modal>
      )}
      {dialog?.kind === 'service' && (
        <Modal title="Configure service" onClose={close}>
          <ServiceForm
            service={dialog.service}
            busy={busy}
            mutate={mutate}
            onDone={close}
          />
        </Modal>
      )}
      {dialog?.kind === 'staff' && (
        <Modal title="Add staff member" onClose={close}>
          <StaffForm busy={busy} mutate={mutate} onDone={close} />
        </Modal>
      )}
      {dialog?.kind === 'announcement' && (
        <Modal
          title={
            dialog.announcement
              ? 'Edit community announcement'
              : 'New community announcement'
          }
          onClose={close}
        >
          <AnnouncementForm
            announcement={dialog.announcement}
            busy={busy}
            mutate={mutate}
            onDone={close}
          />
        </Modal>
      )}
      {dialog?.kind === 'slot' && (
        <Modal title="Create appointment slot" onClose={close}>
          <SlotForm busy={busy} mutate={mutate} onDone={close} />
        </Modal>
      )}
    </div>
  );
}

function Announcements({ data }: { data: Bootstrap }) {
  return data.announcements.filter((a) => a.published).length ? (
    <div className="announcements-list">
      {data.announcements
        .filter((a) => a.published)
        .map((a) => (
          <article className="panel announcement-card" key={a.id}>
            <span className="tiny-label">
              COMMUNITY UPDATE · {date(a.createdAt)}
            </span>
            <h3>{a.title}</h3>
            <p>{a.body}</p>
          </article>
        ))}
    </div>
  ) : (
    <Empty
      icon={MessageSquare}
      title="No announcements"
      text="Community news and service notices will be posted here."
    />
  );
}

function ApplicationForm({
  service,
  documents,
  user,
  busy,
  mutate,
  onDone,
  application,
}: {
  service: Service;
  documents: Document[];
  user: User;
  busy: boolean;
  mutate: Mutation;
  onDone: () => void;
  application?: Application;
}) {
  const [selected, setSelected] = useState<string[]>(
    application?.documents.map((d) => d.id) || [],
  );
  const [priority, setPriority] = useState(
    application?.priority || /EMERGENCY/i.test(service.code),
  );
  async function save(e: React.FormEvent<HTMLFormElement>, submit = false) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const details = Object.fromEntries(
      [
        'purpose',
        'passportNumber',
        'destination',
        'travelDate',
        'additionalInformation',
        'emergencyReason',
      ].map((key) => [key, String(f.get(key) || '')]),
    );
    if (application) {
      const ok = await mutate(
        `applications/${application.id}`,
        { details, documentIds: selected },
        'PATCH',
        'Application draft saved.',
      );
      if (ok) onDone();
    } else {
      if (
        await mutate(
          'applications',
          { serviceId: service.id, details, documentIds: selected, priority },
          'POST',
          'Draft created. Open it in My applications when you are ready to submit.',
        )
      )
        onDone();
    }
    void submit;
  }
  return (
    <form onSubmit={save}>
      <div className="notice">
        <FileCheck2 size={18} />
        <p>{service.description}</p>
      </div>
      <div className="requirement-box">
        <h3>Before you apply</h3>
        <ul>
          {service.eligibility.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
        <h4>What happens next</h4>
        <ol>
          {service.procedures.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ol>
      </div>
      <div className="form-grid">
        <Field label="Purpose of application">
          <input
            name="purpose"
            required
            maxLength={500}
            defaultValue={application?.details.purpose || ''}
            placeholder="Briefly describe your request"
          />
        </Field>
        <Field label="Passport / identity number">
          <input
            name="passportNumber"
            required
            maxLength={80}
            defaultValue={
              application?.details.passportNumber || user.passportNumber
            }
          />
        </Field>
        {/VISA|EMERGENCY/i.test(service.code) && (
          <>
            <Field label="Destination">
              <input
                name="destination"
                maxLength={160}
                defaultValue={application?.details.destination || ''}
              />
            </Field>
            <Field label="Planned travel date">
              <input
                name="travelDate"
                type="date"
                defaultValue={application?.details.travelDate || ''}
              />
            </Field>
          </>
        )}
      </div>
      {priority && (
        <Field label="Reason for urgent processing">
          <textarea
            name="emergencyReason"
            required
            rows={2}
            maxLength={2000}
            defaultValue={application?.details.emergencyReason || ''}
            placeholder="Explain the emergency and why priority processing is needed"
          />
        </Field>
      )}
      <Field label="Additional information">
        <textarea
          name="additionalInformation"
          rows={3}
          maxLength={4000}
          defaultValue={application?.details.additionalInformation || ''}
          placeholder="Any details that may help our staff review your application"
        />
      </Field>
      <fieldset className="document-choices">
        <legend>Attach your saved documents</legend>
        <p>
          Required:{' '}
          {service.requirements
            .filter((r) => r.required)
            .map((r) => r.label)
            .join(', ') || 'No documents required'}
          .
        </p>
        {documents
          .filter((d) => d.status !== 'REJECTED')
          .map((d) => (
            <label className="checkbox-row" key={d.id}>
              <input
                type="checkbox"
                checked={selected.includes(d.id)}
                onChange={(e) =>
                  setSelected((ids) =>
                    e.target.checked
                      ? [...ids, d.id]
                      : ids.filter((id) => id !== d.id),
                  )
                }
              />
              <FileText size={17} />
              <span>
                <strong>{d.name}</strong>
                <small>{label(d.category)}</small>
              </span>
              <Badge value={d.status} />
            </label>
          ))}
        {!documents.length && (
          <p className="hint">
            Upload supporting files in My documents before submitting. You can
            save a draft now.
          </p>
        )}
      </fieldset>
      {service.priorityAllowed && !application && (
        <label className="checkbox-row priority-choice">
          <input
            type="checkbox"
            checked={priority}
            onChange={(e) => setPriority(e.target.checked)}
          />
          <Siren size={19} />
          <span>
            <strong>Request priority processing</strong>
            <small>
              For urgent or emergency cases. Priority fee:{' '}
              {money(service.priorityFee)}
            </small>
          </span>
        </label>
      )}
      <div className="form-summary">
        <span>{application ? 'Locked application fee' : 'Estimated fee'}</span>
        <strong>
          {money(
            application?.feeAmount ??
              (priority ? service.priorityFee : service.standardFee),
          )}
        </strong>
      </div>
      <p className="hint">
        Save your draft, then review and submit it from My applications. Staff
        will confirm documents and any required embassy visit.
      </p>
      <FormButtons busy={busy} text="Save draft" />
    </form>
  );
}

function CaseView({
  application: a,
  data,
  busy,
  mutate,
}: {
  application: Application;
  data: Bootstrap;
  busy: boolean;
  mutate: Mutation;
}) {
  const [editing, setEditing] = useState(false);
  const [status, setStatus] = useState<ApplicationStatus>('UNDER_REVIEW');
  const [remark, setRemark] = useState('');
  const [identity, setIdentity] = useState(a.identityVerified);
  const [slot, setSlot] = useState('');
  const staff = data.user.role !== 'CITIZEN';
  const transitions: Record<ApplicationStatus, ApplicationStatus[]> = {
    DRAFT: [],
    SUBMITTED: ['UNDER_REVIEW', 'REJECTED'],
    UNDER_REVIEW: [
      'NEEDS_INFO',
      ...(a.service.requiresAppointment
        ? ['APPOINTMENT_REQUIRED' as ApplicationStatus]
        : []),
      'APPROVED',
      'REJECTED',
    ],
    NEEDS_INFO: [],
    APPOINTMENT_REQUIRED: ['UNDER_REVIEW', 'NEEDS_INFO', 'REJECTED'],
    APPROVED: ['READY_FOR_COLLECTION'],
    READY_FOR_COLLECTION: ['COMPLETED'],
    COMPLETED: [],
    REJECTED: [],
  };
  useEffect(() => {
    setStatus(transitions[a.status][0] || a.status);
    setIdentity(a.identityVerified);
  }, [a.status, a.identityVerified]); // eslint-disable-line react-hooks/exhaustive-deps
  if (editing && !staff)
    return (
      <>
        <button className="text-button" onClick={() => setEditing(false)}>
          ← Back to application
        </button>
        <ApplicationForm
          service={a.service}
          documents={data.documents}
          user={data.user}
          application={a}
          busy={busy}
          mutate={mutate}
          onDone={() => setEditing(false)}
        />
      </>
    );
  const eligibleSlots = data.slots.filter(
    (s) =>
      s.active &&
      s.bookedCount < s.capacity &&
      new Date(s.startsAt) > new Date(),
  );
  const hasAppointment = a.appointments.some((p) =>
    ['BOOKED', 'CHECKED_IN', 'COMPLETED'].includes(p.status),
  );
  return (
    <div className="case-detail">
      <div className="case-title">
        <span className="service-icon">
          <FileText size={26} />
        </span>
        <div>
          <h3>{a.service.name}</h3>
          <p>
            {a.user.name} · Created {date(a.createdAt)}
          </p>
        </div>
        <Badge value={a.status} />
      </div>
      {a.priority && (
        <div className="notice warning">
          <Siren size={18} />
          <p>Priority case · Urgent processing requested</p>
        </div>
      )}
      <div className="case-progress">
        {['SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'COMPLETED'].map((s, i) => (
          <div
            className={
              [
                'DRAFT',
                'SUBMITTED',
                'UNDER_REVIEW',
                'APPROVED',
                'READY_FOR_COLLECTION',
                'COMPLETED',
              ].indexOf(a.status) >=
              [
                'DRAFT',
                'SUBMITTED',
                'UNDER_REVIEW',
                'APPROVED',
                'READY_FOR_COLLECTION',
                'COMPLETED',
              ].indexOf(s)
                ? 'done'
                : ''
            }
            key={s}
          >
            <span>{i + 1}</span>
            <small>{label(s)}</small>
          </div>
        ))}
      </div>
      <div className="detail-grid">
        <div>
          <small>Purpose</small>
          <strong>{a.details.purpose || '—'}</strong>
        </div>
        <div>
          <small>Passport / identity number</small>
          <strong>{a.details.passportNumber || '—'}</strong>
        </div>
        <div>
          <small>Application fee</small>
          <strong>
            {money(a.feeAmount)} ·{' '}
            {a.payments.length ? 'Recorded' : 'Awaiting payment'}
          </strong>
        </div>
        <div>
          <small>Identity check</small>
          <strong>
            {a.identityVerified
              ? 'Verified by staff'
              : a.service.requiresIdentity
                ? 'Required at the embassy'
                : 'Not required'}
          </strong>
        </div>
        {a.details.destination && (
          <div>
            <small>Destination</small>
            <strong>{a.details.destination}</strong>
          </div>
        )}
        {a.details.travelDate && (
          <div>
            <small>Travel date</small>
            <strong>{a.details.travelDate}</strong>
          </div>
        )}
      </div>
      {a.details.additionalInformation && (
        <p className="case-note">{a.details.additionalInformation}</p>
      )}
      <h3 className="detail-section-title">Supporting documents</h3>
      {a.documents.length ? (
        a.documents.map((d) => (
          <div className="attached-document" key={d.id}>
            <FileText size={19} />
            <a
              href={`/api/documents/${d.id}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              {d.name}
              <small>
                {label(d.category)}
                {d.remark && ` · ${d.remark}`}
              </small>
            </a>
            <Badge value={d.status} />
            {staff &&
              !data.applications.some(
                (c) =>
                  ['APPROVED', 'READY_FOR_COLLECTION', 'COMPLETED'].includes(
                    c.status,
                  ) && c.documents.some((x) => x.id === d.id),
              ) && (
                <>
                  <button
                    className="button subtle small"
                    disabled={busy}
                    onClick={() =>
                      mutate(
                        `documents/${d.id}`,
                        {
                          status: 'VERIFIED',
                          remark: 'Document reviewed by consular staff.',
                        },
                        'PATCH',
                        'Document verified.',
                      )
                    }
                  >
                    Verify
                  </button>
                  <button
                    className="button danger small"
                    disabled={busy}
                    onClick={() =>
                      mutate(
                        `documents/${d.id}`,
                        {
                          status: 'REJECTED',
                          remark:
                            remark ||
                            'Please upload a clear, valid replacement document.',
                        },
                        'PATCH',
                        'Document rejected.',
                      )
                    }
                  >
                    Reject
                  </button>
                </>
              )}
          </div>
        ))
      ) : (
        <p className="hint">No supporting documents attached.</p>
      )}
      {!staff && ['DRAFT', 'NEEDS_INFO'].includes(a.status) && (
        <div className="action-row">
          <button className="button subtle" onClick={() => setEditing(true)}>
            Edit application
          </button>
          <button
            className="button primary"
            disabled={busy}
            onClick={() =>
              mutate(
                `applications/${a.id}/submit`,
                {},
                'POST',
                'Application submitted. You can follow its progress here.',
              )
            }
          >
            Submit application
            <ArrowRight size={16} />
          </button>
        </div>
      )}
      {!staff && a.status === 'APPOINTMENT_REQUIRED' && !hasAppointment && (
        <form
          className="action-box"
          onSubmit={async (e) => {
            e.preventDefault();
            if (
              await mutate(
                'appointments',
                { applicationId: a.id, slotId: slot },
                'POST',
                'Appointment booked.',
              )
            )
              setSlot('');
          }}
        >
          <h3>Book your embassy visit</h3>
          <p>Choose an available time. All slots are shown in Malaysia time.</p>
          <Field label="Appointment slot">
            <select
              required
              value={slot}
              onChange={(e) => setSlot(e.target.value)}
            >
              <option value="">Select a time</option>
              {eligibleSlots.map((s) => (
                <option key={s.id} value={s.id}>
                  {date(s.startsAt, true)} · {s.purpose} ·{' '}
                  {s.capacity - s.bookedCount} places
                </option>
              ))}
            </select>
          </Field>
          <FormButtons busy={busy} text="Book appointment" />
        </form>
      )}
      {a.appointments.length > 0 && (
        <>
          <h3 className="detail-section-title">Appointments</h3>
          {a.appointments.map((p) => (
            <div className="case-appointment" key={p.id}>
              <CalendarDays size={17} />
              <span>
                {date(p.slot.startsAt, true)} · Queue #{p.queueNumber}
              </span>
              <Badge value={p.status} />
            </div>
          ))}
        </>
      )}
      {staff && transitions[a.status].length > 0 && (
        <form
          className="action-box"
          onSubmit={async (e) => {
            e.preventDefault();
            if (
              await mutate(
                `applications/${a.id}/status`,
                { status, remark, identityVerified: identity },
                'POST',
                'Case updated and applicant notified.',
              )
            )
              setRemark('');
          }}
        >
          <h3>Process this application</h3>
          <p>
            Approval requires verified documents, recorded fees, and any
            required identity check and appointment.
          </p>
          <Field label="Next status">
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as ApplicationStatus)}
            >
              {transitions[a.status].map((s) => (
                <option key={s} value={s}>
                  {label(s)}
                </option>
              ))}
            </select>
          </Field>
          <Field
            label="Case remarks"
            hint="Remarks are included in the citizen's case history."
          >
            <textarea
              required
              rows={3}
              maxLength={2000}
              value={remark}
              onChange={(e) => setRemark(e.target.value)}
              placeholder="Explain the decision or the next action needed"
            />
          </Field>
          {a.service.requiresIdentity && (
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={identity}
                onChange={(e) => setIdentity(e.target.checked)}
              />
              <span>Identity verified during the in-person appointment</span>
            </label>
          )}
          <FormButtons busy={busy} text="Update case" />
        </form>
      )}
      <h3 className="detail-section-title">Application history</h3>
      <ol className="timeline">
        {a.history.map((h) => (
          <li key={h.id}>
            <span className="timeline-dot" />
            <div>
              <strong>{label(h.toStatus)}</strong>
              <p>{h.remark}</p>
              <small>
                {h.actorName} · {date(h.createdAt, true)}
              </small>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

function DocumentsView({
  data,
  busy,
  mutate,
}: {
  data: Bootstrap;
  busy: boolean;
  mutate: Mutation;
}) {
  const staff = data.user.role !== 'CITIZEN';
  const categories = Array.from(
    new Set(
      data.services.flatMap((s) => s.requirements.map((r) => r.category)),
    ),
  ).sort();
  const formRef = useRef<HTMLFormElement>(null);
  const [reviewRemark, setReviewRemark] = useState('');
  return (
    <>
      <Heading
        eyebrow={staff ? 'Verification workspace' : 'Your document library'}
        title={staff ? 'Document review' : 'My documents'}
        text={
          staff
            ? 'Review uploaded supporting documents and record clear feedback.'
            : 'Upload once and securely reuse your documents across applications.'
        }
      />
      <div className={staff ? '' : 'documents-layout'}>
        {!staff && (
          <section className="panel upload-panel">
            <span className="upload-symbol">
              <UploadCloud size={34} />
            </span>
            <h2>Add a document</h2>
            <p>PDF, JPG, or PNG. Up to 5 MB per file.</p>
            <form
              ref={formRef}
              onSubmit={async (e) => {
                e.preventDefault();
                if (
                  await mutate(
                    'documents',
                    new FormData(e.currentTarget),
                    'POST',
                    'Document uploaded to your library.',
                  )
                )
                  formRef.current?.reset();
              }}
            >
              <Field label="Document type">
                <select name="category" required>
                  {categories.map((c) => (
                    <option key={c} value={c}>
                      {label(c)}
                    </option>
                  ))}
                  <option value="OTHER">Other supporting document</option>
                </select>
              </Field>
              <Field label="Choose document">
                <input
                  type="file"
                  name="file"
                  accept="application/pdf,image/jpeg,image/png"
                  required
                />
              </Field>
              <FormButtons busy={busy} text="Upload document" />
            </form>
            <div className="upload-tip">
              <ShieldCheck size={17} />
              <p>
                Your files are accessible only to you and authorized consular
                staff.
              </p>
            </div>
          </section>
        )}
        <section className="panel document-library">
          <div className="panel-heading">
            <h2>{staff ? 'Supporting documents' : 'Saved documents'}</h2>
            <span className="pill soft">{data.documents.length} files</span>
          </div>
          {staff && (
            <div className="review-remark">
              <Field label="Verification feedback">
                <input
                  value={reviewRemark}
                  onChange={(e) => setReviewRemark(e.target.value)}
                  placeholder="Optional review note; required for a rejection"
                  maxLength={4000}
                />
              </Field>
            </div>
          )}
          {data.documents.length ? (
            <div className="document-list">
              {data.documents.map((d) => (
                <article className="document-item" key={d.id}>
                  <span className="document-file-icon">
                    <FileText size={24} />
                  </span>
                  <div className="document-info">
                    <strong>{d.name}</strong>
                    <small>
                      {label(d.category)} · {(d.size / 1024).toFixed(0)} KB ·{' '}
                      {date(d.createdAt)}
                    </small>
                    {staff && (
                      <small>
                        {data.applications.find((a) => a.userId === d.userId)
                          ?.user.name || 'Citizen document'}
                      </small>
                    )}
                    {d.remark && <p>{d.remark}</p>}
                  </div>
                  <div className="document-actions">
                    <Badge value={d.status} />
                    <a
                      className="icon-button"
                      href={`/api/documents/${d.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`Download ${d.name}`}
                    >
                      <ArrowDownToLine size={17} />
                    </a>
                    {staff &&
                      !data.applications.some(
                        (c) =>
                          [
                            'APPROVED',
                            'READY_FOR_COLLECTION',
                            'COMPLETED',
                          ].includes(c.status) &&
                          c.documents.some((x) => x.id === d.id),
                      ) && (
                        <>
                          <button
                            className="button subtle small"
                            disabled={busy}
                            onClick={() =>
                              mutate(
                                `documents/${d.id}`,
                                {
                                  status: 'VERIFIED',
                                  remark:
                                    reviewRemark ||
                                    'Document reviewed and verified.',
                                },
                                'PATCH',
                                'Document verified.',
                              )
                            }
                          >
                            Verify
                          </button>
                          <button
                            className="button danger small"
                            disabled={busy || !reviewRemark.trim()}
                            onClick={() =>
                              mutate(
                                `documents/${d.id}`,
                                { status: 'REJECTED', remark: reviewRemark },
                                'PATCH',
                                'Document rejected; citizen notified.',
                              )
                            }
                          >
                            Reject
                          </button>
                        </>
                      )}
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <Empty
              icon={UploadCloud}
              title="Your library is ready"
              text="Add supporting documents here before submitting an application."
            />
          )}
        </section>
      </div>
    </>
  );
}

function AppointmentsView({
  data,
  busy,
  mutate,
  onSlot,
}: {
  data: Bootstrap;
  busy: boolean;
  mutate: Mutation;
  onSlot: () => void;
}) {
  const staff = data.user.role !== 'CITIZEN';
  const [applicationId, setApplicationId] = useState(''),
    [slotId, setSlotId] = useState('');
  const [reschedule, setReschedule] = useState(''),
    [nextSlot, setNextSlot] = useState('');
  const slots = data.slots.filter(
    (s) =>
      s.active &&
      s.bookedCount < s.capacity &&
      new Date(s.startsAt) > new Date(),
  );
  const cases = data.applications.filter(
    (a) =>
      a.status === 'APPOINTMENT_REQUIRED' &&
      !a.appointments.some((p) =>
        ['BOOKED', 'CHECKED_IN', 'COMPLETED'].includes(p.status),
      ),
  );
  return (
    <>
      <Heading
        eyebrow={staff ? 'Appointments & queue' : 'Plan your embassy visit'}
        title="Appointments"
        text="Book, manage, and track embassy visits. All times are in Malaysia time (MYT)."
      >
        {staff && (
          <button className="button primary" onClick={onSlot}>
            <Plus size={16} />
            Create slot
          </button>
        )}
      </Heading>
      {!staff && cases.length > 0 && (
        <form
          className="panel booking-form"
          onSubmit={async (e) => {
            e.preventDefault();
            if (
              await mutate(
                'appointments',
                { applicationId, slotId },
                'POST',
                'Appointment booked.',
              )
            ) {
              setApplicationId('');
              setSlotId('');
            }
          }}
        >
          <div>
            <h2>Book an appointment</h2>
            <p>Staff have requested a visit for the following applications.</p>
          </div>
          <Field label="Application">
            <select
              required
              value={applicationId}
              onChange={(e) => setApplicationId(e.target.value)}
            >
              <option value="">Choose application</option>
              {cases.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.reference} · {a.service.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Available time">
            <select
              required
              value={slotId}
              onChange={(e) => setSlotId(e.target.value)}
            >
              <option value="">Choose time</option>
              {slots.map((s) => (
                <option key={s.id} value={s.id}>
                  {date(s.startsAt, true)} · {s.purpose}
                </option>
              ))}
            </select>
          </Field>
          <FormButtons busy={busy} text="Book appointment" />
        </form>
      )}
      <section className="panel">
        <div className="panel-heading">
          <h2>{staff ? 'Appointment queue' : 'Your appointments'}</h2>
          <span className="pill soft">
            {data.appointments.length} appointments
          </span>
        </div>
        {data.appointments.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Visit</th>
                  <th>Application</th>
                  <th>Queue</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {[...data.appointments]
                  .sort((a, b) =>
                    a.slot.startsAt.localeCompare(b.slot.startsAt),
                  )
                  .map((p) => (
                    <tr key={p.id}>
                      <td>
                        <strong className="small-strong">
                          {date(p.slot.startsAt, true)}
                        </strong>
                        <small className="table-small">{p.slot.purpose}</small>
                      </td>
                      <td>
                        {p.application?.reference ||
                          data.applications.find(
                            (a) => a.id === p.applicationId,
                          )?.reference}
                        <small className="table-small">
                          {p.application?.user.name}
                        </small>
                      </td>
                      <td>
                        <span className="queue-number">#{p.queueNumber}</span>
                      </td>
                      <td>
                        <Badge value={p.status} />
                      </td>
                      <td>
                        <div className="table-actions">
                          {p.status === 'BOOKED' && (
                            <>
                              <button
                                className="button subtle small"
                                disabled={busy}
                                onClick={() => {
                                  setReschedule(p.id);
                                  setNextSlot('');
                                }}
                              >
                                Reschedule
                              </button>
                              <button
                                className="button danger small"
                                disabled={busy}
                                onClick={() =>
                                  mutate(
                                    `appointments/${p.id}`,
                                    { action: 'cancel' },
                                    'PATCH',
                                    'Appointment cancelled.',
                                  )
                                }
                              >
                                Cancel
                              </button>
                              {staff && (
                                <button
                                  className="button primary small"
                                  disabled={busy}
                                  onClick={() =>
                                    mutate(
                                      `appointments/${p.id}`,
                                      { action: 'check-in' },
                                      'PATCH',
                                      'Applicant checked in.',
                                    )
                                  }
                                >
                                  Check in
                                </button>
                              )}
                            </>
                          )}
                          {staff && p.status === 'CHECKED_IN' && (
                            <button
                              className="button primary small"
                              disabled={busy}
                              onClick={() =>
                                mutate(
                                  `appointments/${p.id}`,
                                  { action: 'complete' },
                                  'PATCH',
                                  'Appointment completed.',
                                )
                              }
                            >
                              Complete visit
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty
            icon={CalendarDays}
            title="No appointments yet"
            text="You can book a time once staff request an embassy visit for your application."
          />
        )}
      </section>
      {reschedule && (
        <form
          className="panel booking-form"
          onSubmit={async (e) => {
            e.preventDefault();
            if (
              await mutate(
                `appointments/${reschedule}`,
                { action: 'reschedule', slotId: nextSlot },
                'PATCH',
                'Appointment rescheduled.',
              )
            )
              setReschedule('');
          }}
        >
          <h2>Choose a new time</h2>
          <Field label="New appointment time">
            <select
              required
              value={nextSlot}
              onChange={(e) => setNextSlot(e.target.value)}
            >
              <option value="">Select a slot</option>
              {slots.map((s) => (
                <option key={s.id} value={s.id}>
                  {date(s.startsAt, true)} · {s.purpose}
                </option>
              ))}
            </select>
          </Field>
          <FormButtons busy={busy} text="Confirm reschedule" />
          <button
            className="button subtle"
            type="button"
            onClick={() => setReschedule('')}
          >
            Close
          </button>
        </form>
      )}
      {staff && (
        <section className="panel slots-panel">
          <div className="panel-heading">
            <h2>Scheduled appointment slots</h2>
          </div>
          <div className="slot-grid">
            {data.slots.slice(0, 30).map((s) => (
              <div className="slot-card" key={s.id}>
                <CalendarDays size={17} />
                <strong>{date(s.startsAt, true)}</strong>
                <span>{s.purpose}</span>
                <small>
                  {s.bookedCount} / {s.capacity} places booked
                </small>
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  );
}

function PaymentsView({
  data,
  busy,
  mutate,
}: {
  data: Bootstrap;
  busy: boolean;
  mutate: Mutation;
}) {
  const staff = data.user.role !== 'CITIZEN';
  const [applicationId, setApplicationId] = useState(''),
    [method, setMethod] = useState('CASH'),
    [waived, setWaived] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const payable = data.applications.filter(
    (a) =>
      !['DRAFT', 'REJECTED', 'COMPLETED'].includes(a.status) &&
      !a.payments.length,
  );
  const selected = payable.find((a) => a.id === applicationId);
  return (
    <>
      <Heading
        eyebrow="Fees & transactions"
        title="Payments & receipts"
        text={
          staff
            ? 'Record confirmed counter or bank payments and issue receipts.'
            : 'View your application fees and download receipts for recorded payments.'
        }
      />
      <div className="notice">
        <CreditCard size={18} />
        <p>
          Payments are confirmed and recorded by authorized staff. This
          prototype does not charge cards or connect to a live payment gateway.
        </p>
      </div>
      {staff && (
        <form
          ref={formRef}
          className="panel payment-form"
          onSubmit={async (e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            if (
              await mutate(
                'payments',
                {
                  applicationId,
                  method,
                  reference: f.get('reference') || '',
                  waived: f.get('waived') === 'on',
                },
                'POST',
                'Payment recorded and receipt issued.',
              )
            ) {
              formRef.current?.reset();
              setApplicationId('');
              setWaived(false);
            }
          }}
        >
          <h2>Record a payment</h2>
          <div className="form-grid">
            <Field label="Application">
              <select
                value={applicationId}
                onChange={(e) => setApplicationId(e.target.value)}
                required
              >
                <option value="">Select application</option>
                {payable.map((a) => (
                  <option value={a.id} key={a.id}>
                    {a.reference} · {a.user.name} · {money(a.feeAmount)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Payment method">
              <select
                value={method}
                onChange={(e) => setMethod(e.target.value)}
              >
                <option value="CASH">Cash at embassy counter</option>
                <option value="BANK_TRANSFER">Confirmed bank transfer</option>
              </select>
            </Field>
            <Field label="Transaction reference / waiver reason">
              <input
                name="reference"
                required={method === 'BANK_TRANSFER' || waived}
                maxLength={160}
                placeholder="Bank transaction or counter reference"
              />
            </Field>
            <div className="fee-summary">
              <span>Fee to record</span>
              <strong>{money(selected?.feeAmount || 0)}</strong>
            </div>
          </div>
          {data.user.role === 'ADMIN' && (
            <label className="checkbox-row">
              <input
                type="checkbox"
                name="waived"
                checked={waived}
                onChange={(e) => setWaived(e.target.checked)}
              />
              <span>Waive this fee (admin authorization)</span>
            </label>
          )}
          <FormButtons busy={busy} text="Record payment" />
        </form>
      )}
      <section className="panel">
        <div className="panel-heading">
          <h2>Transaction history</h2>
          <CreditCard size={19} />
        </div>
        {data.payments.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Receipt</th>
                  <th>Application</th>
                  <th>Amount</th>
                  <th>Method</th>
                  <th>Status</th>
                  <th>Receipt</th>
                </tr>
              </thead>
              <tbody>
                {data.payments.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <strong className="small-strong">
                        {p.receiptNumber}
                      </strong>
                      <small className="table-small">{date(p.createdAt)}</small>
                    </td>
                    <td>
                      {p.application?.reference ||
                        data.applications.find((a) => a.id === p.applicationId)
                          ?.reference}
                    </td>
                    <td>
                      <strong>{money(p.amount)}</strong>
                    </td>
                    <td>{label(p.method)}</td>
                    <td>
                      <Badge value={p.status} />
                    </td>
                    <td>
                      <a
                        href={`/api/payments/${p.id}/receipt`}
                        className="button subtle small"
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <ArrowDownToLine size={14} />
                        Receipt
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty
            icon={CreditCard}
            title="No payments recorded"
            text="Receipts will appear here after staff confirm and record your payment."
          />
        )}
      </section>
      {!staff && payable.length > 0 && (
        <section className="panel outstanding-panel">
          <h2>Outstanding application fees</h2>
          {payable.map((a) => (
            <div className="outstanding-row" key={a.id}>
              <span>
                {a.service.name}
                <small>{a.reference}</small>
              </span>
              <strong>{money(a.feeAmount)}</strong>
            </div>
          ))}
          <p>Confirm payment instructions directly with the embassy.</p>
        </section>
      )}
    </>
  );
}

function ProfileView({
  user,
  busy,
  mutate,
}: {
  user: User;
  busy: boolean;
  mutate: Mutation;
}) {
  return (
    <>
      <Heading
        eyebrow="Account management"
        title="My profile"
        text="Keep your information up to date. It’s reused when you apply for services."
      />
      <div className="profile-layout">
        <section className="panel profile-summary">
          <span className="profile-avatar">
            {user.name
              .split(' ')
              .slice(0, 2)
              .map((n) => n[0])
              .join('')}
          </span>
          <h2>{user.name}</h2>
          <p>{user.email}</p>
          <Badge value={user.role} />
          <div>
            <ShieldCheck size={22} />
            <p>
              Your account is protected by secure sessions and access controls.
            </p>
          </div>
        </section>
        <form
          className="panel profile-form"
          onSubmit={(e) => {
            e.preventDefault();
            mutate(
              'profile',
              Object.fromEntries(new FormData(e.currentTarget)),
              'PATCH',
              'Profile updated.',
            );
          }}
        >
          <h2>Personal information</h2>
          <p>
            This information is visible to authorized staff processing your
            applications.
          </p>
          <div className="form-grid">
            <Field label="Full name">
              <input
                name="name"
                required
                defaultValue={user.name}
                maxLength={120}
              />
            </Field>
            <Field label="Email">
              <input type="email" value={user.email} disabled />
            </Field>
            <Field label="Phone number">
              <input
                name="phone"
                type="tel"
                defaultValue={user.phone}
                maxLength={40}
              />
            </Field>
            <Field label="Passport / identity number">
              <input
                name="passportNumber"
                defaultValue={user.passportNumber}
                maxLength={80}
              />
            </Field>
            <Field label="Nationality">
              <input
                name="nationality"
                defaultValue={user.nationality}
                maxLength={80}
              />
            </Field>
            <Field label="Date of birth">
              <input
                name="dateOfBirth"
                type="date"
                defaultValue={user.dateOfBirth?.slice(0, 10)}
              />
            </Field>
          </div>
          <Field label="Address in Malaysia">
            <textarea
              name="address"
              rows={3}
              defaultValue={user.address}
              maxLength={1000}
            />
          </Field>
          <FormButtons busy={busy} />
        </form>
      </div>
      <PasswordForm busy={busy} mutate={mutate} />
    </>
  );
}

function PasswordForm({ busy, mutate }: { busy: boolean; mutate: Mutation }) {
  const ref = useRef<HTMLFormElement>(null);
  const [error, setError] = useState('');
  return (
    <form
      className="panel password-form"
      ref={ref}
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        setError('');
        if (f.get('newPassword') !== f.get('confirmPassword')) {
          setError('The new passwords do not match.');
          return;
        }
        if (
          await mutate(
            'auth/password',
            {
              currentPassword: f.get('currentPassword'),
              newPassword: f.get('newPassword'),
            },
            'POST',
            'Password changed. Other sessions have been signed out.',
          )
        )
          ref.current?.reset();
      }}
    >
      <h2>Change password</h2>
      <p>
        Use at least 10 characters with uppercase, lowercase, and a number.
        Changing your password signs out your other sessions.
      </p>
      <div className="form-grid">
        <Field label="Current password">
          <input
            name="currentPassword"
            type="password"
            required
            autoComplete="current-password"
            maxLength={128}
          />
        </Field>
        <Field label="New password">
          <input
            name="newPassword"
            type="password"
            required
            autoComplete="new-password"
            minLength={10}
            maxLength={128}
          />
        </Field>
        <Field label="Confirm new password">
          <input
            name="confirmPassword"
            type="password"
            required
            autoComplete="new-password"
            minLength={10}
            maxLength={128}
          />
        </Field>
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <FormButtons busy={busy} text="Change password" />
    </form>
  );
}

function ServiceForm({
  service: s,
  busy,
  mutate,
  onDone,
}: {
  service: Service;
  busy: boolean;
  mutate: Mutation;
  onDone: () => void;
}) {
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        const body = {
          name: f.get('name'),
          description: f.get('description'),
          standardFee: Number(f.get('standardFee')),
          priorityFee: Number(f.get('priorityFee')),
          requiresAppointment: f.get('requiresAppointment') === 'on',
          requiresIdentity: f.get('requiresIdentity') === 'on',
          priorityAllowed: f.get('priorityAllowed') === 'on',
          active: f.get('active') === 'on',
          requirements: String(f.get('requirements'))
            .split('\n')
            .filter(Boolean)
            .map((line) => {
              const [category, text, required] = line.split('|');
              return {
                category: category.trim(),
                label: text?.trim() || category.trim(),
                required: required?.trim() !== 'optional',
              };
            }),
          eligibility: String(f.get('eligibility')).split('\n').filter(Boolean),
          procedures: String(f.get('procedures')).split('\n').filter(Boolean),
        };
        if (
          await mutate(
            `services/${s.id}`,
            body,
            'PATCH',
            'Service configuration saved.',
          )
        )
          onDone();
      }}
    >
      <Field label="Service name">
        <input name="name" required defaultValue={s.name} maxLength={160} />
      </Field>
      <Field label="Description">
        <textarea
          name="description"
          required
          defaultValue={s.description}
          rows={3}
          maxLength={2000}
        />
      </Field>
      <div className="form-grid">
        <Field label="Standard fee (MYR)">
          <input
            name="standardFee"
            type="number"
            min={0}
            max={100000}
            step="1"
            required
            defaultValue={s.standardFee}
          />
        </Field>
        <Field label="Priority fee (MYR)">
          <input
            name="priorityFee"
            type="number"
            min={0}
            max={100000}
            step="1"
            required
            defaultValue={s.priorityFee}
          />
        </Field>
      </div>
      <Field
        label="Required documents"
        hint="One per line: CATEGORY | Display label | required (or optional)"
      >
        <textarea
          name="requirements"
          rows={4}
          defaultValue={s.requirements
            .map(
              (r) =>
                `${r.category} | ${r.label} | ${r.required ? 'required' : 'optional'}`,
            )
            .join('\n')}
        />
      </Field>
      <Field label="Eligibility" hint="One requirement per line">
        <textarea
          name="eligibility"
          rows={3}
          defaultValue={s.eligibility.join('\n')}
        />
      </Field>
      <Field label="Procedure" hint="One step per line">
        <textarea
          name="procedures"
          rows={4}
          defaultValue={s.procedures.join('\n')}
        />
      </Field>
      <div className="form-grid">
        {[
          [
            'requiresAppointment',
            'Embassy visit required',
            s.requiresAppointment,
          ],
          [
            'requiresIdentity',
            'Identity verification required',
            s.requiresIdentity,
          ],
          ['priorityAllowed', 'Allow priority processing', s.priorityAllowed],
          ['active', 'Service active', s.active],
        ].map(([name, text, value]) => (
          <label className="checkbox-row" key={String(name)}>
            <input
              name={String(name)}
              type="checkbox"
              defaultChecked={Boolean(value)}
            />
            <span>{String(text)}</span>
          </label>
        ))}
      </div>
      <FormButtons busy={busy} />
    </form>
  );
}
function StaffForm({
  busy,
  mutate,
  onDone,
}: {
  busy: boolean;
  mutate: Mutation;
  onDone: () => void;
}) {
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (
          await mutate(
            'users',
            Object.fromEntries(new FormData(e.currentTarget)),
            'POST',
            'Staff account created.',
          )
        )
          onDone();
      }}
    >
      <Field label="Full name">
        <input name="name" required maxLength={120} />
      </Field>
      <Field label="Email">
        <input name="email" type="email" required />
      </Field>
      <Field
        label="Temporary password"
        hint="At least 10 characters, with uppercase, lowercase, and a number."
      >
        <input
          name="password"
          type="password"
          minLength={10}
          required
          autoComplete="new-password"
        />
      </Field>
      <Field label="Staff role">
        <select name="role">
          <option value="OFFICER">Staff Officer</option>
          <option value="ADMIN">Staff Admin</option>
        </select>
      </Field>
      <FormButtons busy={busy} text="Create staff account" />
    </form>
  );
}
function AnnouncementForm({
  busy,
  mutate,
  onDone,
  announcement,
}: {
  busy: boolean;
  mutate: Mutation;
  onDone: () => void;
  announcement?: Announcement;
}) {
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        if (
          await mutate(
            announcement ? `announcements/${announcement.id}` : 'announcements',
            {
              title: f.get('title'),
              body: f.get('body'),
              published: f.get('published') === 'on',
            },
            announcement ? 'PATCH' : 'POST',
            'Announcement saved.',
          )
        )
          onDone();
      }}
    >
      <Field label="Title">
        <input
          name="title"
          required
          maxLength={200}
          defaultValue={announcement?.title}
        />
      </Field>
      <Field label="Announcement">
        <textarea
          name="body"
          required
          rows={7}
          maxLength={5000}
          defaultValue={announcement?.body}
        />
      </Field>
      <label className="checkbox-row">
        <input
          name="published"
          type="checkbox"
          defaultChecked={announcement?.published ?? true}
        />
        <span>Publish to the citizen portal now</span>
      </label>
      <FormButtons busy={busy} text="Save announcement" />
    </form>
  );
}
function SlotForm({
  busy,
  mutate,
  onDone,
}: {
  busy: boolean;
  mutate: Mutation;
  onDone: () => void;
}) {
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        if (
          await mutate(
            'slots',
            {
              startsAt: new Date(`${f.get('startsAt')}:00+08:00`).toISOString(),
              capacity: Number(f.get('capacity')),
              purpose: f.get('purpose'),
            },
            'POST',
            'Appointment slot created.',
          )
        )
          onDone();
      }}
    >
      <Field label="Date and time (Malaysia, UTC+8)">
        <input name="startsAt" type="datetime-local" required />
      </Field>
      <Field label="Capacity">
        <input
          name="capacity"
          type="number"
          required
          min={1}
          max={100}
          defaultValue={4}
        />
      </Field>
      <Field label="Appointment purpose">
        <select name="purpose">
          <option>Document and identity verification</option>
          <option>Biometric verification</option>
          <option>Consular interview</option>
          <option>Emergency travel document</option>
          <option>Document collection</option>
        </select>
      </Field>
      <FormButtons busy={busy} text="Create slot" />
    </form>
  );
}
