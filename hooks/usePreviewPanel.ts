import { useState, useCallback } from 'react';

export interface UsePreviewPanelReturn<T> {
  // Preview state
  previewItem: T | null;
  setPreviewItem: (item: T | null) => void;
  // Edit mode
  editMode: boolean;
  setEditMode: (mode: boolean) => void;
  editData: Partial<T> | null;
  setEditData: (data: Partial<T> | null) => void;
  editSaving: boolean;
  setEditSaving: (saving: boolean) => void;
  // Actions
  startEdit: (item: T, initialData?: Partial<T>) => void;
  cancelEdit: () => void;
  closePreview: () => void;
}

export function usePreviewPanel<T>(): UsePreviewPanelReturn<T> {
  const [previewItem, setPreviewItem] = useState<T | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [editData, setEditData] = useState<Partial<T> | null>(null);
  const [editSaving, setEditSaving] = useState(false);

  const startEdit = useCallback((item: T, initialData?: Partial<T>) => {
    setEditMode(true);
    setEditData(initialData ?? (item as Partial<T>));
  }, []);

  const cancelEdit = useCallback(() => {
    setEditMode(false);
    setEditData(null);
  }, []);

  const closePreview = useCallback(() => {
    setPreviewItem(null);
    setEditMode(false);
    setEditData(null);
    setEditSaving(false);
  }, []);

  return {
    previewItem,
    setPreviewItem,
    editMode,
    setEditMode,
    editData,
    setEditData,
    editSaving,
    setEditSaving,
    startEdit,
    cancelEdit,
    closePreview,
  };
}
