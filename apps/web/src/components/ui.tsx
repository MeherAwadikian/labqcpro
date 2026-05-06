import { forwardRef } from 'react'
import { clsx } from 'clsx'

// ─── Card ─────────────────────────────────────────────────────────────────────
export function Card({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={clsx('bg-gray-900 border border-gray-800 rounded-xl p-4', className)} {...props}>
      {children}
    </div>
  )
}

export function CardHeader({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={clsx('mb-4', className)} {...props}>{children}</div>
}

export function CardTitle({ className, children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={clsx('text-base font-semibold text-white', className)} {...props}>{children}</h3>
}

// ─── Button ───────────────────────────────────────────────────────────────────
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'outline' | 'ghost' | 'danger' | 'iqcp'
  size?: 'sm' | 'md' | 'lg'
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'default', size = 'md', ...props }, ref) => {
    const base = 'inline-flex items-center justify-center gap-2 font-medium rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-950 disabled:opacity-50 disabled:cursor-not-allowed'
    const variants = {
      default: 'bg-brand-600 hover:bg-brand-700 text-white focus:ring-brand-500',
      outline: 'border border-gray-700 text-gray-300 hover:bg-gray-800 hover:text-white focus:ring-gray-500',
      ghost:   'text-gray-400 hover:text-white hover:bg-gray-800 focus:ring-gray-500',
      danger:  'bg-red-600 hover:bg-red-700 text-white focus:ring-red-500',
      iqcp:    'bg-iqcp-600 hover:bg-iqcp-700 text-white focus:ring-iqcp-500',
    }
    const sizes = {
      sm: 'text-xs px-3 py-1.5',
      md: 'text-sm px-4 py-2',
      lg: 'text-base px-6 py-3',
    }
    return (
      <button
        ref={ref}
        className={clsx(base, variants[variant], sizes[size], className)}
        {...props}
      />
    )
  }
)
Button.displayName = 'Button'

// ─── Input ────────────────────────────────────────────────────────────────────
export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={clsx(
        'w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-500',
        'focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent',
        'disabled:opacity-50',
        className
      )}
      {...props}
    />
  )
)
Input.displayName = 'Input'

// ─── Select ───────────────────────────────────────────────────────────────────
export const Select = forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, children, ...props }, ref) => (
    <select
      ref={ref}
      className={clsx(
        'w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100',
        'focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent',
        'disabled:opacity-50',
        className
      )}
      {...props}
    >
      {children}
    </select>
  )
)
Select.displayName = 'Select'

// ─── Textarea ─────────────────────────────────────────────────────────────────
export const Textarea = forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={clsx(
        'w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-500 resize-none',
        'focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent',
        className
      )}
      {...props}
    />
  )
)
Textarea.displayName = 'Textarea'

// ─── Label ────────────────────────────────────────────────────────────────────
export function Label({ className, children, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label className={clsx('text-sm font-medium text-gray-300', className)} {...props}>
      {children}
    </label>
  )
}

// ─── Badge ────────────────────────────────────────────────────────────────────
interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info' | 'iqcp' | 'purple'
}

export function Badge({ className, variant = 'default', children, ...props }: BadgeProps) {
  const variants = {
    default: 'bg-gray-700 text-gray-300',
    success: 'bg-green-900/50 text-green-400 border border-green-800',
    warning: 'bg-amber-900/50 text-amber-400 border border-amber-800',
    danger:  'bg-red-900/50 text-red-400 border border-red-800',
    info:    'bg-blue-900/50 text-blue-400 border border-blue-800',
    iqcp:    'bg-iqcp-900/50 text-iqcp-300 border border-iqcp-800',
    purple:  'bg-purple-900/50 text-purple-300 border border-purple-800',
  }
  return (
    <span className={clsx('inline-flex items-center px-2 py-0.5 rounded text-xs font-medium', variants[variant], className)} {...props}>
      {children}
    </span>
  )
}

// ─── Spinner ──────────────────────────────────────────────────────────────────
export function Spinner({ size = 16 }: { size?: number }) {
  return (
    <svg
      className="animate-spin text-brand-400"
      width={size} height={size}
      viewBox="0 0 24 24" fill="none"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 100 16v-4l-3 3 3 3v-4a8 8 0 01-8-8z" />
    </svg>
  )
}

// ─── Empty state ──────────────────────────────────────────────────────────────
export function EmptyState({ icon, title, desc }: { icon: React.ReactNode; title: string; desc?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
      <div className="text-gray-600">{icon}</div>
      <p className="text-gray-400 font-medium">{title}</p>
      {desc && <p className="text-gray-600 text-sm max-w-xs">{desc}</p>}
    </div>
  )
}

// ─── Modal ────────────────────────────────────────────────────────────────────
interface ModalProps {
  open: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
  maxWidth?: string
}

export function Modal({ open, onClose, title, children, maxWidth = 'max-w-lg' }: ModalProps) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className={clsx('relative bg-gray-900 border border-gray-700 rounded-xl shadow-xl w-full', maxWidth)}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
          <h2 className="text-base font-semibold text-white">{title}</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-white text-xl leading-none">×</button>
        </div>
        <div className="px-6 py-4">{children}</div>
      </div>
    </div>
  )
}

// ─── FormField ───────────────────────────────────────────────────────────────
export function FormField({ label, error, children }: {
  label: string; error?: string; children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label>{label}</Label>
      {children}
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  )
}

// ─── Page header ──────────────────────────────────────────────────────────────
export function PageHeader({ title, subtitle, action }: {
  title: string; subtitle?: string; action?: React.ReactNode
}) {
  return (
    <div className="flex items-start justify-between mb-6">
      <div>
        <h1 className="text-xl font-bold text-white">{title}</h1>
        {subtitle && <p className="text-sm text-gray-400 mt-0.5">{subtitle}</p>}
      </div>
      {action}
    </div>
  )
}

// ─── Table ────────────────────────────────────────────────────────────────────
export function Table({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={clsx('overflow-x-auto', className)}>
      <table className="w-full text-sm">{children}</table>
    </div>
  )
}

export function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <th className={clsx('text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-4 py-2 border-b border-gray-800', className)}>
      {children}
    </th>
  )
}

export function Td({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <td className={clsx('px-4 py-3 text-gray-300 border-b border-gray-800/50', className)}>
      {children}
    </td>
  )
}
