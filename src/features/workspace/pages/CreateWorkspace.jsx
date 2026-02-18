import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../../store/authStore.js';
import { useWorkspaceStore } from '../../../store/workspaceStore.js';
import { getWorkspacesByUser, createWorkspace } from '../../../api/firestore/workspaces.js';
import { Button } from '../../../components/ui/Button.jsx';
import { Input } from '../../../components/ui/Input.jsx';

export function CreateWorkspace() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { list, setList, setCurrent, setLoading, current, loading } = useWorkspaceStore();
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!user?.uid) return;
    setLoading(true);
    getWorkspacesByUser(user.uid)
      .then((workspaces) => setList(workspaces))
      .finally(() => setLoading(false));
  }, [user?.uid]);

  const handleCreate = async (e) => {
    e.preventDefault();
    setError('');
    if (!name.trim()) {
      setError('Informe o nome do workspace.');
      return;
    }
    if (!user?.uid || !user?.email) return;
    setCreating(true);
    try {
      const { workspaceId } = await createWorkspace(user.uid, user.email, name.trim());
      const newList = [...list, { id: workspaceId, name: name.trim() }];
      setList(newList);
      setCurrent({ id: workspaceId, name: name.trim() });
      navigate('/', { replace: true });
    } catch (err) {
      setError(err.message || 'Erro ao criar workspace.');
    } finally {
      setCreating(false);
    }
  };

  const handleSelect = (w) => {
    setCurrent(w);
    navigate('/', { replace: true });
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100">
        <div className="text-slate-600">Carregando...</div>
      </div>
    );
  }

  if (list.length > 0 && !current) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
        <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow">
          <h1 className="mb-4 text-xl font-semibold text-slate-800">Escolha um workspace</h1>
          <ul className="space-y-2">
            {list.map((w) => (
              <li key={w.id}>
                <button
                  type="button"
                  onClick={() => handleSelect(w)}
                  className="w-full rounded-lg border border-slate-200 py-2 text-left px-3 text-slate-700 hover:bg-slate-50"
                >
                  {w.name}
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-sm text-slate-500">ou crie um novo abaixo.</p>
          <form onSubmit={handleCreate} className="mt-4 flex gap-2">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nome do novo workspace"
              className="flex-1"
            />
            <Button type="submit" disabled={creating}>Criar</Button>
          </form>
          {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        </div>
      </div>
    );
  }

  if (list.length > 0) return null;

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
      <form
        onSubmit={handleCreate}
        className="w-full max-w-sm rounded-xl bg-white p-6 shadow"
      >
        <h1 className="mb-2 text-xl font-semibold text-slate-800">Criar workspace</h1>
        <p className="mb-4 text-sm text-slate-500">
          Crie seu primeiro ambiente financeiro para começar.
        </p>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ex: Família Silva"
          autoFocus
          className="mb-4"
        />
        {error && <p className="mb-2 text-sm text-red-600">{error}</p>}
        <Button type="submit" disabled={creating} className="w-full">
          {creating ? 'Criando...' : 'Criar e entrar'}
        </Button>
      </form>
    </div>
  );
}
