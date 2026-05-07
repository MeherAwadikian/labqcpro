import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useState } from 'react'
import { useAuthStore } from '../store/auth'
import {
  LayoutDashboard, FlaskConical, ClipboardList, BarChart3, Calculator,
  FileText, Brain, BookOpen, CreditCard, ChevronDown, ChevronRight,
  LogOut, Menu, X, ShieldCheck, Settings,
  ClipboardCheck, TestTube2, Pipette, Clock, Building2, Bot,
  Microscope, Activity, ArrowLeftRight,
} from 'lucide-react'

const mainNav = [
  { to: '/dashboard',    icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/analytes',     icon: FlaskConical,    label: 'Analytes' },
  { to: '/qc-entry',     icon: ClipboardList,   label: 'QC Entry' },
  { to: '/charts',       icon: BarChart3,       label: 'L-J Charts' },
  { to: '/stats',        icon: Calculator,      label: 'Statistics' },
  { to: '/reports',      icon: FileText,        label: 'Reports' },
  { to: '/ai',           icon: Brain,           label: 'AI Brain' },
  { to: '/education',    icon: BookOpen,        label: 'Education' },
  { to: '/subscription', icon: CreditCard,      label: 'Subscription' },
]

const iqcpNav = [
  { to: '/iqcp/risk',        icon: ClipboardCheck, label: 'Risk Assessment' },
  { to: '/iqcp/plans',       icon: ClipboardList,  label: 'QC Plans' },
  { to: '/iqcp/reagents',    icon: TestTube2,       label: 'Reagent Lots' },
  { to: '/iqcp/calibrators', icon: Pipette,         label: 'Calibrators' },
  { to: '/iqcp/extensions',  icon: Clock,           label: 'Extensions' },
  { to: '/iqcp/cap',         icon: Building2,       label: 'CAP Standards' },
  { to: '/iqcp/ai',          icon: Bot,             label: 'AI Intelligence' },
]

const validationNav = [
  { to: '/validation',                 icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/validation/reagent-lot',     icon: TestTube2,       label: 'Reagent Lot' },
  { to: '/validation/calibrator-lot',  icon: Pipette,         label: 'Calibrator Lot' },
  { to: '/validation/new-instrument',  icon: Activity,        label: 'New Instrument' },
  { to: '/validation/method-comparison', icon: ArrowLeftRight, label: 'Method Comparison' },
  { to: '/validation/ai',              icon: Bot,             label: 'AI Brain' },
]

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [iqcpOpen, setIqcpOpen]       = useState(false)
  const [validationOpen, setValidationOpen] = useState(false)
  const { logout, role } = useAuthStore()
  const navigate = useNavigate()

  function handleLogout() {
    logout()
    navigate('/login')
  }

  const NavItem = ({ to, icon: Icon, label }: { to: string; icon: any; label: string }) => (
    <NavLink
      to={to}
      onClick={() => setSidebarOpen(false)}
      className={({ isActive }) =>
        `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
          isActive
            ? 'bg-brand-600/20 text-brand-400'
            : 'text-gray-400 hover:text-gray-100 hover:bg-gray-800'
        }`
      }
    >
      <Icon size={16} />
      {label}
    </NavLink>
  )

  const IQCPNavItem = ({ to, icon: Icon, label }: { to: string; icon: any; label: string }) => (
    <NavLink
      to={to}
      onClick={() => setSidebarOpen(false)}
      className={({ isActive }) =>
        `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ml-2 ${
          isActive
            ? 'bg-iqcp-600/20 text-iqcp-400'
            : 'text-gray-400 hover:text-gray-100 hover:bg-gray-800'
        }`
      }
    >
      <Icon size={16} />
      {label}
    </NavLink>
  )

  const Sidebar = () => (
    <nav className="flex flex-col h-full p-4 gap-1 overflow-y-auto scrollbar-thin">
      <div className="flex items-center gap-2 px-3 py-4 mb-2">
        <div className="w-8 h-8 bg-brand-500 rounded-lg flex items-center justify-center">
          <FlaskConical size={18} className="text-white" />
        </div>
        <span className="font-bold text-lg text-white">LabQC Pro</span>
      </div>

      {mainNav.map(item => <NavItem key={item.to} {...item} />)}

      <div className="my-2 border-t border-gray-800" />

      {/* IQCP section */}
      <button
        onClick={() => setIqcpOpen(o => !o)}
        className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-gray-400 hover:text-gray-100 hover:bg-gray-800 transition-colors w-full"
      >
        <ShieldCheck size={16} className="text-iqcp-400" />
        <span className="flex-1 text-left text-iqcp-300">IQCP & Compliance</span>
        {iqcpOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
      </button>

      {iqcpOpen && iqcpNav.map(item => <IQCPNavItem key={item.to} {...item} />)}

      <div className="my-2 border-t border-gray-800" />

      {/* Validation section */}
      <button
        onClick={() => setValidationOpen(o => !o)}
        className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-gray-400 hover:text-gray-100 hover:bg-gray-800 transition-colors w-full"
      >
        <Microscope size={16} className="text-blue-400" />
        <span className="flex-1 text-left text-blue-300">Validation Studies</span>
        {validationOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
      </button>

      {validationOpen && validationNav.map(item => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.to === '/validation'}
          onClick={() => setSidebarOpen(false)}
          className={({ isActive }) =>
            `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ml-2 ${
              isActive
                ? 'bg-blue-600/20 text-blue-400'
                : 'text-gray-400 hover:text-gray-100 hover:bg-gray-800'
            }`
          }
        >
          <item.icon size={16} />
          {item.label}
        </NavLink>
      ))}

      <div className="flex-1" />

      <div className="border-t border-gray-800 pt-3">
        <NavItem to="/settings" icon={Settings} label="Settings" />
        <div className="px-3 py-1 text-xs text-gray-600 font-medium uppercase tracking-wide mt-2">
          {role}
        </div>
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-gray-400 hover:text-red-400 hover:bg-gray-800 transition-colors w-full"
        >
          <LogOut size={16} />
          Sign out
        </button>
      </div>
    </nav>
  )

  return (
    <div className="flex h-screen bg-gray-950 overflow-hidden">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-20 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar desktop */}
      <aside className="hidden lg:flex w-56 bg-gray-900 border-r border-gray-800 flex-shrink-0 flex-col">
        <Sidebar />
      </aside>

      {/* Sidebar mobile */}
      <aside
        className={`fixed top-0 left-0 h-full w-64 bg-gray-900 border-r border-gray-800 z-30 transform transition-transform lg:hidden ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="absolute top-4 right-4">
          <button onClick={() => setSidebarOpen(false)} className="text-gray-400 hover:text-white">
            <X size={20} />
          </button>
        </div>
        <Sidebar />
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="lg:hidden flex items-center gap-3 px-4 py-3 bg-gray-900 border-b border-gray-800">
          <button onClick={() => setSidebarOpen(true)} className="text-gray-400 hover:text-white">
            <Menu size={20} />
          </button>
          <span className="font-semibold text-white">LabQC Pro</span>
        </header>

        <main className="flex-1 overflow-auto bg-gray-950 p-4 lg:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
