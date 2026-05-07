import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './store/auth'
import Layout from './components/Layout'
import Login from './pages/Login'
import Register from './pages/Register'
import Dashboard from './pages/Dashboard'
import Analytes from './pages/Analytes'
import QCEntry from './pages/QCEntry'
import Charts from './pages/Charts'
import Stats from './pages/Stats'
import Reports from './pages/Reports'
import AIBrain from './pages/AIBrain'
import Education from './pages/Education'
import Subscription from './pages/Subscription'
import Settings from './pages/Settings'

// Performance pages
import PerformanceDashboard   from './pages/performance/Dashboard'
import Carryover              from './pages/performance/Carryover'
import Precision              from './pages/performance/Precision'
import ProficiencyTesting     from './pages/performance/ProficiencyTesting'
import EQC                    from './pages/performance/EQC'

// Validation pages
import ValidationDashboard  from './pages/validation/Dashboard'
import ReagentLot           from './pages/validation/ReagentLot'
import CalibratorLot        from './pages/validation/CalibratorLot'
import NewInstrument        from './pages/validation/NewInstrument'
import MethodComparison     from './pages/validation/MethodComparison'
import ValidationAi         from './pages/validation/ValidationAi'

// Reference Lab pages
import ReferenceSearch from './pages/reference-lab/Search'

// IQCP pages
import IQCPRisk from './pages/iqcp/Risk'
import IQCPPlans from './pages/iqcp/Plans'
import IQCPReagents from './pages/iqcp/Reagents'
import IQCPCalibrators from './pages/iqcp/Calibrators'
import IQCPExtensions from './pages/iqcp/Extensions'
import IQCPCap from './pages/iqcp/Cap'
import IQCPAi from './pages/iqcp/AiIntelligence'

function RequireAuth({ children }: { children: React.ReactNode }) {
  const token = useAuthStore(s => s.token)
  if (!token) return <Navigate to="/login" replace />
  return <>{children}</>
}

export default function App() {
  return (
    <Routes>
      <Route path="/login"    element={<Login />} />
      <Route path="/register" element={<Register />} />

      <Route path="/" element={<RequireAuth><Layout /></RequireAuth>}>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard"    element={<Dashboard />} />
        <Route path="analytes"     element={<Analytes />} />
        <Route path="qc-entry"     element={<QCEntry />} />
        <Route path="charts"       element={<Charts />} />
        <Route path="stats"        element={<Stats />} />
        <Route path="reports"      element={<Reports />} />
        <Route path="ai"           element={<AIBrain />} />
        <Route path="education"    element={<Education />} />
        <Route path="subscription" element={<Subscription />} />
        <Route path="settings"     element={<Settings />} />

        {/* Reference Lab */}
        <Route path="reference-lab">
          <Route index element={<ReferenceSearch />} />
          <Route path="search" element={<ReferenceSearch />} />
        </Route>

        {/* Performance & EQC */}
        <Route path="performance">
          <Route index element={<PerformanceDashboard />} />
          <Route path="carryover" element={<Carryover />} />
          <Route path="precision" element={<Precision />} />
          <Route path="pt"        element={<ProficiencyTesting />} />
          <Route path="eqc"       element={<EQC />} />
        </Route>

        {/* Validation */}
        <Route path="validation">
          <Route index element={<ValidationDashboard />} />
          <Route path="reagent-lot"       element={<ReagentLot />} />
          <Route path="calibrator-lot"    element={<CalibratorLot />} />
          <Route path="new-instrument"    element={<NewInstrument />} />
          <Route path="method-comparison" element={<MethodComparison />} />
          <Route path="ai"                element={<ValidationAi />} />
        </Route>

        {/* IQCP */}
        <Route path="iqcp">
          <Route index element={<Navigate to="/iqcp/risk" replace />} />
          <Route path="risk"        element={<IQCPRisk />} />
          <Route path="plans"       element={<IQCPPlans />} />
          <Route path="reagents"    element={<IQCPReagents />} />
          <Route path="calibrators" element={<IQCPCalibrators />} />
          <Route path="extensions"  element={<IQCPExtensions />} />
          <Route path="cap"         element={<IQCPCap />} />
          <Route path="ai"          element={<IQCPAi />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  )
}
