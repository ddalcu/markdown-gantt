import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const STORAGE_KEY = 'markdown-gantt:source';
const PANEL_STORAGE_KEY = 'markdown-gantt:active-panel';
const VIEW_MODE_STORAGE_KEY = 'markdown-gantt:view-mode';

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
    expect(localStorage.getItem(STORAGE_KEY)).toBe(markdown);
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
    expect(localStorage.getItem(STORAGE_KEY)).toBe(markdown);
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
    expect(localStorage.getItem(STORAGE_KEY)).toBe(markdown);
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
    expect(localStorage.getItem(STORAGE_KEY)).toBe(markdown);
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
