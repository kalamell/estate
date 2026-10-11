import { lazy, Suspense, type ReactNode } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { ThemeProvider } from '@/components/theme-provider'
import { queryClient } from '@/lib/query'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { ConfirmProvider } from '@/components/confirm'
import { AppShell } from '@/components/app-shell'
import { FullScreenLoader } from '@/components/common'
import {
  GuestOnly,
  NavigatorBridge,
  RequireAuth,
  RequireOrg,
  RequireSuperAdmin,
} from '@/components/guards'
import { PageSkeleton } from '@/components/page-skeleton'

const LoginPage = lazy(() => import('@/pages/auth/login'))
const RegisterPage = lazy(() => import('@/pages/auth/register'))
const DashboardPage = lazy(() => import('@/pages/dashboard'))
const PropertiesPage = lazy(() => import('@/pages/properties'))
const UnitsPage = lazy(() => import('@/pages/units'))
const BookingsPage = lazy(() => import('@/pages/bookings'))
const CalendarPage = lazy(() => import('@/pages/calendar'))
const StayPage = lazy(() => import('@/pages/stay'))
const StayRequestPage = lazy(() => import('@/pages/stay/request'))
const MetersPage = lazy(() => import('@/pages/meters'))
const InvoicesPage = lazy(() => import('@/pages/invoices'))
const TenantsPage = lazy(() => import('@/pages/tenants'))
const SettingsPage = lazy(() => import('@/pages/settings'))
const AdminLayout = lazy(() => import('@/pages/admin/layout'))
const AdminOverview = lazy(() => import('@/pages/admin/overview'))
const AdminPackages = lazy(() => import('@/pages/admin/packages'))
const AdminOrgs = lazy(() => import('@/pages/admin/orgs'))
const AdminUsers = lazy(() => import('@/pages/admin/users'))
const AdminSupport = lazy(() => import('@/pages/admin/support'))
const TicketsPage = lazy(() => import('@/pages/tickets'))
const MoveOutsPage = lazy(() => import('@/pages/move-outs'))
const ReportsPage = lazy(() => import('@/pages/reports'))
const SupportPage = lazy(() => import('@/pages/support'))
const PortalPage = lazy(() => import('@/pages/portal'))
const StaffInvoicePrint = lazy(() => import('@/pages/print/invoice').then((m) => ({ default: m.StaffInvoicePrint })))
const PortalInvoicePrint = lazy(() => import('@/pages/print/invoice').then((m) => ({ default: m.PortalInvoicePrint })))
const StaffReceiptPrint = lazy(() => import('@/pages/print/receipt').then((m) => ({ default: m.StaffReceiptPrint })))
const PortalReceiptPrint = lazy(() => import('@/pages/print/receipt').then((m) => ({ default: m.PortalReceiptPrint })))
const StaffMoveOutPrint = lazy(() => import('@/pages/print/move-out').then((m) => ({ default: m.StaffMoveOutPrint })))
const NotFoundPage = lazy(() => import('@/pages/not-found'))

const page = (el: ReactNode) => <Suspense fallback={<PageSkeleton />}>{el}</Suspense>

export default function App() {
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider delayDuration={300}>
          <ConfirmProvider>
            <BrowserRouter>
              <NavigatorBridge />
              <Suspense fallback={<FullScreenLoader />}>
                <Routes>
                  <Route path="/login" element={<GuestOnly><LoginPage /></GuestOnly>} />
                  <Route path="/register" element={<GuestOnly><RegisterPage /></GuestOnly>} />
                  {/* พอร์ทัลผู้เช่า — สาธารณะ ไม่ต้องล็อกอิน */}
                  <Route path="/p/:token" element={<PortalPage />} />
                  <Route path="/p/:token/print/invoice/:id" element={<PortalInvoicePrint />} />
                  <Route path="/p/:token/print/receipt/:id" element={<PortalReceiptPrint />} />
                  {/* หน้าจองออนไลน์ — สาธารณะ ไม่ต้องล็อกอิน */}
                  <Route path="/stay/:slug" element={<StayPage />} />
                  <Route path="/stay/:slug/r/:token" element={<StayRequestPage />} />
                  <Route element={<RequireAuth />}>
                    <Route path="/print/invoice/:id" element={<StaffInvoicePrint />} />
                    <Route path="/print/receipt/:id" element={<StaffReceiptPrint />} />
                    <Route path="/print/move-out/:id" element={<StaffMoveOutPrint />} />
                    <Route
                      path="/admin"
                      element={<RequireSuperAdmin><AdminLayout /></RequireSuperAdmin>}
                    >
                      <Route index element={page(<AdminOverview />)} />
                      <Route path="packages" element={page(<AdminPackages />)} />
                      <Route path="orgs" element={page(<AdminOrgs />)} />
                      <Route path="users" element={page(<AdminUsers />)} />
                      <Route path="support" element={page(<AdminSupport />)} />
                    </Route>
                    <Route element={<RequireOrg><AppShell /></RequireOrg>}>
                      <Route index element={page(<DashboardPage />)} />
                      <Route path="properties" element={page(<PropertiesPage />)} />
                      <Route path="units" element={page(<UnitsPage />)} />
                      <Route path="bookings" element={page(<BookingsPage />)} />
                      <Route path="calendar" element={page(<CalendarPage />)} />
                      <Route path="meters" element={page(<MetersPage />)} />
                      <Route path="invoices" element={page(<InvoicesPage />)} />
                      <Route path="tenants" element={page(<TenantsPage />)} />
                      <Route path="tickets" element={page(<TicketsPage />)} />
                      <Route path="move-outs" element={page(<MoveOutsPage />)} />
                      <Route path="reports" element={page(<ReportsPage />)} />
                      <Route path="support" element={page(<SupportPage />)} />
                      <Route path="settings" element={page(<SettingsPage />)} />
                      <Route path="*" element={page(<NotFoundPage />)} />
                    </Route>
                  </Route>
                </Routes>
              </Suspense>
            </BrowserRouter>
            <Toaster richColors closeButton position="top-center" />
          </ConfirmProvider>
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  )
}
