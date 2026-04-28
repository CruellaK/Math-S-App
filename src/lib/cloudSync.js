import { getSupabaseClient } from './supabase';

export const SUPABASE_PROFILES_TABLE = 'student_profiles';
export const SHARED_ADMIN_REMOTE_USER_ID = '__app_admin_registry__';
export const SHARED_ADMIN_PROFILE_ID = '__owner__';
export const SHARED_CONTENT_REMOTE_USER_ID = '__app_shared_content__';
export const SHARED_CONTENT_PROFILE_ID = '__catalog__';

function translateSupabaseError(error) {
  if (!error) return 'Erreur inconnue';
  const message = String(error.message || error.error || error.code || error);
  const code = String(error.code || '');
  if (
    code === '42P01'
    || (message.includes('does not exist') && message.includes(SUPABASE_PROFILES_TABLE))
    || (message.includes('relation') && message.includes(SUPABASE_PROFILES_TABLE))
  ) {
    return `La table "${SUPABASE_PROFILES_TABLE}" est introuvable dans Supabase. Exécutez le fichier SQL de migration (supabase_migrations/001_create_student_profiles.sql) dans l'éditeur SQL de Supabase, puis rechargez l'application.`;
  }

  if (code === '22P02' || (message.includes('invalid input syntax for type uuid') && message.includes('__app_admin_registry__'))) {
    return `Le schéma Supabase actuel n'est pas compatible : remote_user_id et/ou profile_id sont encore en UUID. Exécutez le script de réparation supabase_migrations/002_repair_student_profiles_schema.sql, puis rechargez l'application.`;
  }

  if (code === '42501' || message.toLowerCase().includes('row-level security')) {
    return `Les policies RLS de "${SUPABASE_PROFILES_TABLE}" bloquent l'accès. Exécutez le script de réparation supabase_migrations/002_repair_student_profiles_schema.sql pour réinitialiser les policies, puis rechargez l'application.`;
  }

  return message;
}

function normalizeSharedAdminRecord(payload = {}) {
  return {
    ownerRemoteUserId: (payload?.ownerRemoteUserId || '').toString().trim(),
    ownerEmail: (payload?.ownerEmail || '').toString().trim(),
    ownerDisplayName: (payload?.ownerDisplayName || '').toString().trim(),
    ownerAvatar: (payload?.ownerAvatar || '').toString().trim(),
    lastClaimedAt: (payload?.lastClaimedAt || '').toString(),
    updatedAt: (payload?.updatedAt || '').toString(),
  };
}

function normalizeSharedContentRecord(payload = {}) {
  return {
    classContent: payload?.classContent && typeof payload.classContent === 'object' ? payload.classContent : {},
    updatedAt: (payload?.updatedAt || '').toString(),
  };
}

function buildSharedAdminRegistryPayload(admin = {}) {
  const normalized = normalizeSharedAdminRecord(admin);
  return {
    remote_user_id: SHARED_ADMIN_REMOTE_USER_ID,
    profile_id: SHARED_ADMIN_PROFILE_ID,
    profile_name: 'Admin verrouillé',
    selected_class: 'ADMIN',
    provider: 'supabase-admin-registry',
    email: '',
    google_enabled: true,
    payload: {
      ownerRemoteUserId: normalized.ownerRemoteUserId,
      lastClaimedAt: normalized.lastClaimedAt || new Date().toISOString(),
      updatedAt: normalized.updatedAt || new Date().toISOString(),
    },
    updated_at: new Date().toISOString(),
  };
}

function buildSharedContentRegistryPayload(content = {}) {
  const normalized = normalizeSharedContentRecord(content);
  return {
    remote_user_id: SHARED_CONTENT_REMOTE_USER_ID,
    profile_id: SHARED_CONTENT_PROFILE_ID,
    profile_name: 'Contenu partagé',
    selected_class: 'GLOBAL',
    provider: 'supabase-shared-content',
    email: '',
    google_enabled: false,
    payload: {
      classContent: normalized.classContent,
      updatedAt: normalized.updatedAt || new Date().toISOString(),
    },
    updated_at: new Date().toISOString(),
  };
}

export function buildSupabaseProfilePayload(profile, options = {}) {
  if (!profile) return null;
  const remoteUserId = (options.remoteUserId || profile?.auth?.remoteUserId || profile?.user?.studentIdentity?.remoteUserId || '').toString().trim();
  const remoteProfileId = (options.remoteProfileId || profile?.auth?.remoteProfileId || profile?.id || '').toString().trim();
  if (!remoteUserId) throw new Error('Utilisateur distant introuvable');
  if (!remoteProfileId) throw new Error('Profil distant introuvable');

  return {
    remote_user_id: remoteUserId,
    profile_id: remoteProfileId,
    profile_name: (profile.user?.profileName || '').toString(),
    selected_class: (profile.user?.selectedClass || profile?.settings?.selectedClass || '').toString(),
    provider: (profile.auth?.provider || 'local').toString(),
    email: (profile.user?.studentIdentity?.email || '').toString(),
    google_enabled: Boolean(profile.auth?.googleEnabled),
    payload: profile,
    updated_at: new Date().toISOString(),
  };
}

export async function pushProfileToSupabase(profile, options = {}) {
  const client = getSupabaseClient();
  if (!client) throw new Error('Supabase non configuré');
  const payload = buildSupabaseProfilePayload(profile, options);
  const { data, error } = await client
    .from(SUPABASE_PROFILES_TABLE)
    .upsert(payload, { onConflict: 'remote_user_id,profile_id' })
    .select()
    .single();

  if (error) throw new Error(translateSupabaseError(error));
  return data;
}

export async function getSharedAdminRegistry() {
  const client = getSupabaseClient();
  if (!client) throw new Error('Supabase non configuré');
  const { data, error } = await client
    .from(SUPABASE_PROFILES_TABLE)
    .select('*')
    .eq('remote_user_id', SHARED_ADMIN_REMOTE_USER_ID)
    .eq('profile_id', SHARED_ADMIN_PROFILE_ID)
    .maybeSingle();

  if (error) throw new Error(translateSupabaseError(error));
  if (!data?.payload) return null;
  return normalizeSharedAdminRecord({
    ...(data.payload || {}),
    updatedAt: data.updated_at || data.payload?.updatedAt || '',
  });
}

export async function setSharedAdminRegistry(admin = {}) {
  const client = getSupabaseClient();
  if (!client) throw new Error('Supabase non configuré');
  const normalized = normalizeSharedAdminRecord(admin);
  const requestedOwnerRemoteUserId = normalized.ownerRemoteUserId;
  if (!requestedOwnerRemoteUserId) throw new Error('Administrateur propriétaire introuvable');

  const existingRegistry = await getSharedAdminRegistry();
  if (existingRegistry?.ownerRemoteUserId && existingRegistry.ownerRemoteUserId !== requestedOwnerRemoteUserId) {
    throw new Error('Un administrateur propriétaire est déjà verrouillé sur un autre compte');
  }

  const payload = buildSharedAdminRegistryPayload(admin);
  let response = existingRegistry?.ownerRemoteUserId
    ? await client
      .from(SUPABASE_PROFILES_TABLE)
      .upsert(payload, { onConflict: 'remote_user_id,profile_id' })
      .select()
      .single()
    : await client
      .from(SUPABASE_PROFILES_TABLE)
      .insert(payload)
      .select()
      .single();

  if (response.error?.code === '23505') {
    const latestRegistry = await getSharedAdminRegistry();
    if (latestRegistry?.ownerRemoteUserId && latestRegistry.ownerRemoteUserId !== requestedOwnerRemoteUserId) {
      throw new Error('Un administrateur propriétaire est déjà verrouillé sur un autre compte');
    }
    response = await client
      .from(SUPABASE_PROFILES_TABLE)
      .upsert(payload, { onConflict: 'remote_user_id,profile_id' })
      .select()
      .single();
  }

  const { data, error } = response;
  if (error) throw new Error(translateSupabaseError(error));
  return normalizeSharedAdminRecord({
    ...(data?.payload || {}),
    updatedAt: data?.updated_at || data?.payload?.updatedAt || '',
  });
}

export async function getSharedContentRegistry() {
  const client = getSupabaseClient();
  if (!client) throw new Error('Supabase non configuré');
  const { data, error } = await client
    .from(SUPABASE_PROFILES_TABLE)
    .select('*')
    .eq('remote_user_id', SHARED_CONTENT_REMOTE_USER_ID)
    .eq('profile_id', SHARED_CONTENT_PROFILE_ID)
    .maybeSingle();

  if (error) throw new Error(translateSupabaseError(error));
  if (!data?.payload) return null;
  return normalizeSharedContentRecord({
    ...(data.payload || {}),
    updatedAt: data.updated_at || data.payload?.updatedAt || '',
  });
}

export async function setSharedContentRegistry(content = {}) {
  const client = getSupabaseClient();
  if (!client) throw new Error('Supabase non configuré');
  const payload = buildSharedContentRegistryPayload(content);
  const { data, error } = await client
    .from(SUPABASE_PROFILES_TABLE)
    .upsert(payload, { onConflict: 'remote_user_id,profile_id' })
    .select()
    .single();

  if (error) throw new Error(translateSupabaseError(error));
  return normalizeSharedContentRecord({
    ...(data?.payload || {}),
    updatedAt: data?.updated_at || data?.payload?.updatedAt || '',
  });
}

export async function clearSharedAdminRegistry() {
  const client = getSupabaseClient();
  if (!client) throw new Error('Supabase non configuré');
  const { error } = await client
    .from(SUPABASE_PROFILES_TABLE)
    .delete()
    .eq('remote_user_id', SHARED_ADMIN_REMOTE_USER_ID)
    .eq('profile_id', SHARED_ADMIN_PROFILE_ID);

  if (error) throw new Error(translateSupabaseError(error));
  return true;
}

export async function pullProfileFromSupabase(profileId, remoteUserId) {
  const client = getSupabaseClient();
  if (!client) throw new Error('Supabase non configuré');
  const { data, error } = await client
    .from(SUPABASE_PROFILES_TABLE)
    .select('*')
    .eq('remote_user_id', remoteUserId)
    .eq('profile_id', profileId)
    .maybeSingle();

  if (error) throw new Error(translateSupabaseError(error));
  return data || null;
}

export async function listSupabaseProfiles(remoteUserId) {
  const client = getSupabaseClient();
  if (!client) throw new Error('Supabase non configuré');
  const { data, error } = await client
    .from(SUPABASE_PROFILES_TABLE)
    .select('remote_user_id, profile_id, profile_name, selected_class, provider, email, google_enabled, updated_at')
    .eq('remote_user_id', remoteUserId)
    .order('updated_at', { ascending: false });

  if (error) throw new Error(translateSupabaseError(error));
  return Array.isArray(data) ? data : [];
}

export async function listSupabaseProfilesWithPayload(remoteUserId) {
  const client = getSupabaseClient();
  const targetRemoteUserId = (remoteUserId || '').toString().trim();
  if (!client) throw new Error('Supabase non configuré');
  if (!targetRemoteUserId) throw new Error('Utilisateur distant introuvable');

  const { data, error } = await client
    .from(SUPABASE_PROFILES_TABLE)
    .select('*')
    .eq('remote_user_id', targetRemoteUserId)
    .order('updated_at', { ascending: false });

  if (error) throw new Error(translateSupabaseError(error));
  return Array.isArray(data) ? data : [];
}

export async function listSupabaseAccounts() {
  const client = getSupabaseClient();
  if (!client) throw new Error('Supabase non configuré');
  const { data, error } = await client
    .from(SUPABASE_PROFILES_TABLE)
    .select('remote_user_id, profile_id, profile_name, selected_class, provider, email, google_enabled, updated_at')
    .not('remote_user_id', 'like', '__app_%')
    .order('updated_at', { ascending: false });

  if (error) throw new Error(translateSupabaseError(error));

  const accountMap = new Map();
  (Array.isArray(data) ? data : []).forEach((row) => {
    const remoteUserId = (row?.remote_user_id || '').toString().trim();
    if (!remoteUserId) return;

    const current = accountMap.get(remoteUserId) || {
      remoteUserId,
      email: (row?.email || '').toString().trim(),
      displayName: (row?.profile_name || row?.email || 'Compte élève').toString().trim(),
      providers: [],
      selectedClasses: [],
      profileCount: 0,
      profiles: [],
      lastUpdatedAt: (row?.updated_at || '').toString(),
    };

    current.profileCount += 1;
    current.lastUpdatedAt = current.lastUpdatedAt || (row?.updated_at || '').toString();
    if (!current.email && row?.email) current.email = (row.email || '').toString().trim();
    if ((!current.displayName || current.displayName === 'Compte élève') && row?.profile_name) {
      current.displayName = (row.profile_name || '').toString().trim() || current.displayName;
    }

    const provider = (row?.provider || '').toString().trim();
    if (provider && !current.providers.includes(provider)) current.providers.push(provider);
    const selectedClass = (row?.selected_class || '').toString().trim();
    if (selectedClass && !current.selectedClasses.includes(selectedClass)) current.selectedClasses.push(selectedClass);

    current.profiles.push({
      remoteUserId,
      profileId: (row?.profile_id || '').toString().trim(),
      profileName: (row?.profile_name || '').toString().trim(),
      selectedClass,
      provider,
      email: (row?.email || '').toString().trim(),
      googleEnabled: Boolean(row?.google_enabled),
      updatedAt: (row?.updated_at || '').toString(),
    });

    accountMap.set(remoteUserId, current);
  });

  return Array.from(accountMap.values()).sort((left, right) => {
    return new Date(right.lastUpdatedAt || 0).getTime() - new Date(left.lastUpdatedAt || 0).getTime();
  });
}

export async function reassignSupabaseProfilesClass(remoteUserId, className) {
  const client = getSupabaseClient();
  const targetRemoteUserId = (remoteUserId || '').toString().trim();
  const targetClassName = (className || '').toString().trim();
  if (!client) throw new Error('Supabase non configuré');
  if (!targetRemoteUserId) throw new Error('Utilisateur distant introuvable');
  if (!targetClassName) throw new Error('Classe cible introuvable');

  const { data: rows, error: fetchError } = await client
    .from(SUPABASE_PROFILES_TABLE)
    .select('*')
    .eq('remote_user_id', targetRemoteUserId);
  if (fetchError) throw new Error(translateSupabaseError(fetchError));

  const updates = (Array.isArray(rows) ? rows : []).filter((row) => {
    const profileId = (row?.profile_id || '').toString();
    return profileId !== SHARED_ADMIN_PROFILE_ID && profileId !== SHARED_CONTENT_PROFILE_ID;
  });

  for (const row of updates) {
    const nextPayload = row?.payload && typeof row.payload === 'object' ? { ...row.payload } : {};
    const nextUser = nextPayload.user && typeof nextPayload.user === 'object' ? { ...nextPayload.user } : {};
    nextUser.selectedClass = targetClassName;
    const nextSettings = nextPayload.settings && typeof nextPayload.settings === 'object' ? { ...nextPayload.settings } : {};
    nextSettings.selectedClass = targetClassName;
    nextPayload.user = nextUser;
    nextPayload.settings = nextSettings;
    const { error: updateError } = await client
      .from(SUPABASE_PROFILES_TABLE)
      .update({
        selected_class: targetClassName,
        payload: nextPayload,
        updated_at: new Date().toISOString(),
      })
      .eq('remote_user_id', targetRemoteUserId)
      .eq('profile_id', row.profile_id);
    if (updateError) throw new Error(translateSupabaseError(updateError));
  }
  return updates.length;
}

export async function deleteSupabaseProfiles(remoteUserId) {
  const client = getSupabaseClient();
  const targetRemoteUserId = (remoteUserId || '').toString().trim();
  if (!client) throw new Error('Supabase non configuré');
  if (!targetRemoteUserId) throw new Error('Utilisateur distant introuvable');

  const { error } = await client
    .from(SUPABASE_PROFILES_TABLE)
    .delete()
    .eq('remote_user_id', targetRemoteUserId);

  if (error) throw new Error(translateSupabaseError(error));
  return true;
}
