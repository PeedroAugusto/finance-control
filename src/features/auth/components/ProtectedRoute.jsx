import { Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../../store/authStore.js';

/**
 * Redireciona para /login se não estiver autenticado.
 * Exibe loading enquanto auth não estiver inicializado.
 */
export function ProtectedRoute({ children }) {
  const location = useLocation();
  const { user, initialized } = useAuthStore();

  if (!initialized) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-sky-500 border-t-transparent" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return children;
}
