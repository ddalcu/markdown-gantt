import { beforeEach, describe, expect, it, vi } from 'vitest';
import { VanillaGantt } from './gantt.js';

function dispatchMouse(target, type, options = {}) {
  target.dispatchEvent(new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: options.clientX ?? 0,
    clientY: options.clientY ?? 0,
  }));
}

describe('VanillaGantt', () => {
  let host;

  beforeEach(() => {
    document.body.innerHTML = '<div id="host"></div>';
    host = document.querySelector('#host');
  });

  it('renders task bars, progress, dependency connectors, and subtasks in parent bars', () => {
    const gantt = new VanillaGantt(host, [
      {
        id: 'brief',
        name: 'Brief',
        start: '2026-05-07',
        end: '2026-05-09',
        progress: 50,
        custom_class: 'assignee-0',
        hasSubtasks: true,
        subtasks: [
          { id: 'brief-draft', name: 'Draft', done: true },
          { id: 'brief-review', name: 'Review', done: false },
        ],
      },
      {
        id: 'design',
        name: 'Design',
        start: '2026-05-10',
        end: '2026-05-12',
        progress: 0,
        dependencies: 'brief',
      },
    ], { view_mode: 'Day' });

    expect(gantt.$container.className).toContain('gantt-container');
    expect(host.querySelector('.calendar-header')).not.toBeNull();
    expect([...host.querySelectorAll('.calendar-row-minor .calendar-tick')].map((tick) => tick.textContent.trim()))
      .toContain('7');
    expect(host.querySelectorAll('.bar-wrapper')).toHaveLength(2);
    expect(host.querySelector('[data-id="brief"]').className).toContain('assignee-0');
    expect(host.querySelector('[data-id="brief"]').className).toContain('has-subtasks');
    expect([...host.querySelectorAll('[data-id="brief"] .bar-subtask')].map((item) => item.textContent.trim()))
      .toEqual(['[x] Draft', '[ ] Review']);
    expect(host.querySelector('.dependency-path')).not.toBeNull();
    expect(host.querySelector('.dependency-path').getAttribute('d')).toContain('Q');
    expect(host.querySelector('.dependency-path').getAttribute('stroke-linejoin')).toBe('round');
  });

  it('invokes on_add_sibling_task when the + control is clicked', () => {
    const onAddSibling = vi.fn();
    new VanillaGantt(host, [
      {
        id: 'brief',
        name: 'Brief',
        start: '2026-05-07',
        end: '2026-05-09',
        progress: 50,
        lane: 'brief',
      },
    ], { view_mode: 'Day', on_add_sibling_task: onAddSibling });

    host.querySelector('[data-id="brief"] .bar-add-sibling').click();
    expect(onAddSibling).toHaveBeenCalledTimes(1);
    expect(onAddSibling).toHaveBeenCalledWith(expect.objectContaining({ id: 'brief' }));
  });

  it('previews moved bars during drag before committing snapped date changes', () => {
    const onDateChange = vi.fn();
    const gantt = new VanillaGantt(host, [
      {
        id: 'brief',
        name: 'Brief',
        start: '2026-05-07',
        end: '2026-05-09',
        progress: 50,
      },
      {
        id: 'design',
        name: 'Design',
        start: '2026-05-10',
        end: '2026-05-12',
        progress: 0,
        dependencies: 'brief',
      },
    ], { view_mode: 'Day', on_date_change: onDateChange });

    const bar = host.querySelector('[data-id="brief"] .bar');
    const wrapper = host.querySelector('[data-id="brief"]');
    const dependency = host.querySelector('[data-from="brief"][data-to="design"]');
    const initialLeft = wrapper.style.left;
    dispatchMouse(bar, 'mousedown', { clientX: 100, clientY: 70 });
    dispatchMouse(window, 'mousemove', { clientX: 180, clientY: 70 });

    expect(wrapper.style.left).not.toBe(initialLeft);
    expect(wrapper.style.left).toBe('160px');
    expect(dependency.querySelector('.dependency-path').getAttribute('d')).toContain('M 280 84');
    expect(dependency.querySelector('.dependency-path').getAttribute('d')).toContain('128');
    expect(onDateChange).not.toHaveBeenCalled();

    dispatchMouse(window, 'mouseup', { clientX: 180, clientY: 70 });

    expect(onDateChange).toHaveBeenCalledTimes(2);
    expect(onDateChange.mock.calls[0][0].id).toBe('brief');
    expect(onDateChange.mock.calls[0][1]).toEqual(new Date(2026, 4, 9));
    expect(onDateChange.mock.calls[0][2]).toEqual(new Date(2026, 4, 11));
    expect(onDateChange.mock.calls[1][0].id).toBe('design');
    expect(onDateChange.mock.calls[1][1]).toEqual(new Date(2026, 4, 12));
  });

  it('highlights dependency lines for the dragged task and moved dependent tasks', () => {
    new VanillaGantt(host, [
      {
        id: 'brief',
        name: 'Brief',
        start: '2026-05-07',
        end: '2026-05-09',
        progress: 50,
        subtasks: [
          { id: 'brief-draft', name: 'Draft', done: false },
        ],
      },
      {
        id: 'design',
        name: 'Design',
        start: '2026-05-10',
        end: '2026-05-12',
        progress: 0,
        dependencies: 'brief',
      },
      {
        id: 'qa',
        name: 'QA',
        start: '2026-05-13',
        end: '2026-05-14',
        progress: 0,
        dependencies: 'design',
      },
      {
        id: 'launch',
        name: 'Launch',
        start: '2026-05-15',
        end: '2026-05-16',
        progress: 0,
      },
    ], { view_mode: 'Day' });

    const bar = host.querySelector('[data-id="brief"] .bar');
    dispatchMouse(bar, 'mousedown', { clientX: 100, clientY: 70 });
    dispatchMouse(window, 'mousemove', { clientX: 140, clientY: 70 });

    expect(host.querySelector('[data-from="brief"][data-to="design"]').classList.contains('is-active')).toBe(true);
    expect(host.querySelector('[data-from="design"][data-to="qa"]').classList.contains('is-active')).toBe(true);
    expect(host.querySelectorAll('.dependency-line.is-active')).toHaveLength(2);

    dispatchMouse(window, 'mouseup', { clientX: 140, clientY: 70 });

    expect(host.querySelectorAll('.dependency-line.is-active')).toHaveLength(0);
  });

  it('previews vertical task sorting and reports the new task order', () => {
    const onDateChange = vi.fn();
    const onOrderChange = vi.fn();
    new VanillaGantt(host, [
      {
        id: 'brief',
        name: 'Brief',
        start: '2026-05-07',
        end: '2026-05-09',
        progress: 50,
      },
      {
        id: 'design',
        name: 'Design',
        start: '2026-05-10',
        end: '2026-05-12',
        progress: 0,
        dependencies: 'brief',
      },
    ], { view_mode: 'Day', on_date_change: onDateChange, on_order_change: onOrderChange });

    const bar = host.querySelector('[data-id="design"] .bar');
    dispatchMouse(bar, 'mousedown', { clientX: 200, clientY: 130 });
    dispatchMouse(window, 'mousemove', { clientX: 202, clientY: 50 });

    expect([...host.querySelectorAll('.bar-wrapper')].map((wrapper) => wrapper.dataset.id))
      .toEqual(['design', 'brief']);
    expect(onDateChange).not.toHaveBeenCalled();
    expect(onOrderChange).not.toHaveBeenCalled();

    dispatchMouse(window, 'mouseup', { clientX: 202, clientY: 50 });

    expect(onOrderChange).toHaveBeenCalledWith(['design', 'brief']);
    expect(onDateChange).not.toHaveBeenCalled();
  });

  it('previews resizes during drag and does not allow an end date before the start date', () => {
    const onDateChange = vi.fn();
    new VanillaGantt(host, [
      {
        id: 'brief',
        name: 'Brief',
        start: '2026-05-07',
        end: '2026-05-09',
        progress: 50,
      },
      {
        id: 'design',
        name: 'Design',
        start: '2026-05-10',
        end: '2026-05-12',
        progress: 0,
        dependencies: 'brief',
      },
    ], { view_mode: 'Day', on_date_change: onDateChange });

    const rightHandle = host.querySelector('[data-id="brief"] .handle.right');
    const wrapper = host.querySelector('[data-id="brief"]');
    const dependency = host.querySelector('[data-from="brief"][data-to="design"]');
    dispatchMouse(rightHandle, 'mousedown', { clientX: 200, clientY: 70 });
    dispatchMouse(window, 'mousemove', { clientX: 80, clientY: 70 });

    expect(wrapper.style.width).toBe('10px');
    expect(dependency.querySelector('.dependency-path').getAttribute('d')).toContain('M 90 84');
    expect(dependency.querySelector('.dependency-path').getAttribute('d')).toContain('H 200');
    expect(dependency.querySelector('.dependency-path').getAttribute('d')).toContain('128');
    expect(onDateChange).not.toHaveBeenCalled();

    dispatchMouse(window, 'mouseup', { clientX: 80, clientY: 70 });

    expect(onDateChange.mock.calls[0][1]).toEqual(new Date(2026, 4, 7));
    expect(onDateChange.mock.calls[0][2]).toEqual(new Date(2026, 4, 7));
  });

  it('reports progress changes from the progress handle', () => {
    const onProgressChange = vi.fn();
    new VanillaGantt(host, [
      {
        id: 'brief',
        name: 'Brief',
        start: '2026-05-07',
        end: '2026-05-10',
        progress: 25,
      },
    ], { view_mode: 'Day', on_progress_change: onProgressChange });

    const progressHandle = host.querySelector('[data-id="brief"] .handle.progress');
    const progress = host.querySelector('[data-id="brief"] .bar-progress');
    dispatchMouse(progressHandle, 'mousedown', { clientX: 120, clientY: 70 });
    dispatchMouse(window, 'mousemove', { clientX: 200, clientY: 70 });

    expect(progress.style.width).toBe('120px');
    expect(onProgressChange).not.toHaveBeenCalled();

    dispatchMouse(window, 'mouseup', { clientX: 200, clientY: 70 });

    expect(onProgressChange).toHaveBeenCalledWith(expect.objectContaining({ id: 'brief' }), 75);
  });

  it('preserves scroll position when tasks refresh', () => {
    const gantt = new VanillaGantt(host, [
      { id: 'brief', name: 'Brief', start: '2026-05-07', end: '2026-05-09', progress: 50 },
    ], { view_mode: 'Day' });
    gantt.$container.scrollLeft = 120;

    gantt.setup_tasks([
      { id: 'brief', name: 'Brief', start: '2026-05-08', end: '2026-05-10', progress: 50 },
    ]);

    expect(gantt.$container.scrollLeft).toBe(120);
  });
});
