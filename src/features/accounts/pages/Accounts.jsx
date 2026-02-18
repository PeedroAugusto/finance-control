import { useState, useEffect } from 'react';
import { useWorkspaceStore } from '../../../store/workspaceStore.js';
import { getAccounts, createAccount, updateAccount } from '../../../api/firestore/accounts.js';
import { Button } from '../../../components/ui/Button.jsx';
import { Input } from '../../../components/ui/Input.jsx';
import { Select } from '../../../components/ui/Select.jsx';
import { CurrencyInput } from '../../../components/ui/CurrencyInput.jsx';
import { Modal } from '../../../components/ui/Modal.jsx';
import { ACCOUNT_TYPES } from '../../../models/account.js';
import { formatCurrency, formatCurrencyInput, parseCurrency } from '../../../utils/currency.js';

const TYPE_LABELS = {
  [ACCOUNT_TYPES.bank]: 'Banco',
  [ACCOUNT_TYPES.digital_wallet]: 'Carteira digital',
  [ACCOUNT_TYPES.cash]: 'Dinheiro',
  [ACCOUNT_TYPES.investment]: 'Investimento',
};

export function Accounts() {
  const { current } = useWorkspaceStore();
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    name: '',
    type: ACCOUNT_TYPES.bank,
    initialBalance: '',
    yieldRate: '',
    yieldReference: '',
  });

  useEffect(() => {
    if (!current?.id) return;
    setLoading(true);
    getAccounts(current.id)
      .then(setAccounts)
      .finally(() => setLoading(false));
  }, [current?.id]);

  const handleOpenModal = () => {
    setError('');
    setForm({
      name: '',
      type: ACCOUNT_TYPES.bank,
      initialBalance: '',
      yieldRate: '',
      yieldReference: '',
    });
    setModalOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!form.name.trim()) {
      setError('Informe o nome da conta.');
      return;
    }
    if (!current?.id) return;
    setSaving(true);
    try {
      await createAccount(current.id, {
        name: form.name,
        type: form.type,
        initialBalance: parseCurrency(form.initialBalance) || 0,
        yieldRate: form.yieldRate ? parseCurrency(form.yieldRate) : undefined,
        yieldReference: form.yieldReference || undefined,
      });
      setModalOpen(false);
      const list = await getAccounts(current.id);
      setAccounts(list);
    } catch (err) {
      setError(err.message || 'Erro ao criar conta.');
    } finally {
      setSaving(false);
    }
  };

  const handleOpenEdit = (acc) => {
    setError('');
    setEditingAccount(acc);
    setForm({
      name: acc.name,
      type: acc.type,
      initialBalance: '',
      yieldRate: '',
      yieldReference: '',
      editCurrentBalance: formatCurrencyInput(String(acc.currentBalance ?? acc.initialBalance ?? 0)),
    });
    setEditModalOpen(true);
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!editingAccount || !current?.id) return;
    if (!form.name?.trim()) {
      setError('Informe o nome da conta.');
      return;
    }
    setSaving(true);
    try {
      await updateAccount(current.id, editingAccount.id, {
        name: form.name.trim(),
        currentBalance: parseCurrency(form.editCurrentBalance ?? '0') ?? 0,
      });
      setEditModalOpen(false);
      setEditingAccount(null);
      const list = await getAccounts(current.id);
      setAccounts(list);
    } catch (err) {
      setError(err.message || 'Erro ao atualizar conta.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold text-slate-800">Contas</h2>
        <Button onClick={handleOpenModal}>Nova conta</Button>
      </div>

      <p className="mb-4 text-slate-600">
        Gerencie suas contas (banco, carteira, dinheiro, investimento). O saldo atual é atualizado conforme as transações.
      </p>

      {loading ? (
        <div className="space-y-4">
          <div className="skeleton h-8 w-40" />
          <div className="skeleton h-4 w-full max-w-lg" />
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <li key={i} className="rounded-2xl border border-slate-200/50 bg-white p-5 shadow-sm">
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-1">
                    <div className="skeleton h-5 w-28" />
                    <div className="skeleton h-4 w-20" />
                  </div>
                  <div className="skeleton h-8 w-16 shrink-0 rounded-lg" />
                </div>
                <div className="mt-3 skeleton h-6 w-24" />
              </li>
            ))}
          </ul>
        </div>
      ) : accounts.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 p-8 text-center text-slate-500">
          Nenhuma conta ainda. Clique em <strong>Nova conta</strong> para criar a primeira.
        </div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {accounts.map((acc) => (
            <li
              key={acc.id}
              className="card card-hover p-5"
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-medium text-slate-800">{acc.name}</p>
                  <p className="text-sm text-slate-500">{TYPE_LABELS[acc.type] || acc.type}</p>
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  className="shrink-0 text-sm"
                  onClick={() => handleOpenEdit(acc)}
                >
                  Editar
                </Button>
              </div>
              <p className="mt-2 text-lg font-semibold text-slate-800">
                {formatCurrency(acc.currentBalance ?? acc.initialBalance ?? 0)}
              </p>
            </li>
          ))}
        </ul>
      )}

      <Modal open={editModalOpen} onClose={() => { setEditModalOpen(false); setEditingAccount(null); }} title="Editar conta">
        <form onSubmit={handleEditSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Nome</label>
            <Input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Ex: Nubank, PicPay"
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Saldo atual (R$)</label>
            <CurrencyInput
              value={form.editCurrentBalance ?? ''}
              onChange={(v) => setForm((f) => ({ ...f, editCurrentBalance: v }))}
              placeholder="0,00"
            />
            <p className="mt-1 text-xs text-slate-500">
              Ajuste o saldo para corrigir ou sincronizar com o extrato.
            </p>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-2">
            <Button type="button" variant="secondary" onClick={() => { setEditModalOpen(false); setEditingAccount(null); }}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? 'Salvando...' : 'Salvar'}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Nova conta">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Nome</label>
            <Input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Ex: Nubank, PicPay"
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Tipo</label>
            <Select
              value={form.type}
              onChange={(value) => setForm((f) => ({ ...f, type: value }))}
              options={Object.entries(TYPE_LABELS).map(([value, label]) => ({ value, label }))}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Saldo inicial (R$)</label>
            <CurrencyInput
              value={form.initialBalance}
              onChange={(v) => setForm((f) => ({ ...f, initialBalance: v }))}
              placeholder="0,00"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Rendimento (ex: 1,02 = 102% CDI)</label>
            <CurrencyInput
              value={form.yieldRate}
              onChange={(v) => setForm((f) => ({ ...f, yieldRate: v }))}
              placeholder="Opcional"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Referência (ex: CDI)</label>
            <Input
              value={form.yieldReference}
              onChange={(e) => setForm((f) => ({ ...f, yieldReference: e.target.value }))}
              placeholder="Opcional"
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-2">
            <Button type="button" variant="secondary" onClick={() => setModalOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? 'Salvando...' : 'Criar conta'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
