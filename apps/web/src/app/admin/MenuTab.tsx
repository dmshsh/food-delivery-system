'use client';

import { useEffect, useState } from 'react';
import { errorMessage, formatKzt } from '@/lib/format';
import { readDragPayload, reorder, setDragPayload } from '@/lib/dnd';
import type { AdminMenuItem, MenuItemBody } from '@/lib/types';
import {
  useAdminMenuQuery,
  useCreateDishMutation,
  useRemoveDishMutation,
  useReorderMenuMutation,
  useUpdateDishMutation,
} from '@/store/api';

const EMPTY: MenuItemBody = { name: '', description: '', category: 'Meals', priceTiyn: 0, available: true };

export default function MenuTab() {
  const { data, isLoading, error } = useAdminMenuQuery();
  const [reorderMenu, { isLoading: saving }] = useReorderMenuMutation();
  const [removeDish] = useRemoveDishMutation();
  const [message, setMessage] = useState('');
  const [editing, setEditing] = useState<AdminMenuItem | 'new' | null>(null);

  // A local copy so the list follows the pointer while the drag is happening; the
  // server's answer replaces it as soon as the new order is saved.
  const [items, setItems] = useState<AdminMenuItem[]>([]);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  useEffect(() => {
    if (data?.items) setItems(data.items);
  }, [data]);

  /** Saves the arrangement as one list, so the menu can never end up half-reordered. */
  async function persist(next: AdminMenuItem[]) {
    const previous = items;
    setItems(next);
    setMessage('');
    try {
      await reorderMenu(next.map((i) => i.id)).unwrap();
    } catch (e) {
      setItems(previous); // put the list back the way it was
      setMessage(errorMessage(e));
    }
  }

  function moveBy(index: number, delta: number) {
    const target = index + delta;
    if (target < 0 || target >= items.length) return;
    void persist(reorder(items, index, target));
  }

  async function remove(item: AdminMenuItem) {
    setMessage('');
    try {
      const result = await removeDish(item.id).unwrap();
      setMessage(
        result.hidden
          ? `“${item.name}” appears in past orders, so it was hidden from the menu instead of deleted.`
          : `“${item.name}” was deleted.`,
      );
    } catch (e) {
      setMessage(errorMessage(e));
    }
  }

  if (isLoading) return <p className="text-stone-500">Loading…</p>;
  if (error != null) return <p role="alert" className="text-red-700">{errorMessage(error)}</p>;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-medium">Menu</h2>
          <p className="text-sm text-stone-600">
            Drag a dish by its handle to change the order customers see, or use the arrow buttons.
          </p>
        </div>
        <button className="btn-primary" onClick={() => setEditing('new')}>Add a dish</button>
      </div>

      {message && (
        <p role="status" className="mt-3 rounded-lg border border-stone-300 bg-stone-50 p-3 text-sm">{message}</p>
      )}

      {editing && (
        <DishForm
          item={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onMessage={setMessage}
        />
      )}

      <ul className="mt-4 space-y-2">
        {items.map((item, index) => (
          <li
            key={item.id}
            onDragOver={(e) => {
              if (dragIndex === null) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = 'move';
              setOverIndex(index);
            }}
            onDrop={(e) => {
              e.preventDefault();
              const dragged = Number(readDragPayload(e));
              const from = items.findIndex((i) => i.id === dragged);
              setDragIndex(null);
              setOverIndex(null);
              if (from >= 0 && from !== index) void persist(reorder(items, from, index));
            }}
            className={`card flex flex-wrap items-center gap-3 transition ${
              dragIndex === index ? 'opacity-50' : ''
            } ${overIndex === index && dragIndex !== index ? 'border-emerald-500 ring-2 ring-emerald-200' : ''} ${
              item.available ? '' : 'bg-stone-50'
            }`}
          >
            <span
              draggable
              onDragStart={(e) => {
                setDragPayload(e, item.id);
                setDragIndex(index);
              }}
              onDragEnd={() => {
                setDragIndex(null);
                setOverIndex(null);
              }}
              role="button"
              aria-label={`Drag ${item.name} to reorder`}
              title="Drag to reorder"
              className="cursor-grab select-none px-1 text-xl leading-none text-stone-400 active:cursor-grabbing"
            >
              ⠿
            </span>
            <span className="w-6 text-center text-sm text-stone-400">{index + 1}</span>

            <div className="min-w-[12rem] flex-1">
              <p className="font-medium">
                {item.name}
                {!item.available && <span className="ml-2 rounded bg-stone-200 px-2 py-0.5 text-xs">hidden</span>}
              </p>
              <p className="text-sm text-stone-600">{item.description}</p>
              <p className="text-xs text-stone-500">
                {item.category} · ordered {item.timesOrdered} time{item.timesOrdered === 1 ? '' : 's'}
              </p>
            </div>

            <span className="font-medium text-emerald-800">{formatKzt(item.priceTiyn)}</span>

            <div className="flex items-center gap-1">
              {/* Dragging is impossible with a keyboard, so the same move has buttons. */}
              <button className="btn-secondary px-2 py-1" aria-label={`Move ${item.name} up`} disabled={index === 0 || saving} onClick={() => moveBy(index, -1)}>↑</button>
              <button className="btn-secondary px-2 py-1" aria-label={`Move ${item.name} down`} disabled={index === items.length - 1 || saving} onClick={() => moveBy(index, 1)}>↓</button>
              <button className="btn-secondary" onClick={() => setEditing(item)}>Edit</button>
              <button className="btn-danger" onClick={() => remove(item)}>Remove</button>
            </div>
          </li>
        ))}
      </ul>
      {items.length === 0 && <p className="mt-4 text-stone-500">The menu is empty. Add the first dish.</p>}
    </div>
  );
}

/** Create or edit one dish. The same form for both, because the fields are the same. */
function DishForm({
  item,
  onClose,
  onMessage,
}: {
  item: AdminMenuItem | null;
  onClose: () => void;
  onMessage: (text: string) => void;
}) {
  const [createDish, create] = useCreateDishMutation();
  const [updateDish, update] = useUpdateDishMutation();
  const [form, setForm] = useState<MenuItemBody>(
    item
      ? {
          name: item.name,
          description: item.description,
          category: item.category,
          priceTiyn: item.priceTiyn,
          available: item.available,
        }
      : EMPTY,
  );
  const [error, setError] = useState('');
  const busy = create.isLoading || update.isLoading;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    try {
      if (item) {
        await updateDish({ id: item.id, ...form }).unwrap();
        onMessage(`“${form.name}” was saved.`);
      } else {
        await createDish(form).unwrap();
        onMessage(`“${form.name}” was added to the menu.`);
      }
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <form onSubmit={submit} className="card mt-4 space-y-3 border-emerald-300">
      <h3 className="font-medium">{item ? `Edit “${item.name}”` : 'New dish'}</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="dish-name" className="label">Name</label>
          <input id="dish-name" className="input" required maxLength={80} value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
        <div>
          <label htmlFor="dish-category" className="label">Category</label>
          <input id="dish-category" className="input" required maxLength={40} list="categories" value={form.category}
            onChange={(e) => setForm({ ...form, category: e.target.value })} />
          <datalist id="categories">
            <option value="Meals" />
            <option value="Drinks" />
            <option value="Extras" />
          </datalist>
        </div>
      </div>
      <div>
        <label htmlFor="dish-description" className="label">Description</label>
        <textarea id="dish-description" rows={2} className="input" required maxLength={300} value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })} />
      </div>
      <div className="flex flex-wrap items-end gap-4">
        <div>
          {/* Prices are entered in KZT but stored as whole tiyn, so no cent ever rounds away. */}
          <label htmlFor="dish-price" className="label">Price, KZT</label>
          <input id="dish-price" type="number" className="input w-40" min={0} step="0.01" required
            value={form.priceTiyn / 100}
            onChange={(e) => setForm({ ...form, priceTiyn: Math.round(Number(e.target.value) * 100) })} />
        </div>
        <label className="flex items-center gap-2 pb-2 text-sm">
          <input type="checkbox" checked={form.available}
            onChange={(e) => setForm({ ...form, available: e.target.checked })} />
          Shown on the menu
        </label>
      </div>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      <div className="flex gap-2">
        <button className="btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
        <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
      </div>
    </form>
  );
}
