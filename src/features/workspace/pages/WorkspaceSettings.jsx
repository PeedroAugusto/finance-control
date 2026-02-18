import { useState } from 'react';
import { useWorkspaceStore } from '../../../store/workspaceStore.js';
import { Button } from '../../../components/ui/Button.jsx';
import { Modal } from '../../../components/ui/Modal.jsx';

export function WorkspaceSettings() {
  const { current } = useWorkspaceStore();
  const [inviteModalOpen, setInviteModalOpen] = useState(false);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold text-slate-800">Configurações</h2>
        <Button onClick={() => setInviteModalOpen(true)}>Convidar membro</Button>
      </div>
      <p className="mb-4 text-slate-600">
        Workspace atual: <strong>{current?.name}</strong>. Convide pessoas por e-mail para compartilhar contas e transações.
      </p>

      <Modal
        open={inviteModalOpen}
        onClose={() => setInviteModalOpen(false)}
        title="Convidar membro"
      >
        <p className="text-slate-600">
          O envio de convite por e-mail será implementado em breve. O convidado poderá ver e editar os dados do workspace.
        </p>
        <Button className="mt-4" onClick={() => setInviteModalOpen(false)}>Fechar</Button>
      </Modal>
    </div>
  );
}
