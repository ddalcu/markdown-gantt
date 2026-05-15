export const PROJECTS_REGISTRY_KEY = 'markdown-gantt:projects';
export const ACTIVE_PROJECT_KEY = 'markdown-gantt:active-project';
export const PROJECT_SOURCE_KEY_PREFIX = 'markdown-gantt:project:';
export const LEGACY_SOURCE_KEY = 'markdown-gantt:source';

const PROJECT_ID_PATTERN = /^p(\d+)$/;

export function nextProjectId(ids) {
  const max = ids.reduce((acc, id) => {
    const match = PROJECT_ID_PATTERN.exec(id);
    return match ? Math.max(acc, Number(match[1])) : acc;
  }, 0);
  return `p${max + 1}`;
}

export function deriveProjectLabel(markdown, fallbackIndex) {
  const fallback = `Project ${fallbackIndex}`;
  const lines = String(markdown ?? '').split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }
    const match = /^#\s+(.+)$/.exec(trimmed);
    if (match) {
      return match[1].trim() || fallback;
    }
  }

  return fallback;
}

export function loadProjectIds(storage) {
  const raw = storage.getItem(PROJECTS_REGISTRY_KEY);
  if (!raw) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter((id) => typeof id === 'string' && id.length > 0);
  } catch {
    return [];
  }
}

export function saveProjectIds(storage, ids) {
  storage.setItem(PROJECTS_REGISTRY_KEY, JSON.stringify(ids));
}

export function loadActiveProjectId(storage, ids) {
  if (!Array.isArray(ids) || ids.length === 0) {
    return null;
  }
  const stored = storage.getItem(ACTIVE_PROJECT_KEY);
  if (stored && ids.includes(stored)) {
    return stored;
  }
  return ids[0];
}

export function saveActiveProjectId(storage, id) {
  storage.setItem(ACTIVE_PROJECT_KEY, id);
}

export function loadProjectSource(storage, id) {
  return storage.getItem(`${PROJECT_SOURCE_KEY_PREFIX}${id}`);
}

export function saveProjectSource(storage, id, markdown) {
  storage.setItem(`${PROJECT_SOURCE_KEY_PREFIX}${id}`, markdown);
}

export function removeProjectStorage(storage, id) {
  storage.removeItem(`${PROJECT_SOURCE_KEY_PREFIX}${id}`);
}

export function bootstrapProjects(storage, defaultMarkdown) {
  let ids = loadProjectIds(storage);

  if (ids.length === 0) {
    const legacy = storage.getItem(LEGACY_SOURCE_KEY);
    const seedSource = legacy ?? defaultMarkdown;
    ids = ['p1'];
    saveProjectIds(storage, ids);
    saveProjectSource(storage, 'p1', seedSource);
    if (legacy !== null) {
      storage.removeItem(LEGACY_SOURCE_KEY);
    }
  } else {
    for (const id of ids) {
      if (loadProjectSource(storage, id) === null) {
        saveProjectSource(storage, id, defaultMarkdown);
      }
    }
  }

  const activeId = loadActiveProjectId(storage, ids);
  if (activeId) {
    saveActiveProjectId(storage, activeId);
  }

  return { ids, activeId };
}
