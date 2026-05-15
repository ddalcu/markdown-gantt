import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const STORAGE_KEY = 'markdown-gantt:source';
const PANEL_STORAGE_KEY = 'markdown-gantt:active-panel';
const VIEW_MODE_STORAGE_KEY = 'markdown-gantt:view-mode';
const PROJECTS_REGISTRY_KEY = 'markdown-gantt:projects';
const ACTIVE_PROJECT_KEY = 'markdown-gantt:active-project';
const PROJECT_SOURCE_KEY_PREFIX = 'markdown-gantt:project:';
const projectSourceKey = (id) => `${PROJECT_SOURCE_KEY_PREFIX}${id}`;

const roadmapMarkdown = `# Roadmap

## Assignees

| assignee | role | color |
| --- | --- | --- |
| Alex | dev | #3154d4 |

## Tasks

| id | name | start | end | progress | dependencies | assignee |
| --- | --- | --- | --- | --- | --- | --- |
| brief | Project brief | 2026-05-07 | 2026-05-09 | 50 | | Alex |
| design | Design pass | 2026-05-10 | 2026-05-12 | 0 | brief | Alex |

## Subtasks

| id | task | name | done | assignee |
| --- | --- | --- | --- | --- |
| brief-draft | brief | Draft | true | Alex |
| brief-review | brief | Review | false | Alex |
`;

function createLocalStorage() {
  const values = new Map();

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
  };
}

function dispatchMouse(target, type, options = {}) {
  target.dispatchEvent(new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: options.clientX ?? 0,
    clientY: options.clientY ?? 0,
  }));
}

describe('markdown gantt page', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal('localStorage', createLocalStorage());
    vi.stubGlobal('confirm', () => true);
    localStorage.clear();
    document.body.innerHTML = '<div id="app"></div>';
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.unstubAllGlobals();
  });

  it('renders saved markdown as a no-dependency gantt page', async () => {
    localStorage.setItem(STORAGE_KEY, roadmapMarkdown);
    localStorage.setItem(PANEL_STORAGE_KEY, 'chart');
    localStorage.setItem(VIEW_MODE_STORAGE_KEY, 'Month');

    await import('./main.js');

    expect(document.querySelector('#view-mode').value).toBe('Month');
    expect(document.querySelector('[data-panel-content="chart"]').hidden).toBe(false);
    expect(document.querySelectorAll('.bar-wrapper')).toHaveLength(2);
    expect(document.querySelector('[data-id="brief"]').className).toContain('has-subtasks');
    expect([...document.querySelectorAll('[data-id="brief"] .bar-subtask')].map((item) => item.textContent.trim()))
      .toEqual(['[x] Draft', '[ ] Review']);
  });

  it('persists chart drags to markdown and localStorage in Month view', async () => {
    localStorage.setItem(STORAGE_KEY, roadmapMarkdown);
    localStorage.setItem(PANEL_STORAGE_KEY, 'chart');
    localStorage.setItem(VIEW_MODE_STORAGE_KEY, 'Month');

    await import('./main.js');

    const bar = document.querySelector('[data-id="brief"] .bar');
    dispatchMouse(bar, 'mousedown', { clientX: 100, clientY: 70 });
    dispatchMouse(window, 'mousemove', { clientX: 112, clientY: 70 });
    dispatchMouse(window, 'mouseup', { clientX: 112, clientY: 70 });

    const markdown = document.querySelector('#markdown-input').value;
    expect(markdown).toContain('| brief | Project brief | 2026-05-10 | 2026-05-12 | 50 |  | Alex |');
    expect(markdown).toContain('| design | Design pass | 2026-05-13 | 2026-05-15 | 0 | brief | Alex |');
    expect(localStorage.getItem(projectSourceKey('p1'))).toBe(markdown);
  });

  it('persists right-edge resizing as an end-date change', async () => {
    localStorage.setItem(STORAGE_KEY, roadmapMarkdown);
    localStorage.setItem(PANEL_STORAGE_KEY, 'chart');
    localStorage.setItem(VIEW_MODE_STORAGE_KEY, 'Day');

    await import('./main.js');

    const rightHandle = document.querySelector('[data-id="brief"] .handle.right');
    dispatchMouse(rightHandle, 'mousedown', { clientX: 200, clientY: 90 });
    dispatchMouse(window, 'mousemove', { clientX: 280, clientY: 90 });
    dispatchMouse(window, 'mouseup', { clientX: 280, clientY: 90 });

    const markdown = document.querySelector('#markdown-input').value;
    expect(markdown).toContain('| brief | Project brief | 2026-05-07 | 2026-05-11 | 50 |  | Alex |');
    expect(markdown).toContain('| design | Design pass | 2026-05-10 | 2026-05-12 | 0 | brief | Alex |');
    expect(localStorage.getItem(projectSourceKey('p1'))).toBe(markdown);
  });

  it('persists vertical task sorting to markdown and localStorage', async () => {
    localStorage.setItem(STORAGE_KEY, roadmapMarkdown);
    localStorage.setItem(PANEL_STORAGE_KEY, 'chart');

    await import('./main.js');

    const design = document.querySelector('[data-id="design"] .bar');
    dispatchMouse(design, 'mousedown', { clientX: 200, clientY: 130 });
    dispatchMouse(window, 'mousemove', { clientX: 202, clientY: 50 });
    dispatchMouse(window, 'mouseup', { clientX: 202, clientY: 50 });

    const markdown = document.querySelector('#markdown-input').value;
    const designIndex = markdown.indexOf('| design | Design pass |');
    const briefIndex = markdown.indexOf('| brief | Project brief |');

    expect(designIndex).toBeGreaterThan(-1);
    expect(briefIndex).toBeGreaterThan(-1);
    expect(designIndex).toBeLessThan(briefIndex);
    expect(localStorage.getItem(projectSourceKey('p1'))).toBe(markdown);
  });

  it('shows delete for tasks without subtasks and removes the task from markdown', async () => {
    localStorage.setItem(STORAGE_KEY, roadmapMarkdown);
    localStorage.setItem(PANEL_STORAGE_KEY, 'chart');

    await import('./main.js');

    document.querySelector('[data-id="design"] .bar').click();
    expect(document.querySelector('#delete-task').hidden).toBe(false);

    document.querySelector('#delete-task').click();

    const markdown = document.querySelector('#markdown-input').value;
    expect(markdown).not.toContain('| design | Design pass |');
    expect(markdown).toContain('| brief | Project brief |');
  });

  it('hides delete in the modal when the task has subtasks', async () => {
    localStorage.setItem(STORAGE_KEY, roadmapMarkdown);
    localStorage.setItem(PANEL_STORAGE_KEY, 'chart');

    await import('./main.js');

    document.querySelector('[data-id="brief"] .bar').click();
    expect(document.querySelector('#delete-task').hidden).toBe(true);
  });

  it('lists own row plus every other lane in the task modal lane select', async () => {
    localStorage.setItem(STORAGE_KEY, roadmapMarkdown);
    localStorage.setItem(PANEL_STORAGE_KEY, 'chart');

    await import('./main.js');

    document.querySelector('[data-id="brief"] .bar').click();
    const select = document.querySelector('#modal-task-lane-select');
    const laneValues = [...select.querySelectorAll('option')].map((option) => option.value);
    expect(laneValues[0]).toBe('__OWN__');
    expect(laneValues).toContain('design');
    expect(laneValues).not.toContain('brief');
    expect(select.value).toBe('__OWN__');
  });

  it('opens the task modal and saves task and subtask edits', async () => {
    localStorage.setItem(STORAGE_KEY, roadmapMarkdown);
    localStorage.setItem(PANEL_STORAGE_KEY, 'chart');

    await import('./main.js');

    document.querySelector('[data-id="brief"] .bar').click();
    expect(document.querySelector('#task-modal').hidden).toBe(false);

    document.querySelector('#modal-task-name').value = 'Updated brief';
    document.querySelector('.subtask-done').checked = false;
    document.querySelector('#task-form').dispatchEvent(new SubmitEvent('submit', { bubbles: true }));

    const markdown = document.querySelector('#markdown-input').value;
    expect(markdown).toContain('| brief | Updated brief | 2026-05-07 | 2026-05-09 | 50 |  | Alex |');
    expect(markdown).toContain('| brief-draft | brief | Draft | false | Alex |');
  });

  it('links a task to a parent from the modal and does not close on backdrop click', async () => {
    localStorage.setItem(STORAGE_KEY, roadmapMarkdown);
    localStorage.setItem(PANEL_STORAGE_KEY, 'chart');

    await import('./main.js');

    document.querySelector('[data-id="brief"] .bar').click();
    expect(document.querySelector('#task-modal').hidden).toBe(false);

    document.querySelector('#task-modal').click();
    expect(document.querySelector('#task-modal').hidden).toBe(false);

    document.querySelector('#modal-task-parent').value = 'design';
    document.querySelector('#task-form').dispatchEvent(new SubmitEvent('submit', { bubbles: true }));

    const markdown = document.querySelector('#markdown-input').value;
    expect(markdown).toContain('| brief | Project brief | 2026-05-07 | 2026-05-09 | 50 | design | Alex |');
    expect(document.querySelector('#task-modal').hidden).toBe(true);
    expect(localStorage.getItem(projectSourceKey('p1'))).toBe(markdown);
  });

  it('adds tasks and subtasks from the page controls', async () => {
    localStorage.setItem(STORAGE_KEY, roadmapMarkdown);
    localStorage.setItem(PANEL_STORAGE_KEY, 'chart');

    await import('./main.js');

    document.querySelector('#add-task').click();
    expect(document.querySelector('#markdown-input').value).toContain('| task-3 | New task |');

    document.querySelector('[data-id="brief"] .bar').click();
    document.querySelector('#add-subtask').click();
    expect(document.querySelector('#markdown-input').value).toContain('| brief-subtask-3 | brief | New subtask | false |  |');
  });
});

describe('project tab strip', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal('localStorage', createLocalStorage());
    vi.stubGlobal('confirm', () => true);
    localStorage.clear();
    document.body.innerHTML = '<div id="app"></div>';
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.unstubAllGlobals();
  });

  it('renders one tab labeled from the markdown H1 on first load', async () => {
    localStorage.setItem(STORAGE_KEY, roadmapMarkdown);

    await import('./main.js');

    const tabs = [...document.querySelectorAll('#project-tabs .project-tab')];
    expect(tabs).toHaveLength(1);
    expect(tabs[0].textContent.trim()).toBe('Roadmap');
    expect(tabs[0].dataset.id).toBe('p1');
    expect(tabs[0].getAttribute('aria-current')).toBe('page');
    expect(localStorage.getItem(PROJECTS_REGISTRY_KEY)).toBe(JSON.stringify(['p1']));
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('creates a second tab and isolates per-tab markdown', async () => {
    localStorage.setItem(STORAGE_KEY, roadmapMarkdown);

    await import('./main.js');

    document.querySelector('#new-project').click();

    const tabs = [...document.querySelectorAll('#project-tabs .project-tab')];
    expect(tabs.map((tab) => tab.dataset.id)).toEqual(['p1', 'p2']);
    expect(tabs[1].getAttribute('aria-current')).toBe('page');

    const textarea = document.querySelector('#markdown-input');
    expect(textarea.value).toContain('# Product Launch Roadmap');
    expect(textarea.value).not.toContain('# Roadmap');
    expect(localStorage.getItem(projectSourceKey('p1'))).toContain('# Roadmap');
    expect(localStorage.getItem(ACTIVE_PROJECT_KEY)).toBe('p2');
  });

  it('restores per-tab markdown when switching back to the previous tab', async () => {
    localStorage.setItem(STORAGE_KEY, roadmapMarkdown);

    await import('./main.js');

    document.querySelector('#new-project').click();
    document.querySelector('#project-tabs .project-tab[data-id="p1"]').click();

    const textarea = document.querySelector('#markdown-input');
    expect(textarea.value).toContain('# Roadmap');
    expect(localStorage.getItem(ACTIVE_PROJECT_KEY)).toBe('p1');
    const activeTab = document.querySelector('#project-tabs .project-tab-item.active .project-tab');
    expect(activeTab.dataset.id).toBe('p1');
  });

  it('updates the active tab label live as the markdown H1 changes', async () => {
    localStorage.setItem(STORAGE_KEY, roadmapMarkdown);

    await import('./main.js');

    const textarea = document.querySelector('#markdown-input');
    textarea.value = textarea.value.replace('# Roadmap', '# Plan B');
    textarea.dispatchEvent(new Event('input', { bubbles: true }));

    const tab = document.querySelector('#project-tabs .project-tab[data-id="p1"]');
    expect(tab.textContent.trim()).toBe('Plan B');
  });

  it('confirms then deletes a tab and its per-project source key', async () => {
    localStorage.setItem(STORAGE_KEY, roadmapMarkdown);

    await import('./main.js');

    document.querySelector('#new-project').click();
    expect(localStorage.getItem(projectSourceKey('p2'))).not.toBeNull();

    document.querySelector('#project-tabs .project-tab-delete[data-id="p2"]').click();

    const tabs = [...document.querySelectorAll('#project-tabs .project-tab')];
    expect(tabs.map((tab) => tab.dataset.id)).toEqual(['p1']);
    expect(localStorage.getItem(projectSourceKey('p2'))).toBeNull();
    expect(localStorage.getItem(ACTIVE_PROJECT_KEY)).toBe('p1');
    expect(JSON.parse(localStorage.getItem(PROJECTS_REGISTRY_KEY))).toEqual(['p1']);
  });

  it('does not delete a tab when the confirm prompt is rejected', async () => {
    localStorage.setItem(STORAGE_KEY, roadmapMarkdown);
    vi.unstubAllGlobals();
    vi.stubGlobal('localStorage', createLocalStorage());
    vi.stubGlobal('confirm', () => false);
    localStorage.setItem(STORAGE_KEY, roadmapMarkdown);

    await import('./main.js');

    document.querySelector('#project-tabs .project-tab-delete[data-id="p1"]').click();

    expect(JSON.parse(localStorage.getItem(PROJECTS_REGISTRY_KEY))).toEqual(['p1']);
    expect(localStorage.getItem(projectSourceKey('p1'))).toContain('# Roadmap');
  });

  it('replaces the last deleted tab with a fresh default project', async () => {
    localStorage.setItem(STORAGE_KEY, roadmapMarkdown);

    await import('./main.js');

    document.querySelector('#project-tabs .project-tab-delete[data-id="p1"]').click();

    const tabs = [...document.querySelectorAll('#project-tabs .project-tab')];
    expect(tabs).toHaveLength(1);
    expect(tabs[0].dataset.id).toBe('p1');
    const textarea = document.querySelector('#markdown-input');
    expect(textarea.value).toContain('# Product Launch Roadmap');
    expect(textarea.value).not.toContain('# Roadmap');
  });
});
