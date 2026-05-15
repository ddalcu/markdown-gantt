import './style.css';
import './vanilla-gantt.css';
import { VanillaGantt } from './vanilla/gantt.js';
import {
  appendMarkdownSubtask,
  appendMarkdownTask,
  appendMarkdownTaskAfter,
  buildGanttTasks,
  collectTaskLaneOptions,
  defaultMarkdown,
  ensureTaskLaneColumn,
  parseProject,
  removeMarkdownTask,
  reorderTaskRows,
  updateSubtaskById,
  updateTaskById,
} from './vanilla/markdown-project.js';
import {
  bootstrapProjects,
  deriveProjectLabel,
  loadProjectSource,
  nextProjectId,
  removeProjectStorage,
  saveActiveProjectId,
  saveProjectIds,
  saveProjectSource,
} from './vanilla/projects.js';
import { formatDate } from './vanilla/timeline.js';

const PANEL_STORAGE_KEY = 'markdown-gantt:active-panel';
const VIEW_MODE_STORAGE_KEY = 'markdown-gantt:view-mode';
const ASSIGNEE_STYLE_ID = 'vanilla-assignee-chart-styles';
const VIEW_MODES = new Set(['Day', 'Week', 'Month', 'Year']);
const PANELS = new Set(['markdown', 'chart']);
const MODAL_LANE_OWN_ROW = '__OWN__';

document.querySelector('#app').innerHTML = `

  <nav class="tab-strip" aria-label="Projects">
    <ul id="project-tabs" class="project-tabs"></ul>
    <button id="new-project" class="new-project-button" type="button" aria-label="New project">+</button>
  </nav>

  <header class="app-header">
    <div>
      
    </div>
    <div class="toolbar">
      <div class="panel-toggle" aria-label="Choose active panel">
        <button class="tab-button active" type="button" data-panel="markdown" aria-pressed="true">
          Markdown
        </button>
        <button class="tab-button" type="button" data-panel="chart" aria-pressed="false">
          Gantt chart
        </button>
      </div>
    </div>
  </header>

  <main class="workspace">
    <section class="panel editor-panel" data-panel-content="markdown" aria-labelledby="editor-title">
      <div class="panel-heading">
        <h2 id="editor-title">Markdown</h2>
        <p id="task-count">0 tasks</p>
      </div>
      <textarea
        id="markdown-input"
        spellcheck="false"
        aria-label="Gantt markdown source"
      ></textarea>
      <div id="parse-message" class="parse-message" role="status"></div>
    </section>

    <section class="panel chart-panel" data-panel-content="chart" aria-labelledby="chart-title" hidden>
      <div class="panel-heading">
        <div>
          <h2 id="chart-title">Gantt Chart</h2>
          <p>Markdown is the source of truth. Chart rows (lanes) are set in task details.</p>
        </div>
        <div class="chart-actions">
          <label>
            View
            <select id="view-mode">
              <option>Day</option>
              <option selected>Week</option>
              <option>Month</option>
              <option>Year</option>
            </select>
          </label>
          <button id="add-task" type="button">Add task</button>
        </div>
      </div>
      <div id="gantt" class="gantt-host"></div>
    </section>
  </main>

  <footer class="app-footer">
    <button id="reset-markdown" class="link-button" type="button">Reset to sample</button>
  </footer>

  <div id="task-modal" class="modal-backdrop" hidden>
    <section class="task-modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <form id="task-form">
        <header class="modal-header">
          <div>
            <p class="eyebrow">Task details</p>
            <h2 id="modal-title">Task</h2>
          </div>
          <button class="icon-button" id="close-modal" type="button" aria-label="Close task modal">x</button>
        </header>

        <div class="modal-grid">
          <label>
            Task name
            <input id="modal-task-name" type="text" required />
          </label>
          <label>
            Assigned to
            <select id="modal-task-assignee"></select>
          </label>
          <label>
            Parent task
            <select id="modal-task-parent"></select>
          </label>
          <label class="modal-lane-field">
            Chart row (lane)
            <select id="modal-task-lane-select" aria-describedby="modal-lane-hint"></select>
            <span id="modal-lane-hint" class="field-hint">Own row keeps this task on its own chart band. Pick any other lane to share that row with those tasks.</span>
          </label>
        </div>

        <section class="subtask-section" aria-labelledby="subtasks-title">
          <div class="subtask-heading">
            <div>
              <h3 id="subtasks-title">Subtasks</h3>
              <p id="subtask-progress">No subtasks yet</p>
            </div>
            <button id="add-subtask" type="button">Add subtask</button>
          </div>
          <div id="modal-subtasks" class="subtask-list"></div>
        </section>

        <footer class="modal-actions">
          <button id="delete-task" class="danger-button" type="button" hidden>Delete task</button>
          <div class="modal-actions-trailing">
            <button id="cancel-modal" class="secondary-button" type="button">Cancel</button>
            <button type="submit">Save changes</button>
          </div>
        </footer>
      </form>
    </section>
  </div>
`;

const markdownInput = document.querySelector('#markdown-input');
const message = document.querySelector('#parse-message');
const taskCount = document.querySelector('#task-count');
const viewMode = document.querySelector('#view-mode');
const resetButton = document.querySelector('#reset-markdown');
const addTaskButton = document.querySelector('#add-task');
const ganttHost = document.querySelector('#gantt');
const tabButtons = document.querySelectorAll('.tab-button');
const panels = document.querySelectorAll('[data-panel-content]');
const taskModal = document.querySelector('#task-modal');
const taskForm = document.querySelector('#task-form');
const modalTitle = document.querySelector('#modal-title');
const modalTaskName = document.querySelector('#modal-task-name');
const modalTaskAssignee = document.querySelector('#modal-task-assignee');
const modalTaskParent = document.querySelector('#modal-task-parent');
const modalTaskLaneSelect = document.querySelector('#modal-task-lane-select');
const modalSubtasks = document.querySelector('#modal-subtasks');
const subtaskProgress = document.querySelector('#subtask-progress');
const closeModalButton = document.querySelector('#close-modal');
const cancelModalButton = document.querySelector('#cancel-modal');
const addSubtaskButton = document.querySelector('#add-subtask');
const deleteTaskButton = document.querySelector('#delete-task');
const projectTabsRoot = document.querySelector('#project-tabs');
const newProjectButton = document.querySelector('#new-project');

let gantt = null;
let lastProject = null;
let activeTaskId = null;
let renderTimer = null;
let projectIds = [];
let activeProjectId = null;

const bootstrap = bootstrapProjects(localStorage, defaultMarkdown);
projectIds = bootstrap.ids;
activeProjectId = bootstrap.activeId;
markdownInput.value = loadProjectSource(localStorage, activeProjectId) ?? defaultMarkdown;
viewMode.value = getStoredViewMode();
renderTabs();

markdownInput.addEventListener('input', () => {
  persistMarkdown();
  scheduleRender();
});
viewMode.addEventListener('change', () => {
  persistViewMode();
  renderFromMarkdown();
});
resetButton.addEventListener('click', () => {
  if (!window.confirm('Reset the markdown to the sample project? This will replace your saved local changes.')) {
    return;
  }

  markdownInput.value = defaultMarkdown;
  closeTaskModal();
  renderFromMarkdown();
});
addTaskButton.addEventListener('click', () => {
  try {
    markdownInput.value = appendMarkdownTask(markdownInput.value);
    persistMarkdown();
    refreshFromMarkdown('Task added.');
  } catch (error) {
    showError(error.message);
  }
});
tabButtons.forEach((button) => {
  button.addEventListener('click', () => setActivePanel(button.dataset.panel));
});
newProjectButton.addEventListener('click', handleNewProject);
projectTabsRoot.addEventListener('click', (event) => {
  const deleteButton = event.target.closest('.project-tab-delete');
  if (deleteButton) {
    handleDeleteProject(deleteButton.dataset.id);
    return;
  }

  const tabButton = event.target.closest('.project-tab');
  if (tabButton) {
    handleSwitchProject(tabButton.dataset.id);
  }
});
taskForm.addEventListener('submit', (event) => {
  event.preventDefault();
  saveTaskModalChanges({ close: true });
});
closeModalButton.addEventListener('click', closeTaskModal);
cancelModalButton.addEventListener('click', closeTaskModal);
deleteTaskButton.addEventListener('click', () => {
  if (!activeTaskId || !lastProject) {
    return;
  }

  const subCount = lastProject.subtasksByTask.get(activeTaskId)?.length ?? 0;

  if (subCount > 0) {
    return;
  }

  if (!window.confirm('Delete this task? This cannot be undone.')) {
    return;
  }

  try {
    markdownInput.value = removeMarkdownTask(markdownInput.value, activeTaskId);
    persistMarkdown();
    closeTaskModal();
    refreshFromMarkdown('Task deleted.');
  } catch (error) {
    showError(error.message);
  }
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !taskModal.hidden) {
    closeTaskModal();
  }
});
addSubtaskButton.addEventListener('click', () => {
  if (!activeTaskId) {
    return;
  }

  saveTaskModalChanges({ silent: true });

  try {
    markdownInput.value = appendMarkdownSubtask(markdownInput.value, activeTaskId);
    persistMarkdown();
    refreshFromMarkdown('Subtask added.');
    openTaskModal(activeTaskId);
  } catch (error) {
    showError(error.message);
  }
});
modalSubtasks.addEventListener('change', (event) => {
  if (
    event.target.classList.contains('subtask-done') ||
    event.target.classList.contains('subtask-assignee')
  ) {
    saveTaskModalChanges({ silent: true });
  }
});
modalSubtasks.addEventListener('blur', (event) => {
  if (event.target.classList.contains('subtask-name')) {
    saveTaskModalChanges({ silent: true });
  }
}, true);

renderFromMarkdown();
setActivePanel(getStoredPanel(), { persist: false, syncChart: false });

function setActivePanel(panelName, { persist = true, syncChart = true } = {}) {
  const activePanel = PANELS.has(panelName) ? panelName : 'markdown';

  tabButtons.forEach((button) => {
    const active = button.dataset.panel === activePanel;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });

  panels.forEach((panel) => {
    panel.hidden = panel.dataset.panelContent !== activePanel;
  });

  if (persist) {
    localStorage.setItem(PANEL_STORAGE_KEY, activePanel);
  }

  if (activePanel === 'chart' && syncChart) {
    renderFromMarkdown();
  }
}

function renderFromMarkdown() {
  try {
    const project = parseProject(markdownInput.value);
    const tasks = buildGanttTasks(project);
    lastProject = project;
    injectAssigneeStyles(project.assignees);
    updateTaskCount(project.tasks.length);
    refreshGantt(tasks);
    showSuccess(`Rendered ${project.tasks.length} ${project.tasks.length === 1 ? 'task' : 'tasks'}.`);
  } catch (error) {
    lastProject = null;
    updateTaskCount(0);
    showError(error.message);
  }
}

function refreshFromMarkdown(successMessage) {
  renderFromMarkdown();

  if (successMessage) {
    showSuccess(successMessage);
  }
}

function renderGantt(tasks) {
  gantt = new VanillaGantt(ganttHost, tasks, {
    view_mode: viewMode.value,
    container_height: getGanttHeight(),
    on_click: (task) => openTaskModal(task.id),
    on_date_change: (task, start, end) => {
      updateMarkdownTask(task, {
        start: formatDate(start),
        end: formatDate(end),
      }, false);
    },
    on_progress_change: (task, progress) => {
      if (taskHasSubtasks(task.id)) {
        refreshFromMarkdown('Progress for this task is driven by subtasks.');
        return;
      }

      updateMarkdownTask(task, { progress: String(Math.round(progress)) });
    },
    on_order_change: (orderedIds) => {
      updateMarkdownTaskOrder(orderedIds);
    },
    on_add_sibling_task: (task) => {
      addSiblingTaskFromChart(task);
    },
  });
}

function refreshGantt(tasks) {
  if (!gantt) {
    renderGantt(tasks);
    return;
  }

  const scrollLeft = gantt.$container.scrollLeft;
  const scrollTop = gantt.$container.scrollTop;
  gantt.options.container_height = getGanttHeight();
  gantt.$container.style.setProperty('--gv-grid-height', `${getGanttHeight()}px`);
  gantt.setup_tasks(tasks);
  gantt.change_view_mode(viewMode.value, true);
  gantt.$container.scrollLeft = scrollLeft;
  gantt.$container.scrollTop = scrollTop;
}

function addSiblingTaskFromChart(anchorTask) {
  try {
    const lane = String(anchorTask.lane ?? '').trim() || anchorTask.id;
    const { markdown, newTaskId } = appendMarkdownTaskAfter(markdownInput.value, anchorTask.id, lane);
    markdownInput.value = markdown;
    persistMarkdown();
    refreshFromMarkdown('Task added.');
    openTaskModal(newTaskId);
  } catch (error) {
    showError(error.message);
  }
}

function openTaskModal(taskId) {
  if (!lastProject) {
    return;
  }

  const task = lastProject.tasks.find((candidate) => candidate.id === taskId);

  if (!task) {
    return;
  }

  activeTaskId = taskId;
  modalTitle.textContent = task.name;
  modalTaskName.value = task.name;
  let projectForLanes = lastProject;
  try {
    projectForLanes = parseProject(markdownInput.value);
  } catch {
    // keep lastProject when markdown is temporarily invalid
  }
  renderModalLaneSelect(task.id, collectTaskLaneOptions(projectForLanes), task.lane ?? task.id);
  renderAssigneeOptions(lastProject.assignees, task.assignee);
  renderParentOptions(lastProject.tasks, task);
  renderModalSubtasks(lastProject, task);
  const subtaskCount = lastProject.subtasksByTask.get(task.id)?.length ?? 0;
  deleteTaskButton.hidden = subtaskCount > 0;
  taskModal.hidden = false;
  modalTaskName.focus();
}

function closeTaskModal() {
  activeTaskId = null;
  taskModal.hidden = true;
}

function renderModalSubtasks(project, task) {
  const subtasks = project.subtasksByTask.get(task.id) ?? [];
  const completed = subtasks.filter((subtask) => subtask.done).length;
  subtaskProgress.textContent = subtasks.length === 0
    ? 'No subtasks yet'
    : `${completed} of ${subtasks.length} complete`;

  if (subtasks.length === 0) {
    modalSubtasks.innerHTML = '<p class="empty-state">Add subtasks to track progress.</p>';
    return;
  }

  modalSubtasks.innerHTML = subtasks.map((subtask) => `
    <div class="subtask-row" data-subtask-id="${escapeAttribute(subtask.id)}">
      <label class="check-label">
        <input class="subtask-done" type="checkbox" ${subtask.done ? 'checked' : ''} />
        Done
      </label>
      <label>
        Name
        <input class="subtask-name" type="text" value="${escapeAttribute(subtask.name)}" />
      </label>
      <label>
        Assigned to
        <select class="subtask-assignee">
          ${renderAssigneeOptionMarkup(project.assignees, subtask.assignee)}
        </select>
      </label>
    </div>
  `).join('');
}

function renderAssigneeOptions(assignees, selectedAssignee) {
  modalTaskAssignee.innerHTML = renderAssigneeOptionMarkup(assignees, selectedAssignee);
}

function renderModalLaneSelect(taskId, lanes, currentLane) {
  const laneSet = new Set(lanes);
  laneSet.add(currentLane);
  const sorted = [...laneSet].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  const rest = sorted.filter((lane) => lane !== taskId);
  const ownRowSelected = currentLane === taskId;

  const options = [
    `<option value="${MODAL_LANE_OWN_ROW}" ${ownRowSelected ? 'selected' : ''}>Own row (${escapeHtml(taskId)})</option>`,
    ...rest.map((lane) => `
      <option value="${escapeAttribute(lane)}" ${!ownRowSelected && lane === currentLane ? 'selected' : ''}>
        ${escapeHtml(lane)}
      </option>
    `),
  ];

  modalTaskLaneSelect.innerHTML = options.join('');
}

function renderParentOptions(tasks, task) {
  const dependencies = splitDependencies(task.dependencies);
  const options = ['<option value="">No parent</option>'];

  if (dependencies.length > 1) {
    options.push(`
      <option value="${escapeAttribute(task.dependencies)}" selected>
        Keep current parents (${escapeHtml(dependencies.join(', '))})
      </option>
    `);
  }

  for (const candidate of tasks) {
    if (candidate.id === task.id) {
      continue;
    }

    const selected = dependencies.length === 1 && dependencies[0] === candidate.id;
    options.push(`
      <option value="${escapeAttribute(candidate.id)}" ${selected ? 'selected' : ''}>
        ${escapeHtml(candidate.name)}
      </option>
    `);
  }

  modalTaskParent.innerHTML = options.join('');
}

function renderAssigneeOptionMarkup(assignees, selectedAssignee) {
  const options = ['<option value="">Unassigned</option>'];

  for (const assignee of assignees) {
    options.push(`
      <option value="${escapeAttribute(assignee.name)}" ${assignee.name === selectedAssignee ? 'selected' : ''}>
        ${escapeHtml(assignee.name)}
      </option>
    `);
  }

  return options.join('');
}

function saveTaskModalChanges({ close = false, silent = false } = {}) {
  if (!activeTaskId) {
    return;
  }

  try {
    let markdown = ensureTaskLaneColumn(markdownInput.value);
    markdown = updateTaskById(markdown, activeTaskId, {
      name: modalTaskName.value.trim() || 'Untitled task',
      assignee: modalTaskAssignee.value,
      dependencies: modalTaskParent.value,
      lane: modalTaskLaneSelect.value === MODAL_LANE_OWN_ROW
        ? activeTaskId
        : modalTaskLaneSelect.value || activeTaskId,
    });

    modalSubtasks.querySelectorAll('.subtask-row').forEach((row) => {
      markdown = updateSubtaskById(markdown, row.dataset.subtaskId, {
        name: row.querySelector('.subtask-name').value.trim() || 'Untitled subtask',
        done: row.querySelector('.subtask-done').checked ? 'true' : 'false',
        assignee: row.querySelector('.subtask-assignee').value,
      });
    });

    markdownInput.value = markdown;
    persistMarkdown();
    refreshFromMarkdown(silent ? null : 'Task updated.');

    if (close) {
      closeTaskModal();
    } else if (!taskModal.hidden) {
      openTaskModal(activeTaskId);
    }
  } catch (error) {
    showError(error.message);
  }
}

function updateMarkdownTask(task, updates, refresh = true) {
  try {
    markdownInput.value = updateTaskById(markdownInput.value, task.id, updates, task._markdownRowIndex);
    persistMarkdown();

    if (refresh) {
      refreshFromMarkdown('Markdown updated from chart edit.');
    } else {
      showSuccess('Markdown updated from chart edit.');
    }
  } catch (error) {
    showError(error.message);
  }
}

function updateMarkdownTaskOrder(orderedIds) {
  try {
    markdownInput.value = reorderTaskRows(markdownInput.value, orderedIds);
    persistMarkdown();
    refreshFromMarkdown('Task order updated.');
  } catch (error) {
    showError(error.message);
  }
}

function taskHasSubtasks(taskId) {
  return (lastProject?.subtasksByTask.get(taskId)?.length ?? 0) > 0;
}

function updateTaskCount(count) {
  taskCount.textContent = `${count} ${count === 1 ? 'task' : 'tasks'}`;
}

function getGanttHeight() {
  return Math.max(240, Math.floor(ganttHost.clientHeight || 360));
}

function scheduleRender() {
  window.clearTimeout(renderTimer);
  renderTimer = window.setTimeout(renderFromMarkdown, 150);
}

function getStoredPanel() {
  const stored = localStorage.getItem(PANEL_STORAGE_KEY);
  return PANELS.has(stored) ? stored : 'markdown';
}

function getStoredViewMode() {
  const stored = localStorage.getItem(VIEW_MODE_STORAGE_KEY);
  return VIEW_MODES.has(stored) ? stored : 'Week';
}

function persistViewMode() {
  localStorage.setItem(VIEW_MODE_STORAGE_KEY, viewMode.value);
}

function persistMarkdown() {
  if (!activeProjectId) {
    return;
  }
  saveProjectSource(localStorage, activeProjectId, markdownInput.value);
  renderTabs();
}

function renderTabs() {
  if (!projectTabsRoot) {
    return;
  }

  projectTabsRoot.innerHTML = projectIds.map((id, index) => {
    const source = id === activeProjectId
      ? markdownInput.value
      : (loadProjectSource(localStorage, id) ?? '');
    const label = deriveProjectLabel(source, index + 1);
    const active = id === activeProjectId;
    return `
      <li class="project-tab-item${active ? ' active' : ''}">
        <button
          class="project-tab"
          type="button"
          data-id="${escapeAttribute(id)}"
          ${active ? 'aria-current="page"' : ''}
        >${escapeHtml(label)}</button>
        <button
          class="project-tab-delete"
          type="button"
          data-id="${escapeAttribute(id)}"
          aria-label="Delete project ${escapeAttribute(label)}"
          title="Delete project"
        >x</button>
      </li>
    `;
  }).join('');
}

function handleNewProject() {
  if (activeProjectId) {
    saveProjectSource(localStorage, activeProjectId, markdownInput.value);
  }

  const newId = nextProjectId(projectIds);
  projectIds = [...projectIds, newId];
  saveProjectIds(localStorage, projectIds);
  saveProjectSource(localStorage, newId, defaultMarkdown);
  switchToProject(newId);
}

function handleSwitchProject(id) {
  if (!id || id === activeProjectId || !projectIds.includes(id)) {
    return;
  }

  if (activeProjectId) {
    saveProjectSource(localStorage, activeProjectId, markdownInput.value);
  }

  switchToProject(id);
}

function handleDeleteProject(id) {
  if (!id || !projectIds.includes(id)) {
    return;
  }

  if (!window.confirm('Delete this project? Its markdown will be lost. This cannot be undone.')) {
    return;
  }

  const removedIndex = projectIds.indexOf(id);
  projectIds = projectIds.filter((candidate) => candidate !== id);
  removeProjectStorage(localStorage, id);
  saveProjectIds(localStorage, projectIds);

  if (projectIds.length === 0) {
    const fresh = bootstrapProjects(localStorage, defaultMarkdown);
    projectIds = fresh.ids;
    switchToProject(fresh.activeId);
    return;
  }

  if (id === activeProjectId) {
    const nextIndex = Math.max(0, removedIndex - 1);
    switchToProject(projectIds[nextIndex]);
  } else {
    renderTabs();
  }
}

function switchToProject(id) {
  activeProjectId = id;
  saveActiveProjectId(localStorage, id);
  markdownInput.value = loadProjectSource(localStorage, id) ?? defaultMarkdown;
  closeTaskModal();
  renderFromMarkdown();
  renderTabs();
}

function showSuccess(text) {
  message.textContent = text;
  message.className = 'parse-message success';
}

function showError(text) {
  message.textContent = text;
  message.className = 'parse-message error';
}

function injectAssigneeStyles(assignees) {
  let style = document.querySelector(`#${ASSIGNEE_STYLE_ID}`);

  if (!style) {
    style = document.createElement('style');
    style.id = ASSIGNEE_STYLE_ID;
    document.head.append(style);
  }

  style.textContent = assignees.map((assignee) => {
    const progressColor = mixColors(assignee.color, '#172033', 0.22);
    const trackColor = hexToRgb(assignee.color);
    const trackBackground = trackColor
      ? `rgb(${trackColor.r} ${trackColor.g} ${trackColor.b} / 0.5)`
      : 'rgb(174 188 244 / 0.55)';
    return `
      .bar-wrapper.${assignee.className} .bar { background: ${trackBackground}; }
      .bar-wrapper.${assignee.className} .bar-progress { background: ${progressColor}; }
    `;
  }).join('\n');
}

function mixColors(color, mixWith, weight) {
  const a = hexToRgb(color);
  const b = hexToRgb(mixWith);

  if (!a || !b) {
    return color;
  }

  return rgbToHex({
    r: Math.round(a.r * (1 - weight) + b.r * weight),
    g: Math.round(a.g * (1 - weight) + b.g * weight),
    b: Math.round(a.b * (1 - weight) + b.b * weight),
  });
}

function hexToRgb(color) {
  const normalized = color.replace('#', '');

  if (!/^[0-9a-f]{6}$/i.test(normalized)) {
    return null;
  }

  return {
    r: Number.parseInt(normalized.slice(0, 2), 16),
    g: Number.parseInt(normalized.slice(2, 4), 16),
    b: Number.parseInt(normalized.slice(4, 6), 16),
  };
}

function rgbToHex({ r, g, b }) {
  return `#${[r, g, b].map((value) => value.toString(16).padStart(2, '0')).join('')}`;
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

function splitDependencies(value) {
  return String(value ?? '')
    .split(',')
    .map((dependency) => dependency.trim())
    .filter(Boolean);
}
