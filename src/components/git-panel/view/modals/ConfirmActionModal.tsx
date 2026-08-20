import {
  CONFIRMATION_ACTION_LABELS,
  CONFIRMATION_BUTTON_CLASSES,
  CONFIRMATION_ICON_CONTAINER_CLASSES,
  CONFIRMATION_TITLES,
} from '../../constants/constants';
import type { ConfirmationRequest } from '../../types/types';

import { Check, Download, RotateCcw, Trash2, Upload } from '@/lib/icons';
import { Dialog, DialogContent, DialogTitle } from '@/shared/view/ui';

type ConfirmActionModalProps = {
  action: ConfirmationRequest | null;
  onCancel: () => void;
  onConfirm: () => void;
};

function renderConfirmActionIcon(actionType: ConfirmationRequest['type']) {
  if (actionType === 'discard' || actionType === 'delete') {
    return <Trash2 className="h-4 w-4" />;
  }

  if (actionType === 'commit') {
    return <Check className="h-4 w-4" />;
  }

  if (actionType === 'pull') {
    return <Download className="h-4 w-4" />;
  }

  if (actionType === 'revertLocalCommit') {
    return <RotateCcw className="h-4 w-4" />;
  }

  return <Upload className="h-4 w-4" />;
}

export default function ConfirmActionModal({ action, onCancel, onConfirm }: ConfirmActionModalProps) {
  const titleId = action ? `confirmation-title-${action.type}` : undefined;

  if (!action) {
    return null;
  }

  return (
    <Dialog open onOpenChange={(open) => {
      if (!open) onCancel();
    }}>
      <DialogContent
        aria-labelledby={titleId}
        className="w-[calc(100%-2rem)] max-w-md overflow-hidden p-0 sm:rounded-xl"
      >
        <DialogTitle id={titleId}>{CONFIRMATION_TITLES[action.type]}</DialogTitle>
        <div className="p-6">
          <div className="mb-4 flex items-center">
            <div className={`mr-3 rounded-full p-2 ${CONFIRMATION_ICON_CONTAINER_CLASSES[action.type]}`}>
              {renderConfirmActionIcon(action.type)}
            </div>
            <h3 className="text-lg font-semibold text-foreground">
              {CONFIRMATION_TITLES[action.type]}
            </h3>
          </div>

          <p className="mb-6 text-sm text-muted-foreground">{action.message}</p>

          <div className="flex justify-end space-x-3">
            <button
              type="button"
              onClick={onCancel}
              className="min-h-11 rounded-lg px-4 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onConfirm}
              className={`flex min-h-11 items-center space-x-2 rounded-lg px-4 py-2 text-sm text-white transition-colors ${CONFIRMATION_BUTTON_CLASSES[action.type]}`}
            >
              {renderConfirmActionIcon(action.type)}
              <span>{CONFIRMATION_ACTION_LABELS[action.type]}</span>
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
