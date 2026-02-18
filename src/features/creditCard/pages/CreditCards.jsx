import { useState, useEffect } from 'react';
import { useWorkspaceStore } from '../../../store/workspaceStore.js';
import { getCreditCards, createCreditCard } from '../../../api/firestore/creditCards.js';
import { Button } from '../../../components/ui/Button.jsx';
import { Input } from '../../../components/ui/Input.jsx';
import { CurrencyInput } from '../../../components/ui/CurrencyInput.jsx';
import { Modal } from '../../../components/ui/Modal.jsx';
import { parseCurrency } from '../../../utils/currency.js';

export function CreditCards() {
  const { current } = useWorkspaceStore();
  const [cards, setCards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    name: '',
    closingDay: '10',
    dueDay: '15',
    limit: '',
  });

  useEffect(() => {
    if (!current?.id) return;
    setLoading(true);
    getCreditCards(current.id)
      .then(setCards)
      .finally(() => setLoading(false));
  }, [current?.id]);

  const handleOpenModal = () => {
    setError('');
    setForm({ name: '', closingDay: '10', dueDay: '15', limit: '' });
    setModalOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!form.name.trim()) {
      setError('Informe o nome do cartão.');
      return;
    }
    const closing = parseInt(form.closingDay, 10);
    const due = parseInt(form.dueDay, 10);
    if (closing < 1 || closing > 31 || due < 1 || due > 31) {
      setError('Dias devem ser entre 1 e 31.');
      return;
    }
    if (!current?.id) return;
    setSaving(true);
    try {
      await createCreditCard(current.id, {
        name: form.name,
        closingDay: closing,
        dueDay: due,
        limit: form.limit ? parseCurrency(form.limit) : undefined,
      });
      setModalOpen(false);
      const list = await getCreditCards(current.id);
      setCards(list);
    } catch (err) {
      setError(err.message || 'Erro ao criar cartão.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold text-slate-800">Cartões de crédito</h2>
        <Button onClick={handleOpenModal}>Novo cartão</Button>
      </div>

      <p className="mb-4 text-slate-600">
        Cadastre cartões, registre compras (à vista, parcelada ou assinatura) e acompanhe fatura atual e futura.
      </p>

      {loading ? (
        <div className="space-y-4">
          <div className="skeleton h-8 w-48" />
          <div className="skeleton h-4 w-full max-w-md" />
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <li key={i} className="rounded-2xl border border-slate-200/50 bg-white p-5 shadow-sm">
                <div className="skeleton h-5 w-32" />
                <div className="mt-2 skeleton h-4 w-40" />
                <div className="mt-3 skeleton h-4 w-24" />
              </li>
            ))}
          </ul>
        </div>
      ) : cards.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 p-8 text-center text-slate-500">
          Nenhum cartão. Clique em <strong>Novo cartão</strong> para cadastrar.
        </div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map((card) => (
            <li
              key={card.id}
              className="card card-hover p-5"
            >
              <p className="font-medium text-slate-800">{card.name}</p>
              <p className="mt-1 text-sm text-slate-500">
                Fecha dia {card.closingDay} · Vence dia {card.dueDay}
              </p>
              {card.limit != null && (
                <p className="mt-2 text-sm text-slate-600">Limite: R$ {Number(card.limit).toFixed(2)}</p>
              )}
            </li>
          ))}
        </ul>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Novo cartão">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Nome do cartão</label>
            <Input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Ex: Nubank, Itaú"
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Dia do fechamento (1-31)</label>
            <Input
              type="number"
              min={1}
              max={31}
              value={form.closingDay}
              onChange={(e) => setForm((f) => ({ ...f, closingDay: e.target.value }))}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Dia do vencimento (1-31)</label>
            <Input
              type="number"
              min={1}
              max={31}
              value={form.dueDay}
              onChange={(e) => setForm((f) => ({ ...f, dueDay: e.target.value }))}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Limite (R$) – opcional</label>
            <CurrencyInput
              value={form.limit}
              onChange={(v) => setForm((f) => ({ ...f, limit: v }))}
              placeholder="Opcional"
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-2">
            <Button type="button" variant="secondary" onClick={() => setModalOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? 'Salvando...' : 'Criar cartão'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
