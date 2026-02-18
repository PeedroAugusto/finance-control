import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../../store/authStore.js';
import { useWorkspaceStore } from '../../../store/workspaceStore.js';
import { getWorkspacesByUser } from '../../../api/firestore/workspaces.js';

/**
 * Carrega os workspaces do usuário. Se não houver nenhum, redireciona para criar.
 * Se houver e nenhum estiver selecionado, seleciona o primeiro.
 */
export function WorkspaceGuard({ children }) {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { list, setList, setCurrent, setLoading, loading } = useWorkspaceStore();

  useEffect(() => {
    if (!user?.uid) return;
    setLoading(true);
    getWorkspacesByUser(user.uid)
      .then((workspaces) => {
        setList(workspaces);
        if (workspaces.length === 0) {
          navigate('/workspace/create', { replace: true });
        } else if (!useWorkspaceStore.getState().current) {
          setCurrent(workspaces[0]);
        }
      })
      .finally(() => setLoading(false));
  }, [user?.uid]);

  if (loading || list.length === 0) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-sky-500 border-t-transparent" />
      </div>
    );
  }

  return children;
}
