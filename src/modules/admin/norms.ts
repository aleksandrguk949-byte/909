import { supabase } from '@/lib/supabase'
import { toApiError } from '@/lib/errors'
import type { NormRuleRow, NormType, ItemKind, Category } from '@/lib/database.types'

export interface MergedNormRow {
  itemId: number
  qty: number
  source: 'template' | 'custom'
  excluded: boolean
  overrideId?: number
  templateQty?: number
  note: string | null
}

export function mergeNorms(
  templateRows: NormRuleRow[],
  overrideRows: NormRuleRow[],
): Map<NormType, MergedNormRow[]> {
  const result = new Map<NormType, MergedNormRow[]>()

  const allTypes: NormType[] = ['asset_standing', 'turnover_replenish', 'cleaning_consumption']

  for (const nt of allTypes) {
    const templates = templateRows.filter((r) => r.norm_type === nt)
    const overrides = overrideRows.filter((r) => r.norm_type === nt)
    const rows: MergedNormRow[] = []

    const overrideMap = new Map(overrides.map((o) => [o.item_id, o]))
    const templateMap = new Map(templates.map((t) => [t.item_id, t]))

    for (const [itemId, ov] of overrideMap) {
      const tmpl = templateMap.get(itemId)
      rows.push({
        itemId,
        qty: Number(ov.qty),
        source: 'custom',
        excluded: Number(ov.qty) === 0,
        overrideId: ov.id,
        templateQty: tmpl ? Number(tmpl.qty) : undefined,
        note: ov.note,
      })
    }

    for (const [itemId, tmpl] of templateMap) {
      if (overrideMap.has(itemId)) continue
      rows.push({
        itemId,
        qty: Number(tmpl.qty),
        source: 'template',
        excluded: Number(tmpl.qty) === 0,
        templateQty: Number(tmpl.qty),
        note: tmpl.note,
      })
    }

    rows.sort((a, b) => a.itemId - b.itemId)
    result.set(nt, rows)
  }

  return result
}

export interface NormCatalogItem {
  id: number
  name: string
  category: string
  kind: ItemKind
  base_unit: string
  pack_size: number
  pack_label: string
}

export async function fetchNormCatalog(): Promise<NormCatalogItem[]> {
  const { data: items, error, status } = await supabase
    .from('items')
    .select('id,name,base_unit,pack_size,pack_label,category_id,active')
    .eq('active', true)
    .order('name')
  if (error) throw toApiError(error, status)

  const catIds = Array.from(new Set((items ?? []).map((i) => i.category_id)))
  const catResults = catIds.length
    ? await Promise.all(
        catIds.map((id) => supabase.from('categories').select('id,name,kind').eq('id', id).maybeSingle()),
      )
    : []
  for (const r of catResults) if (r.error) throw toApiError(r.error, r.status)
  const catMap = new Map(
    catResults
      .map((r) => r.data as Category | null)
      .filter((c): c is Category => c !== null)
      .map((c) => [c.id, c]),
  )

  return (items ?? []).map((i) => {
    const cat = catMap.get(i.category_id)
    return {
      id: i.id,
      name: i.name,
      category: cat?.name ?? '—',
      kind: cat?.kind ?? 'consumable',
      base_unit: i.base_unit,
      pack_size: i.pack_size,
      pack_label: i.pack_label,
    }
  })
}

export async function apartmentNormsMaterialize(
  apartmentId: number,
  normTypes: NormType[],
): Promise<unknown> {
  const { data, error, status } = await supabase.rpc('apartment_norms_materialize', {
    p_apartment: apartmentId,
    p_norm_types: normTypes,
  })
  if (error) throw toApiError(error, status)
  return data
}

export async function apartmentNormsReset(
  apartmentId: number,
  normTypes: NormType[],
): Promise<unknown> {
  const { data, error, status } = await supabase.rpc('apartment_norms_reset', {
    p_apartment: apartmentId,
    p_norm_types: normTypes,
  })
  if (error) throw toApiError(error, status)
  return data
}

export async function apartmentNormsCopy(
  fromId: number,
  toIds: number[],
  normTypes: NormType[],
  replace: boolean,
): Promise<unknown> {
  const { data, error, status } = await supabase.rpc('apartment_norms_copy', {
    p_from: fromId,
    p_to: toIds,
    p_norm_types: normTypes,
    p_replace: replace,
  })
  if (error) throw toApiError(error, status)
  return data
}
