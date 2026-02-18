import { Modal } from './Modal.jsx';
import { Button } from './Button.jsx';

export function ConfirmModal({ open, onClose, onConfirm, title, message, confirmLabel = 'Confirmar', variant = 'danger', loading = false }) {
  return (
    <Modal open={open} onClose={onClose} title={title}>
      <p className="text-slate-600">{message}</p>
      <div className="mt-4 flex gap-2 justify-end">
        <Button variant="secondary" onClick={onClose} disabled={loading}>Cancelar</Button>
        <Button variant={variant} onClick={onConfirm} disabled={loading}>
          {loading ? 'Aguarde...' : confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}
