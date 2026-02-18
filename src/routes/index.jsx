import { createBrowserRouter, Navigate, RouterProvider } from 'react-router-dom';
import { ProtectedRoute } from '../features/auth/components/ProtectedRoute.jsx';
import { WorkspaceGuard } from '../features/workspace/components/WorkspaceGuard.jsx';
import { Login } from '../features/auth/pages/Login.jsx';
import { Register } from '../features/auth/pages/Register.jsx';
import { CreateWorkspace } from '../features/workspace/pages/CreateWorkspace.jsx';
import { Layout } from '../components/layout/Layout.jsx';
import { Dashboard } from '../features/dashboard/pages/Dashboard.jsx';
import { Accounts } from '../features/accounts/pages/Accounts.jsx';
import { Transactions } from '../features/transactions/pages/Transactions.jsx';
import { CreditCards } from '../features/creditCard/pages/CreditCards.jsx';
import { WorkspaceSettings } from '../features/workspace/pages/WorkspaceSettings.jsx';

const router = createBrowserRouter([
  {
    path: '/login',
    element: <Login />,
  },
  {
    path: '/register',
    element: <Register />,
  },
  {
    path: '/workspace/create',
    element: (
      <ProtectedRoute>
        <CreateWorkspace />
      </ProtectedRoute>
    ),
  },
  {
    path: '/',
    element: (
      <ProtectedRoute>
        <WorkspaceGuard>
          <Layout />
        </WorkspaceGuard>
      </ProtectedRoute>
    ),
    children: [
      { index: true, element: <Dashboard /> },
      { path: 'contas', element: <Accounts /> },
      { path: 'transacoes', element: <Transactions /> },
      { path: 'cartoes', element: <CreditCards /> },
      { path: 'configuracoes', element: <WorkspaceSettings /> },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
]);

export function AppRoutes() {
  return <RouterProvider router={router} />;
}
