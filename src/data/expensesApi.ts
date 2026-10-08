import { supabase } from './supabase';
import type { DeletedEntry, Entry } from '@/src/store/useExpenses';
import type { Category } from '@/src/lib/categories';

type ExpenseRow = {
  id: string;
  date: string;
  category: string;
  amount: number | string;
  note: string | null;
  created_at: string;
  deleted_at: string | null;
};

function toEntry(row: ExpenseRow): Entry {
  const category = row.category.toLowerCase();
  return {
    id: row.id,
    date: row.date,
    category: (category.charAt(0).toUpperCase() + category.slice(1)) as Category,
    amount: Number(row.amount),
    ...(row.note ? { note: row.note } : {}),
    createdAt: row.created_at,
    status: 'synced',
  };
}

export async function upsertExpense(entry: Entry): Promise<void> {
  const { error } = await supabase.from('expenses').upsert({
    id: entry.id,
    date: entry.date,
    category: entry.category.toLowerCase(),
    amount: entry.amount,
    note: entry.note ?? null,
    created_at: entry.createdAt,
    deleted_at: null,
  }, { onConflict: 'id' });
  if (error) throw error;
}

export async function softDeleteExpense(id: string, deletedAt: string): Promise<void> {
  const { error } = await supabase.from('expenses')
    .update({ deleted_at: deletedAt })
    .eq('id', id);
  if (error) throw error;
}

export async function fetchExpenses(from: string, through: string): Promise<Entry[]> {
  const rows: ExpenseRow[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabase.from('expenses')
      .select('id,date,category,amount,note,created_at')
      .gte('date', from)
      .lte('date', through)
      .is('deleted_at', null)
      .order('date', { ascending: false })
      .order('id', { ascending: true })
      .range(offset, offset + 999);
    if (error) throw error;
    const page = data as ExpenseRow[];
    rows.push(...page);
    if (page.length < 1000) break;
  }
  return rows.map(toEntry);
}

export async function fetchAllExpenses(): Promise<Entry[]> {
  const rows: ExpenseRow[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabase.from('expenses')
      .select('id,date,category,amount,note,created_at')
      .is('deleted_at', null)
      .order('date', { ascending: false })
      .order('id', { ascending: true })
      .range(offset, offset + 999);
    if (error) throw error;
    const page = data as ExpenseRow[];
    rows.push(...page);
    if (page.length < 1000) break;
  }
  return rows.map(toEntry);
}

export async function fetchDeletedExpenses(from: string, through: string): Promise<DeletedEntry[]> {
  const rows: ExpenseRow[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabase.from('expenses')
      .select('id,date,category,amount,note,created_at,deleted_at')
      .gte('date', from)
      .lte('date', through)
      .not('deleted_at', 'is', null)
      .order('date', { ascending: false })
      .order('id', { ascending: true })
      .range(offset, offset + 999);
    if (error) throw error;
    const page = data as ExpenseRow[];
    rows.push(...page);
    if (page.length < 1000) break;
  }
  return rows
    .filter((row): row is ExpenseRow & { deleted_at: string } => row.deleted_at !== null)
    .map((row) => ({ ...toEntry(row), deletedAt: row.deleted_at }));
}
