import { layoutTasks, splitDependencies } from './layout.js';
import {
  addDays,
  buildCalendarRows,
  formatDate,
  getViewConfig,
  inclusiveDays,
  parseDateOnly,
  pixelsToDays,
} from './timeline.js';

const PLUS_SIBLING_ICON_SRC = `${import.meta.env.BASE_URL}plus-sibling.png`;

export class VanillaGantt {
  constructor(host, tasks, options = {}) {
    this.host = host;
    this.options = options;
    this.tasks = normalizeTasks(tasks);
    this.viewMode = options.view_mode ?? 'Week';
    this.config = toFrappeLikeConfig(getViewConfig(this.viewMode));
    this.bars = [];
    this.drag = null;

    this.$container = document.createElement('div');
    this.$container.className = 'gantt-container vanilla-gantt-container';
    this.$container.style.setProperty('--gv-grid-height', `${options.container_height ?? 320}px`);
    this.$container.addEventListener('mousedown', (event) => this.handlePointerStart(event));
    this.$container.addEventListener('click', (event) => this.handleClick(event));

    host.replaceChildren(this.$container);
    this.attachWindowListeners();
    this.render();
  }

  setupTasks(tasks) {
    this.setup_tasks(tasks);
  }

  setup_tasks(tasks) {
    const scrollLeft = this.$container.scrollLeft;
    const scrollTop = this.$container.scrollTop;
    this.tasks = normalizeTasks(tasks);
    this.render();
    this.$container.scrollLeft = scrollLeft;
    this.$container.scrollTop = scrollTop;
  }

  changeViewMode(viewMode) {
    this.change_view_mode(viewMode);
  }

  change_view_mode(viewMode) {
    this.viewMode = viewMode;
    this.options.view_mode = viewMode;
    this.config = toFrappeLikeConfig(getViewConfig(viewMode));
    this.render();
  }

  render() {
    const layout = layoutTasks(this.tasks, this.viewMode);
    this.layout = layout;
    this.config = toFrappeLikeConfig(layout.config);
    this.bars = layout.bars.map((bar) => ({
      task: bar.task,
      layout: bar,
      $bar: {
        getX: () => bar.x,
        getWidth: () => bar.width,
      },
    }));

    const contentWidth = Math.max(
      640,
      ...layout.bars.map((bar) => bar.x + bar.width + 240),
    );

    this.$container.innerHTML = `
      <div class="gantt vanilla-gantt" style="width: ${contentWidth}px; height: ${layout.height}px;">
        ${renderCalendarHeader(layout)}
        <div class="gantt-grid" aria-hidden="true">${renderGrid(layout, contentWidth)}</div>
        <div class="dependency-layer" aria-hidden="true">${renderDependencies(layout.dependencies)}</div>
        <div class="bar-layer">${layout.bars.map(renderBar).join('')}</div>
      </div>
    `;
  }

  handlePointerStart(event) {
    if (event.target.closest?.('.bar-add-sibling')) {
      return;
    }

    const handle = event.target.closest?.('.handle');
    const wrapper = event.target.closest?.('.bar-wrapper');

    if (!wrapper) {
      return;
    }

    event.preventDefault();

    const task = this.tasks.find((candidate) => candidate.id === wrapper.dataset.id);
    const bar = this.layout?.bars.find((candidate) => candidate.id === wrapper.dataset.id);

    if (!task || !bar) {
      return;
    }

    this.drag = {
      taskId: task.id,
      mode: getDragMode(handle),
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
      sortActive: false,
      sortedOrderIds: this.tasks.map((candidate) => candidate.id),
      originalTasks: [...this.tasks],
      originalIndex: this.tasks.findIndex((candidate) => candidate.id === task.id),
      originalTask: { ...task },
      originalBar: { ...bar },
      originalBars: new Map(this.layout.bars.map((candidate) => [candidate.id, { ...candidate }])),
      dependentIds: this.getTransitiveDependents(task.id).map((dependent) => dependent.id),
      sortStepPx: this.layout?.sortStepPx ?? 44,
    };

    if (this.drag.mode !== 'progress') {
      this.setActiveDependencyLines(this.getDragDependencyIds(this.drag));
    }
  }

  handlePointerMove(event) {
    if (!this.drag) {
      return;
    }

    if (Math.hypot(event.clientX - this.drag.startX, event.clientY - this.drag.startY) > 2) {
      this.drag.moved = true;
      this.previewDrag(event.clientX - this.drag.startX, event.clientY - this.drag.startY);
    }
  }

  handlePointerEnd(event) {
    if (!this.drag) {
      return;
    }

    const drag = this.drag;
    this.drag = null;

    if (!drag.moved) {
      this.clearActiveDependencyLines();
      return;
    }

    const deltaX = event.clientX - drag.startX;
    const deltaY = event.clientY - drag.startY;

    if (drag.sortActive) {
      this.commitSortDrag(drag);
      return;
    }

    if (drag.mode === 'progress') {
      this.commitProgressDrag(drag, deltaX);
      return;
    }

    this.commitDateDrag(drag, deltaX);
  }

  previewDrag(deltaX, deltaY = 0) {
    const drag = this.drag;

    if (!drag) {
      return;
    }

    if (drag.mode === 'progress') {
      const progress = getPreviewProgress(drag, deltaX);
      const wrapper = this.getBarElement(drag.taskId);
      const progressElement = wrapper?.querySelector('.bar-progress');

      if (wrapper && progressElement) {
        wrapper.style.setProperty('--progress-x', `${progress}%`);
        progressElement.style.width = `${Math.round((drag.originalBar.width * progress) / 100)}px`;
      }
      return;
    }

    if (drag.mode === 'move') {
      if (shouldSortVertically(drag, deltaX, deltaY)) {
        this.previewSortDrag(drag, deltaY);
        return;
      }

      for (const taskId of [drag.taskId, ...drag.dependentIds]) {
        const originalBar = drag.originalBars.get(taskId);
        const wrapper = this.getBarElement(taskId);

        if (originalBar && wrapper) {
          wrapper.style.left = `${Math.round(originalBar.x + deltaX)}px`;
        }
      }
      this.previewDependencyLines();
      return;
    }

    const wrapper = this.getBarElement(drag.taskId);

    if (!wrapper) {
      return;
    }

    if (drag.mode === 'resize-start') {
      const rightEdge = drag.originalBar.x + drag.originalBar.width;
      const left = Math.min(rightEdge - 10, drag.originalBar.x + deltaX);
      wrapper.style.left = `${Math.round(left)}px`;
      wrapper.style.width = `${Math.round(rightEdge - left)}px`;
      this.previewDependencyLines();
      return;
    }

    if (drag.mode === 'resize-end') {
      wrapper.style.width = `${Math.round(Math.max(10, drag.originalBar.width + deltaX))}px`;
      this.previewDependencyLines();
    }
  }

  previewSortDrag(drag, deltaY) {
    const targetIndex = getSortTargetIndex(drag, deltaY, this.tasks.length);
    const sortedTasks = moveItem(drag.originalTasks, drag.originalIndex, targetIndex);
    const sortedOrderIds = sortedTasks.map((task) => task.id);

    if (arraysEqual(sortedOrderIds, drag.sortedOrderIds)) {
      return;
    }

    drag.sortActive = true;
    drag.sortedOrderIds = sortedOrderIds;
    this.tasks = sortedTasks;
    this.render();
    const wrapper = this.getBarElement(drag.taskId);
    wrapper?.classList.add('is-sorting');
    this.setActiveDependencyLines(this.getDragDependencyIds(drag));
  }

  handleClick(event) {
    if (event.target.closest?.('.bar-add-sibling')) {
      const wrapper = event.target.closest?.('.bar-wrapper');
      const task = this.tasks.find((candidate) => candidate.id === wrapper?.dataset?.id);

      if (task) {
        this.options.on_add_sibling_task?.(task);
      }

      return;
    }

    const wrapper = event.target.closest?.('.bar-wrapper');

    if (!wrapper || event.target.closest?.('.handle')) {
      return;
    }

    const task = this.tasks.find((candidate) => candidate.id === wrapper.dataset.id);

    if (task) {
      this.options.on_click?.(task);
    }
  }

  commitProgressDrag(drag, deltaX) {
    const progress = getPreviewProgress(drag, deltaX);
    const task = this.tasks.find((candidate) => candidate.id === drag.taskId);

    if (!task) {
      return;
    }

    task.progress = progress;
    this.options.on_progress_change?.(task, progress);
    this.render();
  }

  commitDateDrag(drag, deltaX) {
    const deltaDays = pixelsToDays(deltaX, getViewConfig(this.viewMode));

    if (deltaDays === 0) {
      this.render();
      return;
    }

    const changed = [];
    const task = this.tasks.find((candidate) => candidate.id === drag.taskId);

    if (!task) {
      return;
    }

    const durationDays = inclusiveDays(drag.originalTask.start, drag.originalTask.end) - 1;
    let nextStart = parseDateOnly(drag.originalTask.start);
    let nextEnd = parseDateOnly(drag.originalTask.end);

    if (drag.mode === 'resize-start') {
      nextStart = addDays(nextStart, deltaDays);
      if (nextStart > nextEnd) {
        nextStart = new Date(nextEnd);
      }
    } else if (drag.mode === 'resize-end') {
      nextEnd = addDays(nextEnd, deltaDays);
      if (nextEnd < nextStart) {
        nextEnd = new Date(nextStart);
      }
    } else {
      nextStart = addDays(nextStart, deltaDays);
      nextEnd = addDays(nextStart, durationDays);
    }

    changed.push(applyTaskDates(task, nextStart, nextEnd));

    if (drag.mode === 'move') {
      for (const dependent of this.getTransitiveDependents(task.id)) {
        const start = addDays(parseDateOnly(dependent.start), deltaDays);
        const end = addDays(parseDateOnly(dependent.end), deltaDays);
        changed.push(applyTaskDates(dependent, start, end));
      }
    }

    for (const change of changed) {
      this.options.on_date_change?.(change.task, change.startDate, change.endDate);
    }

    this.render();
  }

  commitSortDrag(drag) {
    this.tasks = sortTasksByIds(drag.originalTasks, drag.sortedOrderIds);
    this.options.on_order_change?.(drag.sortedOrderIds);
    this.render();
  }

  getTransitiveDependents(taskId) {
    const result = [];
    const seen = new Set([taskId]);
    const queue = [taskId];

    while (queue.length > 0) {
      const current = queue.shift();

      for (const task of this.tasks) {
        if (seen.has(task.id) || !splitDependencies(task.dependencies).includes(current)) {
          continue;
        }

        seen.add(task.id);
        result.push(task);
        queue.push(task.id);
      }
    }

    return result;
  }

  getBarElement(taskId) {
    return [...this.$container.querySelectorAll('.bar-wrapper')]
      .find((element) => element.dataset.id === taskId) ?? null;
  }

  previewDependencyLines() {
    this.$container.querySelectorAll('.dependency-line').forEach((line) => {
      const from = this.getBarElement(line.dataset.from);
      const to = this.getBarElement(line.dataset.to);

      if (!from || !to) {
        return;
      }

      setDependencyPath(line, getDependencyLinePoints(from, to));
    });
  }

  getDragDependencyIds(drag) {
    const ids = new Set([drag.taskId, ...drag.dependentIds]);
    const tasks = drag.originalTasks ?? this.tasks;

    for (const task of tasks) {
      if (!ids.has(task.id)) {
        continue;
      }

      for (const subtask of task.subtasks ?? []) {
        ids.add(subtask.id);
      }
    }

    return ids;
  }

  setActiveDependencyLines(activeIds) {
    this.$container.querySelectorAll('.dependency-line').forEach((line) => {
      line.classList.toggle('is-active', activeIds.has(line.dataset.from) || activeIds.has(line.dataset.to));
    });
  }

  clearActiveDependencyLines() {
    this.$container.querySelectorAll('.dependency-line.is-active').forEach((line) => {
      line.classList.remove('is-active');
    });
  }

  attachWindowListeners() {
    this.handleWindowMove = (event) => this.handlePointerMove(event);
    this.handleWindowUp = (event) => this.handlePointerEnd(event);
    window.addEventListener('mousemove', this.handleWindowMove);
    window.addEventListener('mouseup', this.handleWindowUp);
  }

  destroy() {
    window.removeEventListener('mousemove', this.handleWindowMove);
    window.removeEventListener('mouseup', this.handleWindowUp);
  }
}

function normalizeTasks(tasks) {
  return tasks.map((task) => ({
    ...task,
    lane: String(task.lane ?? '').trim() || task.id,
    progress: Number(task.progress) || 0,
    _start: parseDateOnly(task.start),
    _end: addDays(parseDateOnly(task.end), 1),
  }));
}

function applyTaskDates(task, startDate, endDate) {
  task.start = formatDate(startDate);
  task.end = formatDate(endDate);
  task._start = parseDateOnly(task.start);
  task._end = addDays(parseDateOnly(task.end), 1);

  return { task, startDate, endDate };
}

function getDragMode(handle) {
  if (handle?.classList.contains('left')) {
    return 'resize-start';
  }

  if (handle?.classList.contains('right')) {
    return 'resize-end';
  }

  if (handle?.classList.contains('progress')) {
    return 'progress';
  }

  return 'move';
}

function renderGrid(layout, contentWidth) {
  const lines = [];
  const stepWidth = layout.config.columnWidth;
  const columns = Math.ceil(contentWidth / stepWidth);

  for (let index = 0; index <= columns; index += 1) {
    const x = index * stepWidth;
    lines.push(`<div class="gantt-grid-line" style="left: ${x}px;"></div>`);
  }

  return lines.join('');
}

function renderCalendarHeader(layout) {
  const [majorTicks, minorTicks] = buildCalendarRows(layout.range, layout.config.viewMode);

  return `
    <div class="calendar-header" aria-hidden="true">
      <div class="calendar-row calendar-row-major">
        ${majorTicks.map(renderCalendarTick).join('')}
      </div>
      <div class="calendar-row calendar-row-minor">
        ${minorTicks.map(renderCalendarTick).join('')}
      </div>
    </div>
  `;
}

function renderCalendarTick(tick) {
  return `
    <span class="calendar-tick" style="left: ${tick.x}px; width: ${tick.width}px;">
      ${escapeHtml(tick.label)}
    </span>
  `;
}

function renderDependencies(dependencies) {
  return dependencies.map((dependency) => {
    return `
      <div
        class="dependency-line"
        data-from="${escapeAttribute(dependency.from)}"
        data-to="${escapeAttribute(dependency.to)}"
      >
        ${renderDependencyPath(dependency.points)}
      </div>
    `;
  }).join('');
}

function renderDependencyPath(points) {
  return `
    <svg class="dependency-svg" aria-hidden="true">
      <path
        class="dependency-path"
        d="${getDependencyPath(points)}"
        fill="none"
        stroke-linecap="round"
        stroke-linejoin="round"
      ></path>
    </svg>
  `;
}

function renderBar(bar) {
  const classes = [
    'bar-wrapper',
    bar.customClass,
    bar.hasSubtasks ? 'has-subtasks' : '',
  ].filter(Boolean).join(' ');

  return `
    <div
      class="${classes}"
      data-id="${escapeAttribute(bar.id)}"
      style="left: ${bar.x}px; top: ${bar.y}px; width: ${bar.width}px; height: ${bar.height}px; --progress-x: ${bar.progress}%;"
    >
      <div class="bar">
        <div class="bar-progress" style="width: ${bar.progressWidth}px;"></div>
        <span class="bar-label">${escapeHtml(bar.task.name)}</span>
        ${renderSubtasks(bar.subtasks)}
      </div>
      <button class="handle left" type="button" aria-label="Resize ${escapeAttribute(bar.task.name)} start"></button>
      <button class="handle right" type="button" aria-label="Resize ${escapeAttribute(bar.task.name)} end"></button>
      <button class="handle progress" type="button" aria-label="Change ${escapeAttribute(bar.task.name)} progress"></button>
      <button class="bar-add-sibling" type="button" aria-label="Add task in same chart row">
        <img class="bar-add-sibling-icon" src="${escapeAttribute(PLUS_SIBLING_ICON_SRC)}" alt="" width="12" height="12" />
      </button>
    </div>
  `;
}

function renderSubtasks(subtasks = []) {
  if (subtasks.length === 0) {
    return '';
  }

  return `
    <span class="bar-subtasks">
      ${subtasks.map((subtask) => `
        <span class="bar-subtask" data-subtask-id="${escapeAttribute(subtask.id)}">
          ${subtask.done ? '[x]' : '[ ]'} ${escapeHtml(subtask.name)}
        </span>
      `).join('')}
    </span>
  `;
}

function toFrappeLikeConfig(config) {
  return {
    column_width: config.columnWidth,
    step: config.stepDays,
    unit: config.unit,
  };
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function getPreviewProgress(drag, deltaX) {
  const width = Math.max(1, drag.originalBar.width);
  const deltaProgress = Math.round((deltaX / width) * 100);
  return clamp((Number(drag.originalTask.progress) || 0) + deltaProgress, 0, 100);
}

function shouldSortVertically(drag, deltaX, deltaY) {
  return drag.sortActive || Math.abs(deltaY) > 18 && Math.abs(deltaY) > Math.abs(deltaX) * 1.25;
}

function getSortTargetIndex(drag, deltaY, taskCount) {
  const step = drag.sortStepPx ?? 44;
  const deltaRows = Math.round(deltaY / step);
  return clamp(drag.originalIndex + deltaRows, 0, taskCount - 1);
}

function moveItem(items, fromIndex, toIndex) {
  const next = [...items];
  const [item] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, item);
  return next;
}

function sortTasksByIds(tasks, orderedIds) {
  const byId = new Map(tasks.map((task) => [task.id, task]));
  return orderedIds.map((id) => byId.get(id)).filter(Boolean);
}

function arraysEqual(first, second) {
  return first.length === second.length && first.every((value, index) => value === second[index]);
}

function getDependencyLinePoints(from, to) {
  const startX = getNumericStyle(from, 'left') + getNumericStyle(from, 'width');
  const startY = getNumericStyle(from, 'top') + getNumericStyle(from, 'height') / 2;
  const endX = getNumericStyle(to, 'left');
  const endY = getNumericStyle(to, 'top') + getNumericStyle(to, 'height') / 2;

  return { startX, startY, endX, endY };
}

function setDependencyPath(line, points) {
  line.querySelector('.dependency-path')?.setAttribute('d', getDependencyPath(points));
}

function getDependencyPath({ startX, startY, endX, endY }) {
  const elbowX = getDependencyElbowX(startX, endX);
  const verticalSign = endY >= startY ? 1 : -1;
  const firstHorizontalSign = elbowX >= startX ? 1 : -1;
  const secondHorizontalSign = endX >= elbowX ? 1 : -1;
  const radius = getDependencyBendRadius(startX, startY, elbowX, endY, endX);
  const firstCornerX = elbowX - firstHorizontalSign * radius;
  const firstCornerY = startY + verticalSign * radius;
  const secondCornerY = endY - verticalSign * radius;
  const secondCornerX = elbowX + secondHorizontalSign * radius;

  if (radius === 0) {
    return `M ${Math.round(startX)} ${Math.round(startY)} H ${Math.round(elbowX)} V ${Math.round(endY)} H ${Math.round(endX)}`;
  }

  return [
    `M ${Math.round(startX)} ${Math.round(startY)}`,
    `H ${Math.round(firstCornerX)}`,
    `Q ${Math.round(elbowX)} ${Math.round(startY)} ${Math.round(elbowX)} ${Math.round(firstCornerY)}`,
    `V ${Math.round(secondCornerY)}`,
    `Q ${Math.round(elbowX)} ${Math.round(endY)} ${Math.round(secondCornerX)} ${Math.round(endY)}`,
    `H ${Math.round(endX)}`,
  ].join(' ');
}

function getDependencyElbowX(startX, endX) {
  if (endX >= startX) {
    return startX + Math.max(24, (endX - startX) / 2);
  }

  return startX + 24;
}

function getDependencyBendRadius(startX, startY, elbowX, endY, endX) {
  const firstHorizontal = Math.abs(elbowX - startX);
  const vertical = Math.abs(endY - startY);
  const secondHorizontal = Math.abs(endX - elbowX);
  return Math.max(0, Math.min(12, firstHorizontal / 2, vertical / 2, secondHorizontal / 2));
}

function getNumericStyle(element, property) {
  return Number.parseFloat(element.style[property]) || 0;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function escapeAttribute(value) {
  return escapeHtml(value).replaceAll('`', '&#96;');
}
