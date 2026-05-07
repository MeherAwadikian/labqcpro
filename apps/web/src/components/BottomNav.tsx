import { NavLink } from 'react-router-dom'
import { LayoutDashboard, ClipboardList, BarChart3, Brain, Menu } from 'lucide-react'

const items = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/qc-entry',  icon: ClipboardList,   label: 'QC Entry' },
  { to: '/charts',    icon: BarChart3,        label: 'Charts' },
  { to: '/ai',        icon: Brain,            label: 'AI' },
]

interface Props {
  onMenuOpen: () => void
}

export default function BottomNav({ onMenuOpen }: Props) {
  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-gray-900 border-t border-gray-800 safe-area-bottom">
      <div className="flex items-center justify-around h-16 px-2">
        {items.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex flex-col items-center justify-center gap-0.5 flex-1 h-full rounded-xl transition-colors ${
                isActive ? 'text-brand-400' : 'text-gray-500 hover:text-gray-300'
              }`
            }
          >
            <Icon size={20} />
            <span className="text-[10px] font-medium">{label}</span>
          </NavLink>
        ))}

        {/* More / sidebar trigger */}
        <button
          onClick={onMenuOpen}
          className="flex flex-col items-center justify-center gap-0.5 flex-1 h-full rounded-xl text-gray-500 hover:text-gray-300 transition-colors"
        >
          <Menu size={20} />
          <span className="text-[10px] font-medium">More</span>
        </button>
      </div>
    </nav>
  )
}
