import Gantt from 'frappe-gantt';
import '../node_modules/frappe-gantt/dist/frappe-gantt.css';
import './style.css';

const STORAGE_KEY = 'markdown-gantt:source';
const ASSIGNEE_STYLE_ID = 'assignee-chart-styles';
const TASK_COLUMNS = ['id', 'name', 'start', 'end', 'progress', 'dependencies', 'assignee'];
const ASSIGNEE_COLUMNS = ['assignee', 'role', 'color'];
const SUBTASK_COLUMNS = ['id', 'task', 'name', 'done', 'assignee'];
const ASSIGNEE_PALETTE = [
  '#3154d4',
  '#b54708',
  '#087443',
  '#7a2e83',
  '#b42318',
  '#0e7490',
  '#854d0e',
  '#475467',
];

const defaultMarkdown = `# Product Launch Roadmap

Edit these markdown tables directly, or switch to the Gantt chart and click a task.
Assignees color task bars. Subtasks drive parent progress when a task has subtasks.

## Assignees

| assignee | role | color |
| --- | --- | --- |
| Maya | product | #087443 |
| Leo | ux | #b54708 |
| Aisha | dev | #3154d4 |
| Quinn | qa | #7a2e83 |
| Rowan | devops | #0e7490 |

## Tasks

| id | name | start | end | progress | dependencies | assignee |
| --- | --- | --- | --- | --- | --- | --- |
| discovery | Discovery and scope | 2026-05-07 | 2026-05-10 | 0 | | Maya |
| design | Design prototype | 2026-05-11 | 2026-05-16 | 0 | discovery | Leo |
| build | Build beta | 2026-05-17 | 2026-05-27 | 0 | design | Aisha |
| qa | QA and fixes | 2026-05-28 | 2026-06-03 | 0 | build | Quinn |
| launch | Launch prep | 2026-06-04 | 2026-06-07 | 20 | qa | Rowan |

## Subtasks

| id | task | name | done | assignee |
| --- | --- | --- | --- | --- |
| discovery-users | discovery | Interview target users | true | Maya |
| discovery-brief | discovery | Write project brief | true | Maya |
| design-flows | design | Map core flows | true | Leo |
| design-review | design | Review with product | false | Maya |
| build-api | build | API wiring | true | Aisha |
| build-ui | build | Implement UI states | false | Leo |
| build-polish | build | Interaction polish | false | Aisha |
| qa-plan | qa | Draft QA plan | true | Quinn |
| qa-regression | qa | Run regression pass | false | Quinn |
| qa-fixes | qa | Verify launch blockers | false | Aisha |
`;

document.querySelector('#app').innerHTML = `
  <header class="app-header">
    <div>
      <h1>Markdown Gantt</h1>
      <p class="intro">
        Use markdown tables for tasks, assignees, and subtasks. Click items to edit.
      </p>
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
          <p>Markdown is the source of truth</p>
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
          <button id="cancel-modal" class="secondary-button" type="button">Cancel</button>
          <button type="submit">Save changes</button>
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
const modalSubtasks = document.querySelector('#modal-subtasks');
const subtaskProgress = document.querySelector('#subtask-progress');
const closeModalButton = document.querySelector('#close-modal');
const cancelModalButton = document.querySelector('#cancel-modal');
const addSubtaskButton = document.querySelector('#add-subtask');

let gantt = null;
let lastProject = null;
let activeTaskId = null;
let lastChartEditAt = 0;
let chartPointerStart = null;
let suppressTaskClickUntil = 0;
let lastWheelHandledAt = 0;

markdownInput.value = localStorage.getItem(STORAGE_KEY) ?? defaultMarkdown;

const render = debounce(() => {
  renderFromMarkdown();
}, 150);

markdownInput.addEventListener('input', render);
viewMode.addEventListener('change', () => {
  renderFromMarkdown();
});
resetButton.addEventListener('click', () => {
  const confirmed = window.confirm(
    'Reset the markdown to the sample project? This will replace your saved local changes.',
  );

  if (!confirmed) {
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
ganttHost.addEventListener('mousedown', (event) => {
  const chartTarget = event.target.closest?.('.bar-wrapper, .handle');

  if (!chartTarget) {
    chartPointerStart = null;
    return;
  }

  chartPointerStart = {
    x: event.clientX,
    y: event.clientY,
    startedOnHandle: chartTarget.classList.contains('handle'),
    moved: false,
  };
});
ganttHost.addEventListener('mousemove', (event) => {
  if (!chartPointerStart) {
    return;
  }

  const distance = Math.hypot(
    event.clientX - chartPointerStart.x,
    event.clientY - chartPointerStart.y,
  );

  if (distance > 3) {
    chartPointerStart.moved = true;
  }
});
ganttHost.addEventListener('mouseup', () => {
  if (chartPointerStart?.moved || chartPointerStart?.startedOnHandle) {
    suppressTaskClick(700);
  }

  chartPointerStart = null;
});
ganttHost.addEventListener('wheel', handleGanttWheel, { capture: true, passive: false });
ganttHost.addEventListener('mousewheel', handleGanttWheel, { capture: true, passive: false });

tabButtons.forEach((button) => {
  button.addEventListener('click', () => setActivePanel(button.dataset.panel));
});

taskForm.addEventListener('submit', (event) => {
  event.preventDefault();
  saveTaskModalChanges({ close: true });
});
closeModalButton.addEventListener('click', closeTaskModal);
cancelModalButton.addEventListener('click', closeTaskModal);
taskModal.addEventListener('click', (event) => {
  if (event.target === taskModal) {
    closeTaskModal();
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

function setActivePanel(panelName) {
  tabButtons.forEach((button) => {
    const isActive = button.dataset.panel === panelName;
    button.classList.toggle('active', isActive);
    button.setAttribute('aria-pressed', String(isActive));
  });

  panels.forEach((panel) => {
    panel.hidden = panel.dataset.panelContent !== panelName;
  });

  if (panelName === 'chart') {
    renderFromMarkdown();
  }
}

function renderFromMarkdown() {
  persistMarkdown();

  try {
    const project = parseProject(markdownInput.value);
    lastProject = project;
    injectAssigneeStyles(project.assignees);
    renderGantt(buildGanttTasks(project));
    updateTaskCount(project.tasks.length);
    showSuccess('Chart updated.');
  } catch (error) {
    lastProject = null;
    gantt = null;
    ganttHost.replaceChildren();
    taskCount.textContent = 'No valid chart';
    showError(error.message);
  }
}

function refreshFromMarkdown(successMessage) {
  const project = parseProject(markdownInput.value);
  lastProject = project;
  injectAssigneeStyles(project.assignees);
  refreshGantt(buildGanttTasks(project));
  updateTaskCount(project.tasks.length);

  if (successMessage) {
    showSuccess(successMessage);
  }
}

function renderGantt(tasks) {
  ganttHost.replaceChildren();

  gantt = new Gantt(ganttHost, tasks, {
    view_mode: viewMode.value,
    today_button: true,
    container_height: getGanttHeight(),
    infinite_padding: false,
    popup: false,
    date_format: 'YYYY-MM-DD',
    scroll_to: tasks[0]?.start ?? 'today',
    on_click: (task) => {
      if (Date.now() < suppressTaskClickUntil || Date.now() - lastChartEditAt < 700) {
        return;
      }

      openTaskModal(task.id);
    },
    on_date_change: (task, start, end) => {
      lastChartEditAt = Date.now();
      suppressTaskClick(700);
      updateMarkdownTask(task, {
        start: formatDate(start),
        end: formatDate(end),
      });
    },
    on_progress_change: (task, progress) => {
      lastChartEditAt = Date.now();
      suppressTaskClick(700);

      if (taskHasSubtasks(task.id)) {
        refreshFromMarkdown('Progress for this task is driven by subtasks.');
        return;
      }

      updateMarkdownTask(task, {
        progress: String(Math.round(progress)),
      });
    },
  });

  syncSubtaskBarClasses(tasks);

  return gantt;
}

function refreshGantt(tasks) {
  if (!gantt) {
    renderGantt(tasks);
    return;
  }

  const scrollContainer = gantt.$container;
  const scrollLeft = scrollContainer.scrollLeft;
  const scrollTop = scrollContainer.scrollTop;
  const height = getGanttHeight();

  gantt.options.container_height = height;
  scrollContainer.style.setProperty('--gv-grid-height', `${height}px`);
  gantt.setup_tasks(tasks);
  gantt.change_view_mode(viewMode.value, true);
  syncSubtaskBarClasses(tasks);
  scrollContainer.scrollLeft = scrollLeft;
  scrollContainer.scrollTop = scrollTop;
}

function syncSubtaskBarClasses(tasks) {
  const taskIdsWithSubtasks = new Set(
    tasks.filter((task) => task.hasSubtasks).map((task) => task.id),
  );

  ganttHost.querySelectorAll('.bar-wrapper').forEach((bar) => {
    bar.classList.toggle('has-subtasks', taskIdsWithSubtasks.has(bar.dataset.id));
  });
}

function updateTaskCount(count) {
  taskCount.textContent = `${count} ${count === 1 ? 'task' : 'tasks'}`;
}

function getGanttHeight() {
  return Math.max(240, Math.floor(ganttHost.clientHeight));
}

function suppressTaskClick(duration) {
  suppressTaskClickUntil = Date.now() + duration;
}

function handleGanttWheel(event) {
  const scrollContainer = event.target.closest?.('.gantt-container');

  if (!scrollContainer) {
    return;
  }

  event.preventDefault();
  event.stopImmediatePropagation();

  if (event.type === 'mousewheel' && Date.now() - lastWheelHandledAt < 40) {
    return;
  }

  lastWheelHandledAt = Date.now();
  const previousScrollLeft = scrollContainer.scrollLeft;

  if (event.shiftKey) {
    scrollContainer.scrollLeft += getWheelDeltaY(event) || getWheelDeltaX(event);
    return;
  }

  scrollContainer.scrollTop += getWheelDeltaY(event);
  scrollContainer.scrollLeft = previousScrollLeft;
  requestAnimationFrame(() => {
    scrollContainer.scrollLeft = previousScrollLeft;
  });
}

function getWheelDeltaY(event) {
  if ('deltaY' in event) {
    return event.deltaY;
  }

  return event.wheelDelta ? -event.wheelDelta : 0;
}

function getWheelDeltaX(event) {
  if ('deltaX' in event) {
    return event.deltaX;
  }

  return event.wheelDeltaX ? -event.wheelDeltaX : 0;
}

function openTaskModal(taskId) {
  try {
    const project = parseProject(markdownInput.value);
    const task = project.tasks.find((candidate) => candidate.id === taskId);

    if (!task) {
      throw new Error(`Could not find task "${taskId}".`);
    }

    activeTaskId = taskId;
    lastProject = project;
    modalTitle.textContent = task.name;
    modalTaskName.value = task.name;
    modalTaskAssignee.innerHTML = renderAssigneeOptions(project.assignees, task.assignee);
    renderModalSubtasks(project, task);
    taskModal.hidden = false;
    modalTaskName.focus();
  } catch (error) {
    showError(error.message);
  }
}

function closeTaskModal() {
  activeTaskId = null;
  taskModal.hidden = true;
}

function renderModalSubtasks(project, task) {
  const subtasks = project.subtasksByTask.get(task.id) ?? [];
  const completeCount = subtasks.filter((subtask) => subtask.done).length;

  subtaskProgress.textContent =
    subtasks.length === 0
      ? 'No subtasks yet'
      : `${completeCount} of ${subtasks.length} complete`;

  if (subtasks.length === 0) {
    modalSubtasks.innerHTML = '<p class="empty-state">Add subtasks to drive parent progress.</p>';
    return;
  }

  modalSubtasks.innerHTML = subtasks
    .map((subtask) => `
      <div class="subtask-row" data-subtask-id="${escapeAttribute(subtask.id)}">
        <label class="check-label">
          <input class="subtask-done" type="checkbox" ${subtask.done ? 'checked' : ''} />
          Done
        </label>
        <input
          class="subtask-name"
          type="text"
          value="${escapeAttribute(subtask.name)}"
          aria-label="Subtask name"
        />
        <select class="subtask-assignee" aria-label="Subtask assignee">
          ${renderAssigneeOptions(project.assignees, subtask.assignee)}
        </select>
      </div>
    `)
    .join('');
}

function renderAssigneeOptions(assignees, selectedAssignee) {
  const names = new Set(assignees.map((assignee) => assignee.name));

  if (selectedAssignee && !names.has(selectedAssignee)) {
    assignees = [
      ...assignees,
      {
        name: selectedAssignee,
        role: '',
        color: getPaletteColor(assignees.length),
      },
    ];
  }

  return [
    `<option value="" ${selectedAssignee ? '' : 'selected'}>Unassigned</option>`,
    ...assignees.map((assignee) => {
      const label = assignee.role ? `${assignee.name} (${assignee.role})` : assignee.name;
      const selected = assignee.name === selectedAssignee ? 'selected' : '';

      return `<option value="${escapeAttribute(assignee.name)}" ${selected}>${escapeHtml(label)}</option>`;
    }),
  ].join('');
}

function saveTaskModalChanges({ close = false, silent = false } = {}) {
  if (!activeTaskId) {
    return;
  }

  try {
    let markdown = markdownInput.value;
    markdown = updateTaskById(markdown, activeTaskId, {
      name: modalTaskName.value.trim() || activeTaskId,
      assignee: modalTaskAssignee.value,
    });

    modalSubtasks.querySelectorAll('.subtask-row').forEach((row) => {
      markdown = updateSubtaskById(markdown, row.dataset.subtaskId, {
        name: row.querySelector('.subtask-name').value.trim() || row.dataset.subtaskId,
        done: row.querySelector('.subtask-done').checked ? 'true' : 'false',
        assignee: row.querySelector('.subtask-assignee').value,
      });
    });

    markdownInput.value = markdown;
    persistMarkdown();
    refreshFromMarkdown(silent ? '' : 'Task details saved.');

    if (close) {
      closeTaskModal();
    } else {
      const task = lastProject?.tasks.find((candidate) => candidate.id === activeTaskId);
      if (task) {
        modalTitle.textContent = task.name;
        renderModalSubtasks(lastProject, task);
      }
    }
  } catch (error) {
    showError(error.message);
  }
}

function updateMarkdownTask(task, updates) {
  try {
    markdownInput.value = updateTaskById(markdownInput.value, task.id, updates, task._markdownRowIndex);
    persistMarkdown();
    showSuccess('Markdown updated from chart edit.');
  } catch (error) {
    showError(error.message);
  }
}

function updateTaskById(markdown, taskId, updates, fallbackLineIndex = null) {
  const project = parseProject(markdown);
  const rowLineIndex = findRowLineIndexById(project.taskTable, taskId, fallbackLineIndex);

  if (rowLineIndex === null) {
    throw new Error(`Could not find markdown row for task "${taskId}".`);
  }

  return updateTableRow(markdown, project.taskTable, rowLineIndex, updates);
}

function updateSubtaskById(markdown, subtaskId, updates) {
  const project = parseProject(markdown);

  if (!project.subtaskTable) {
    throw new Error('Could not find a subtasks table.');
  }

  const rowLineIndex = findRowLineIndexById(project.subtaskTable, subtaskId);

  if (rowLineIndex === null) {
    throw new Error(`Could not find markdown row for subtask "${subtaskId}".`);
  }

  return updateTableRow(markdown, project.subtaskTable, rowLineIndex, updates);
}

function updateTableRow(markdown, table, rowLineIndex, updates) {
  const lines = markdown.split('\n');
  const headers = [...table.headers];
  const normalizedHeaders = headers.map(normalizeHeader);
  const updateEntries = Object.entries(updates);

  for (const [fieldName] of updateEntries) {
    if (normalizedHeaders.includes(fieldName)) {
      continue;
    }

    headers.push(fieldName);
    normalizedHeaders.push(fieldName);
    lines[table.headerLineIndex] = formatMarkdownRow(headers);
    lines[table.separatorLineIndex] = formatMarkdownRow(headers.map(() => '---'));

    for (const currentRowLineIndex of table.rowLineIndexes) {
      const cells = splitMarkdownRow(lines[currentRowLineIndex]);
      cells.push('');
      lines[currentRowLineIndex] = formatMarkdownRow(cells);
    }
  }

  const cells = splitMarkdownRow(lines[rowLineIndex]);

  while (cells.length < normalizedHeaders.length) {
    cells.push('');
  }

  for (const [fieldName, value] of updateEntries) {
    cells[normalizedHeaders.indexOf(fieldName)] = value;
  }

  lines[rowLineIndex] = formatMarkdownRow(cells);

  return lines.join('\n');
}

function appendMarkdownTask(markdown) {
  const project = tryParseProject(markdown);
  const table = project?.taskTable ?? findTaskTable(findMarkdownTables(markdown));
  const { start, end } = getNewTaskDates(markdown);
  const newTask = {
    id: getNextTaskId(project),
    name: 'New task',
    start,
    end,
    progress: '0',
    dependencies: '',
    assignee: '',
  };

  if (!table) {
    const tableMarkdown = [
      formatMarkdownRow(TASK_COLUMNS),
      formatMarkdownRow(TASK_COLUMNS.map(() => '---')),
      formatMarkdownRow(TASK_COLUMNS.map((column) => newTask[column])),
    ].join('\n');
    const separator = markdown.trim() ? '\n\n' : '';

    return `${markdown.trimEnd()}${separator}${tableMarkdown}\n`;
  }

  return appendRowToTable(markdown, table, TASK_COLUMNS, newTask);
}

function appendMarkdownSubtask(markdown, taskId) {
  const project = parseProject(markdown);
  const parentTask = project.tasks.find((task) => task.id === taskId);

  if (!parentTask) {
    throw new Error(`Could not find task "${taskId}".`);
  }

  const newSubtask = {
    id: getNextSubtaskId(project, taskId),
    task: taskId,
    name: 'New subtask',
    done: 'false',
    assignee: parentTask.assignee,
  };

  if (!project.subtaskTable) {
    const tableMarkdown = [
      formatMarkdownRow(SUBTASK_COLUMNS),
      formatMarkdownRow(SUBTASK_COLUMNS.map(() => '---')),
      formatMarkdownRow(SUBTASK_COLUMNS.map((column) => newSubtask[column])),
    ].join('\n');

    return `${markdown.trimEnd()}\n\n${tableMarkdown}\n`;
  }

  return appendRowToTable(markdown, project.subtaskTable, SUBTASK_COLUMNS, newSubtask);
}

function appendRowToTable(markdown, table, requiredColumns, rowData) {
  const lines = markdown.split('\n');
  const headers = [...table.headers];
  const normalizedHeaders = headers.map(normalizeHeader);

  for (const column of requiredColumns) {
    if (normalizedHeaders.includes(column)) {
      continue;
    }

    headers.push(column);
    normalizedHeaders.push(column);
  }

  lines[table.headerLineIndex] = formatMarkdownRow(headers);
  lines[table.separatorLineIndex] = formatMarkdownRow(headers.map(() => '---'));

  for (const rowLineIndex of table.rowLineIndexes) {
    const cells = splitMarkdownRow(lines[rowLineIndex]);

    while (cells.length < headers.length) {
      cells.push('');
    }

    lines[rowLineIndex] = formatMarkdownRow(cells);
  }

  const newRow = normalizedHeaders.map((header) => rowData[header] ?? '');
  const insertAt = table.rowLineIndexes.at(-1) ?? table.separatorLineIndex;
  lines.splice(insertAt + 1, 0, formatMarkdownRow(newRow));

  return lines.join('\n');
}

function getNextTaskId(project) {
  const existingIds = new Set(project?.tasks.map((task) => task.id) ?? []);
  let index = (project?.tasks.length ?? 0) + 1;
  let id = `task-${index}`;

  while (existingIds.has(id)) {
    index += 1;
    id = `task-${index}`;
  }

  return id;
}

function getNextSubtaskId(project, taskId) {
  const existingIds = new Set(project.subtasks.map((subtask) => subtask.id));
  const baseId = `${taskId}-subtask`;
  let index = (project.subtasksByTask.get(taskId)?.length ?? 0) + 1;
  let id = `${baseId}-${index}`;

  while (existingIds.has(id)) {
    index += 1;
    id = `${baseId}-${index}`;
  }

  return id;
}

function getNewTaskDates(markdown) {
  try {
    const project = parseProject(markdown);
    const latestEnd = project.tasks.reduce(
      (latest, task) => Math.max(latest, new Date(task.end).getTime()),
      0,
    );
    const start = addDays(new Date(latestEnd), 1);

    return {
      start: formatDate(start),
      end: formatDate(addDays(start, 2)),
    };
  } catch {
    const start = new Date();

    return {
      start: formatDate(start),
      end: formatDate(addDays(start, 2)),
    };
  }
}

function parseProject(markdown) {
  const tables = findMarkdownTables(markdown);
  const taskTable = findTaskTable(tables);

  if (!taskTable) {
    throw new Error('Add a task table with columns: id, name, start, end, progress, dependencies.');
  }

  const tasks = parseTasksFromTable(taskTable);
  const taskIds = new Set(tasks.map((task) => task.id));
  const assigneeTable = findAssigneeTable(tables, taskTable);
  const subtaskTable = findSubtaskTable(tables, taskTable);
  const subtasks = parseSubtasksFromTable(subtaskTable, taskIds);
  const assignees = buildAssigneeDirectory(
    parseAssigneesFromTable(assigneeTable),
    tasks,
    subtasks,
  );
  const subtasksByTask = groupBy(subtasks, 'task');
  const assigneeByName = new Map(assignees.map((assignee) => [assignee.name, assignee]));

  validateTaskDependencies(tasks);

  return {
    markdown,
    tables,
    taskTable,
    assigneeTable,
    subtaskTable,
    tasks,
    assignees,
    assigneeByName,
    subtasks,
    subtasksByTask,
  };
}

function tryParseProject(markdown) {
  try {
    return parseProject(markdown);
  } catch {
    return null;
  }
}

function parseTasksFromTable(table) {
  const headers = table.normalizedHeaders;
  const hasNameColumn = headers.includes('name') || headers.includes('task');

  for (const header of ['start', 'end']) {
    if (!headers.includes(header)) {
      throw new Error(`Missing required task column: ${header}.`);
    }
  }

  if (!hasNameColumn) {
    throw new Error('Missing required task column: name.');
  }

  const tasks = table.rows.map((row, index) =>
    rowToTask(headers, row, index, table.rowLineIndexes[index]),
  );
  const ids = new Set(tasks.map((task) => task.id));

  if (ids.size !== tasks.length) {
    throw new Error('Task ids must be unique.');
  }

  if (tasks.length === 0) {
    throw new Error('The task table has no rows.');
  }

  return tasks;
}

function parseAssigneesFromTable(table) {
  if (!table) {
    return [];
  }

  return table.rows
    .map((row, index) => {
      const assignee = Object.fromEntries(
        table.normalizedHeaders.map((header, columnIndex) => [header, row[columnIndex] ?? '']),
      );
      const name = assignee.assignee?.trim();

      if (!name) {
        return null;
      }

      return {
        name,
        role: assignee.role?.trim() ?? '',
        color: normalizeColor(assignee.color) ?? getPaletteColor(index),
      };
    })
    .filter(Boolean);
}

function parseSubtasksFromTable(table, taskIds) {
  if (!table) {
    return [];
  }

  for (const header of ['task', 'name']) {
    if (!table.normalizedHeaders.includes(header)) {
      throw new Error(`Missing required subtask column: ${header}.`);
    }
  }

  const subtasks = table.rows.map((row, index) => {
    const subtask = Object.fromEntries(
      table.normalizedHeaders.map((header, columnIndex) => [header, row[columnIndex] ?? '']),
    );
    const task = subtask.task?.trim();
    const id = subtask.id?.trim() || `${task}-subtask-${index + 1}`;

    if (!task) {
      throw new Error('Each subtask must reference a parent task.');
    }

    if (!taskIds.has(task)) {
      throw new Error(`Subtask "${id}" references unknown task "${task}".`);
    }

    return {
      id,
      task,
      name: subtask.name?.trim() || id,
      done: parseBoolean(subtask.done),
      assignee: subtask.assignee?.trim() ?? '',
      _markdownRowIndex: table.rowLineIndexes[index],
    };
  });
  const ids = new Set(subtasks.map((subtask) => subtask.id));

  if (ids.size !== subtasks.length) {
    throw new Error('Subtask ids must be unique.');
  }

  return subtasks;
}

function buildAssigneeDirectory(explicitAssignees, tasks, subtasks) {
  const byName = new Map();

  explicitAssignees.forEach((assignee) => {
    if (!byName.has(assignee.name)) {
      byName.set(assignee.name, assignee);
    }
  });

  [...tasks, ...subtasks].forEach((item) => {
    if (!item.assignee || byName.has(item.assignee)) {
      return;
    }

    byName.set(item.assignee, {
      name: item.assignee,
      role: '',
      color: getPaletteColor(byName.size),
    });
  });

  return [...byName.values()].map((assignee, index) => ({
    ...assignee,
    color: normalizeColor(assignee.color) ?? getPaletteColor(index),
    className: `assignee-${index}`,
  }));
}

function buildGanttTasks(project) {
  return project.tasks.map((task) => {
    const subtasks = project.subtasksByTask.get(task.id) ?? [];
    const derivedProgress =
      subtasks.length === 0
        ? task.progress
        : Math.round((subtasks.filter((subtask) => subtask.done).length / subtasks.length) * 100);
    const assignee = project.assigneeByName.get(task.assignee);
    return {
      ...task,
      hasSubtasks: subtasks.length > 0,
      progress: derivedProgress,
      custom_class: assignee?.className ?? '',
    };
  });
}

function taskHasSubtasks(taskId) {
  return (lastProject?.subtasksByTask.get(taskId)?.length ?? 0) > 0;
}

function validateTaskDependencies(tasks) {
  const ids = new Set(tasks.map((task) => task.id));

  for (const task of tasks) {
    const missingDependencies = splitDependencies(task.dependencies).filter((id) => !ids.has(id));

    if (missingDependencies.length > 0) {
      throw new Error(
        `Task "${task.name}" depends on unknown id: ${missingDependencies.join(', ')}.`,
      );
    }
  }
}

function findMarkdownTables(markdown) {
  const lines = markdown.split('\n');
  const tables = [];

  for (let index = 0; index < lines.length - 1; index += 1) {
    if (!isTableRow(lines[index]) || !isSeparatorRow(lines[index + 1])) {
      continue;
    }

    const rows = [];
    const rowLineIndexes = [];
    let rowIndex = index + 2;

    while (rowIndex < lines.length && isTableRow(lines[rowIndex])) {
      rows.push(splitMarkdownRow(lines[rowIndex]));
      rowLineIndexes.push(rowIndex);
      rowIndex += 1;
    }

    const headers = splitMarkdownRow(lines[index]);

    tables.push({
      headerLineIndex: index,
      separatorLineIndex: index + 1,
      headers,
      normalizedHeaders: headers.map(normalizeHeader),
      rows,
      rowLineIndexes,
    });

    index = rowIndex - 1;
  }

  return tables;
}

function findTaskTable(tables) {
  return tables.find((table) => {
    const headers = table.normalizedHeaders;
    return (
      headers.includes('start') &&
      headers.includes('end') &&
      (headers.includes('name') || headers.includes('task'))
    );
  }) ?? null;
}

function findAssigneeTable(tables, taskTable) {
  return tables.find((table) => {
    const headers = table.normalizedHeaders;
    return (
      table !== taskTable &&
      headers.includes('assignee') &&
      (headers.includes('role') || headers.includes('color'))
    );
  }) ?? null;
}

function findSubtaskTable(tables, taskTable) {
  return tables.find((table) => {
    const headers = table.normalizedHeaders;
    return (
      table !== taskTable &&
      headers.includes('task') &&
      headers.includes('name') &&
      !headers.includes('start') &&
      !headers.includes('end')
    );
  }) ?? null;
}

function rowToTask(headers, row, index, lineIndex) {
  const task = Object.fromEntries(headers.map((header, columnIndex) => [header, row[columnIndex] ?? '']));
  const id = task.id || slugify(task.name || task.task) || `task-${index + 1}`;
  const name = task.name || task.task || id;
  const start = normalizeDate(task.start, name, 'start');
  const end = normalizeDate(task.end, name, 'end');

  if (new Date(start) > new Date(end)) {
    throw new Error(`Task "${name}" starts after it ends.`);
  }

  return {
    id,
    name,
    start,
    end,
    progress: normalizeProgress(task.progress, name),
    dependencies: splitDependencies(task.dependencies).join(', '),
    assignee: task.assignee?.trim() ?? '',
    _markdownRowIndex: lineIndex,
  };
}

function findRowLineIndexById(table, id, fallbackLineIndex = null) {
  if (Number.isInteger(fallbackLineIndex)) {
    return fallbackLineIndex;
  }

  const idColumnIndex = table.normalizedHeaders.indexOf('id');

  if (idColumnIndex === -1) {
    return null;
  }

  const rowIndex = table.rows.findIndex((row) => row[idColumnIndex] === id);

  return rowIndex === -1 ? null : table.rowLineIndexes[rowIndex];
}

function injectAssigneeStyles(assignees) {
  let style = document.querySelector(`#${ASSIGNEE_STYLE_ID}`);

  if (!style) {
    style = document.createElement('style');
    style.id = ASSIGNEE_STYLE_ID;
    document.head.append(style);
  }

  style.textContent = assignees
    .map((assignee) => {
      const barColor = mixColors(assignee.color, '#ffffff', 0.46);
      const progressColor = assignee.color;
      const strokeColor = mixColors(assignee.color, '#000000', 0.12);

      return `
        .gantt .bar-wrapper.${assignee.className} .bar {
          fill: ${barColor};
          stroke: ${strokeColor};
        }

        .gantt .bar-wrapper.${assignee.className} .bar-progress {
          fill: ${progressColor};
        }
      `;
    })
    .join('\n');
}

function persistMarkdown() {
  localStorage.setItem(STORAGE_KEY, markdownInput.value);
}

function showSuccess(text) {
  message.textContent = text;
  message.className = 'parse-message success';
}

function showError(text) {
  message.textContent = text;
  message.className = 'parse-message error';
}

function normalizeHeader(header) {
  const key = header.toLowerCase().replace(/[^a-z]/g, '');

  return {
    title: 'name',
    from: 'start',
    begin: 'start',
    finish: 'end',
    due: 'end',
    done: 'done',
    complete: 'done',
    completed: 'done',
    deps: 'dependencies',
    depends: 'dependencies',
    dependency: 'dependencies',
    assignedto: 'assignee',
    owner: 'assignee',
    person: 'assignee',
  }[key] ?? key;
}

function normalizeDate(value, taskName, fieldName) {
  const trimmed = value.trim();
  const [year, month, day] = trimmed.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  const isRealDate =
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed) || !isRealDate) {
    throw new Error(`Task "${taskName || 'untitled'}" has an invalid ${fieldName} date.`);
  }

  return trimmed;
}

function normalizeProgress(value, taskName) {
  const parsed = Number.parseInt(String(value || '0').replace('%', ''), 10);

  if (Number.isNaN(parsed) || parsed < 0 || parsed > 100) {
    throw new Error(`Task "${taskName || 'untitled'}" progress must be between 0 and 100.`);
  }

  return parsed;
}

function parseBoolean(value) {
  return ['true', 'yes', 'y', '1', 'done', 'complete', 'completed'].includes(
    String(value || '').trim().toLowerCase(),
  );
}

function splitDependencies(value) {
  return String(value || '')
    .split(',')
    .map((dependency) => dependency.trim())
    .filter(Boolean);
}

function isTableRow(line) {
  return line.trim().startsWith('|') && line.trim().endsWith('|');
}

function isSeparatorRow(line) {
  return /^\|?[\s:-]*---[\s|:-]*\|?$/.test(line.trim());
}

function splitMarkdownRow(line) {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim());
}

function formatMarkdownRow(cells) {
  return `| ${cells.join(' | ')} |`;
}

function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function addDays(date, days) {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + days);

  return nextDate;
}

function groupBy(items, key) {
  return items.reduce((groups, item) => {
    const groupKey = item[key];
    groups.set(groupKey, [...(groups.get(groupKey) ?? []), item]);
    return groups;
  }, new Map());
}

function getPaletteColor(index) {
  return ASSIGNEE_PALETTE[index % ASSIGNEE_PALETTE.length];
}

function normalizeColor(value) {
  const color = String(value || '').trim();

  return /^#[0-9a-f]{6}$/i.test(color) ? color : null;
}

function mixColors(color, mixWith, weight) {
  const base = hexToRgb(color);
  const mix = hexToRgb(mixWith);
  const mixed = {
    r: Math.round(base.r * (1 - weight) + mix.r * weight),
    g: Math.round(base.g * (1 - weight) + mix.g * weight),
    b: Math.round(base.b * (1 - weight) + mix.b * weight),
  };

  return rgbToHex(mixed);
}

function hexToRgb(color) {
  const normalized = color.replace('#', '');

  return {
    r: Number.parseInt(normalized.slice(0, 2), 16),
    g: Number.parseInt(normalized.slice(2, 4), 16),
    b: Number.parseInt(normalized.slice(4, 6), 16),
  };
}

function rgbToHex({ r, g, b }) {
  return `#${[r, g, b]
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('')}`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function escapeAttribute(value) {
  return escapeHtml(value);
}

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function debounce(callback, delay) {
  let timeoutId;

  return (...args) => {
    window.clearTimeout(timeoutId);
    timeoutId = window.setTimeout(() => callback(...args), delay);
  };
}
