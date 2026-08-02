import { isConfigured, supabase } from './supabase';

/**
 * Scripts on the server.
 *
 * The local copy stays the one being edited — it is instant, and it works with
 * no connection. This module is the copy that follows the writer: every save
 * is pushed up, and signing in on another machine pulls down whatever is
 * newer there.
 *
 * Conflicts are settled by `updated_at`, last write wins. That is the honest
 * rule for single-author documents, and it is what a writer expects: the last
 * thing they typed, wherever they typed it, is the version that survives.
 */

const rowToDoc = (row) => ({ ...row.doc, id: row.id, name: row.name, updatedAt: Date.parse(row.updated_at) });

/** Everything this account has written, newest first. */
export async function listRemote() {
  if (!isConfigured()) return [];
  const { data, error } = await supabase
    .from('scripts')
    .select('id, name, pages, updated_at')
    .order('updated_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data || []).map((r) => ({
    id: r.id,
    name: r.name,
    pages: r.pages,
    updatedAt: Date.parse(r.updated_at),
  }));
}

export async function fetchRemote(id) {
  if (!isConfigured()) return null;
  const { data, error } = await supabase
    .from('scripts')
    .select('id, name, doc, updated_at')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? rowToDoc(data) : null;
}

/**
 * Push a document up. The row id is the document id, so a script keeps its
 * identity across devices and an upsert is all the syncing that is needed.
 */
export async function pushRemote(doc, ownerId) {
  if (!isConfigured() || !ownerId) return null;
  const { data, error } = await supabase
    .from('scripts')
    .upsert(
      {
        id: doc.id,
        owner: ownerId,
        name: doc.titlePage?.title || doc.name || 'Untitled Screenplay',
        doc,
        pages: doc.elements?.length || 1,
      },
      { onConflict: 'id' },
    )
    .select('updated_at')
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? Date.parse(data.updated_at) : null;
}

export async function deleteRemote(id) {
  if (!isConfigured()) return;
  const { error } = await supabase.from('scripts').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

/**
 * Reconcile the two libraries after signing in.
 *
 * Anything held only locally is uploaded — a writer who worked offline for a
 * week loses nothing by finally signing in. Anything held only on the server
 * is offered for download. Where both exist, the newer timestamp wins.
 */
export function reconcile(localIndex, remoteIndex) {
  const remote = new Map(remoteIndex.map((r) => [r.id, r]));
  const local = new Map(localIndex.map((l) => [l.id, l]));

  const push = [];
  const pull = [];

  for (const [id, l] of local) {
    const r = remote.get(id);
    if (!r) push.push(id);
    else if ((l.updatedAt || 0) > (r.updatedAt || 0)) push.push(id);
  }
  for (const [id, r] of remote) {
    const l = local.get(id);
    if (!l || (r.updatedAt || 0) > (l.updatedAt || 0)) pull.push(id);
  }

  return { push, pull };
}
