import { describe, expect, it } from 'vitest';
import {
  bootstrapProjects,
  deriveProjectLabel,
  loadActiveProjectId,
  loadProjectIds,
  loadProjectSource,
  nextProjectId,
  PROJECT_SOURCE_KEY_PREFIX,
  removeProjectStorage,
  saveActiveProjectId,
  saveProjectIds,
  saveProjectSource,
} from './projects.js';

const LEGACY_KEY = 'markdown-gantt:source';
const REGISTRY_KEY = 'markdown-gantt:projects';
const ACTIVE_KEY = 'markdown-gantt:active-project';

function createStorage(initial = {}) {
  const values = new Map(Object.entries(initial));

  return {
    clear() {
      values.clear();
    },
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    removeItem(key) {
      values.delete(key);
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
    keys() {
      return [...values.keys()];
    },
  };
}

describe('nextProjectId', () => {
  it('returns p1 for an empty list', () => {
    expect(nextProjectId([])).toBe('p1');
  });

  it('returns the next sequential id based on the max numeric suffix', () => {
    expect(nextProjectId(['p1', 'p3'])).toBe('p4');
  });

  it('ignores ids that do not match the pN pattern', () => {
    expect(nextProjectId(['p2', 'custom', 'pX', 'p10'])).toBe('p11');
  });
});

describe('deriveProjectLabel', () => {
  it('returns the first H1 trimmed when present', () => {
    expect(deriveProjectLabel('# Roadmap\n\n## Tasks', 2)).toBe('Roadmap');
  });

  it('ignores lines with more than one leading hash', () => {
    expect(deriveProjectLabel('## Tasks only', 5)).toBe('Project 5');
  });

  it('falls back to the numbered label when no H1 is found', () => {
    expect(deriveProjectLabel('', 3)).toBe('Project 3');
    expect(deriveProjectLabel('Hello world', 4)).toBe('Project 4');
  });

  it('skips blank lines and trims whitespace', () => {
    expect(deriveProjectLabel('\n\n#    Spaced Title   \n\n', 1)).toBe('Spaced Title');
  });
});

describe('removeProjectStorage', () => {
  it('removes only the targeted per-project source key', () => {
    const storage = createStorage({
      [`${PROJECT_SOURCE_KEY_PREFIX}p1`]: 'one',
      [`${PROJECT_SOURCE_KEY_PREFIX}p2`]: 'two',
    });
    removeProjectStorage(storage, 'p1');
    expect(storage.getItem(`${PROJECT_SOURCE_KEY_PREFIX}p1`)).toBeNull();
    expect(storage.getItem(`${PROJECT_SOURCE_KEY_PREFIX}p2`)).toBe('two');
  });
});

describe('loadProjectIds / saveProjectIds', () => {
  it('round-trips a list of ids', () => {
    const storage = createStorage();
    saveProjectIds(storage, ['p1', 'p2']);
    expect(loadProjectIds(storage)).toEqual(['p1', 'p2']);
  });

  it('returns an empty array when the registry is missing or invalid JSON', () => {
    const storage = createStorage();
    expect(loadProjectIds(storage)).toEqual([]);
    storage.setItem(REGISTRY_KEY, 'not json');
    expect(loadProjectIds(storage)).toEqual([]);
  });
});

describe('loadActiveProjectId', () => {
  it('returns the stored id when it exists in the list', () => {
    const storage = createStorage({ [ACTIVE_KEY]: 'p2' });
    expect(loadActiveProjectId(storage, ['p1', 'p2'])).toBe('p2');
  });

  it('clamps to the first id when the stored id is missing or unknown', () => {
    const storage = createStorage({ [ACTIVE_KEY]: 'p9' });
    expect(loadActiveProjectId(storage, ['p1', 'p2'])).toBe('p1');
    const empty = createStorage();
    expect(loadActiveProjectId(empty, ['p1'])).toBe('p1');
  });

  it('returns null when there are no ids', () => {
    const storage = createStorage();
    expect(loadActiveProjectId(storage, [])).toBeNull();
  });
});

describe('saveActiveProjectId / loadProjectSource / saveProjectSource', () => {
  it('persists the active id', () => {
    const storage = createStorage();
    saveActiveProjectId(storage, 'p2');
    expect(storage.getItem(ACTIVE_KEY)).toBe('p2');
  });

  it('reads and writes per-project markdown by id', () => {
    const storage = createStorage();
    saveProjectSource(storage, 'p1', '# Hello');
    expect(loadProjectSource(storage, 'p1')).toBe('# Hello');
    expect(loadProjectSource(storage, 'p2')).toBeNull();
  });
});

describe('bootstrapProjects', () => {
  it('migrates a legacy markdown-gantt:source value into a single p1 project and removes the legacy key', () => {
    const storage = createStorage({ [LEGACY_KEY]: '# Legacy plan' });
    const result = bootstrapProjects(storage, '# default');
    expect(result).toEqual({ ids: ['p1'], activeId: 'p1' });
    expect(storage.getItem(LEGACY_KEY)).toBeNull();
    expect(loadProjectSource(storage, 'p1')).toBe('# Legacy plan');
    expect(loadProjectIds(storage)).toEqual(['p1']);
    expect(storage.getItem(ACTIVE_KEY)).toBe('p1');
  });

  it('creates a single p1 with the default markdown when nothing exists', () => {
    const storage = createStorage();
    const result = bootstrapProjects(storage, '# default');
    expect(result).toEqual({ ids: ['p1'], activeId: 'p1' });
    expect(loadProjectSource(storage, 'p1')).toBe('# default');
  });

  it('leaves an existing registry alone and clamps the active id', () => {
    const storage = createStorage({
      [REGISTRY_KEY]: JSON.stringify(['p1', 'p2']),
      [ACTIVE_KEY]: 'p2',
      [`${PROJECT_SOURCE_KEY_PREFIX}p1`]: '# one',
      [`${PROJECT_SOURCE_KEY_PREFIX}p2`]: '# two',
    });
    const result = bootstrapProjects(storage, '# default');
    expect(result).toEqual({ ids: ['p1', 'p2'], activeId: 'p2' });
    expect(loadProjectSource(storage, 'p2')).toBe('# two');
  });

  it('seeds missing per-project sources with the default markdown', () => {
    const storage = createStorage({
      [REGISTRY_KEY]: JSON.stringify(['p1']),
    });
    bootstrapProjects(storage, '# default');
    expect(loadProjectSource(storage, 'p1')).toBe('# default');
  });
});
