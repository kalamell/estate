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
const MetersPage = lazy(() => import('@/pages/meters'))
const InvoicesPage = lazy(() => import('@/pages/invoices'))
const TenantsPage = lazy(() => import('@/pages/tenants'))
const SettingsPage = lazy(() => import('@/pages/settings'))
const AdminLayout = lazy(() => import('@/pages/admin/layout'))
const AdminOverview = lazy(() => import('@/pages/admin/overview'))
const AdminPackages = lazy(() => import('@/pages/admin/packages'))
const AdminOrgs = lazy(() => import('@/pages/admin/orgs'))
const AdminUsers = lazy(() => import('@/pages/admin/users'))
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
                  <Route element={<RequireAuth />}>
                    <Route
                      path="/admin"
                      element={<RequireSuperAdmin><AdminLayout /></RequireSuperAdmin>}
                    >
                      <Route index element={page(<AdminOverview />)} />
                      <Route path="packages" element={page(<AdminPackages />)} />
                      <Route path="orgs" element={page(<AdminOrgs />)} />
                      <Route path="users" element={page(<AdminUsers />)} />
                    </Route>
                    <Route element={<RequireOrg><AppShell /></RequireOrg>}>
                      <Route index element={page(<DashboardPage />)} />
                      <Route path="properties" element={page(<PropertiesPage />)} />
                      <Route path="units" element={page(<UnitsPage />)} />
                      <Route path="bookings" element={page(<BookingsPage />)} />
                      <Route path="meters" element={page(<MetersPage />)} />
                      <Route path="invoices" element={page(<InvoicesPage />)} />
                      <Route path="tenants" element={page(<TenantsPage />)} />
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
