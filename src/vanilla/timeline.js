const MS_PER_DAY = 24 * 60 * 60 * 1000;

const VIEW_CONFIGS = {
  Day: { viewMode: 'Day', unit: 'day', stepDays: 1, columnWidth: 40, labelEvery: 1 },
  Week: { viewMode: 'Week', unit: 'day', stepDays: 7, columnWidth: 96, labelEvery: 7 },
  Month: { viewMode: 'Month', unit: 'day', stepDays: 30, columnWidth: 120, labelEvery: 30 },
  Year: { viewMode: 'Year', unit: 'day', stepDays: 365, columnWidth: 120, labelEvery: 365 },
};

export function getViewConfig(viewMode = 'Week') {
  return VIEW_CONFIGS[viewMode] ?? VIEW_CONFIGS.Week;
}

export function parseDateOnly(value) {
  const [year, month, day] = String(value || '').split('-').map(Number);
  return new Date(year || 1970, (month || 1) - 1, day || 1);
}

export function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export function daysBetween(start, end) {
  return Math.round((parseDateOnly(end).getTime() - parseDateOnly(start).getTime()) / MS_PER_DAY);
}

export function inclusiveDays(start, end) {
  return Math.max(1, daysBetween(start, end) + 1);
}

export function pixelsToDays(deltaPixels, config) {
  const resolved = config ?? getViewConfig();
  const days = Math.round((deltaPixels / resolved.columnWidth) * resolved.stepDays);
  return Object.is(days, -0) ? 0 : days;
}

export function daysToPixels(days, config) {
  const resolved = config ?? getViewConfig();
  return (days / resolved.stepDays) * resolved.columnWidth;
}

export function minDate(dates) {
  return dates.reduce((earliest, date) => (date < earliest ? date : earliest));
}

export function maxDate(dates) {
  return dates.reduce((latest, date) => (date > latest ? date : latest));
}

export function getTimelineRange(tasks, viewMode = 'Week') {
  const config = getViewConfig(viewMode);
  const starts = tasks.map((task) => parseDateOnly(task.start));
  const ends = tasks.map((task) => parseDateOnly(task.end));
  const first = starts.length ? minDate(starts) : parseDateOnly(formatDate(new Date()));
  const last = ends.length ? maxDate(ends) : first;
  const padDays = Math.max(config.stepDays, 2);

  return {
    start: addDays(first, -padDays),
    end: addDays(last, padDays),
  };
}

export function dateToX(date, rangeStart, config) {
  return daysToPixels(Math.max(0, daysBetween(formatDate(rangeStart), formatDate(date))), config);
}

export function buildCalendarRows(range, viewMode = 'Week') {
  if (viewMode === 'Day') {
    return [
      buildTicks(range, viewMode, startOfMonth(range.start), addMonths, monthYearLabel),
      buildTicks(range, viewMode, range.start, (date) => addDays(date, 1), (date) => String(date.getDate())),
    ];
  }

  if (viewMode === 'Week') {
    return [
      buildTicks(range, viewMode, startOfMonth(range.start), addMonths, monthYearLabel),
      buildTicks(range, viewMode, startOfWeek(range.start), (date) => addDays(date, 7), weekLabel),
    ];
  }

  if (viewMode === 'Month') {
    return [
      buildTicks(range, viewMode, startOfYear(range.start), addYears, (date) => String(date.getFullYear())),
      buildTicks(range, viewMode, startOfMonth(range.start), addMonths, (date) => shortMonthLabel(date)),
    ];
  }

  return [
    buildTicks(range, viewMode, startOfYear(range.start), addYears, (date) => String(date.getFullYear())),
    buildTicks(range, viewMode, startOfYear(range.start), addYears, (date) => String(date.getFullYear())),
  ];
}

function buildTicks(range, viewMode, firstTick, getNextTick, getLabel) {
  const config = getViewConfig(viewMode);
  const ticks = [];
  let tickStart = new Date(firstTick);

  while (tickStart < range.end) {
    const nextTick = getNextTick(tickStart);
    const visibleStart = tickStart < range.start ? range.start : tickStart;
    const visibleEnd = nextTick > range.end ? range.end : nextTick;
    const x = Math.round(dateToX(visibleStart, range.start, config));
    const width = Math.max(1, Math.round(dateToX(visibleEnd, range.start, config) - x));

    if (visibleEnd > range.start) {
      ticks.push({
        label: getLabel(tickStart),
        x,
        width,
      });
    }

    tickStart = nextTick;
  }

  return ticks;
}

function startOfWeek(date) {
  const start = new Date(date);
  const day = start.getDay() || 7;
  start.setDate(start.getDate() - day + 1);
  return start;
}

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function startOfYear(date) {
  return new Date(date.getFullYear(), 0, 1);
}

function addMonths(date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 1);
}

function addYears(date) {
  return new Date(date.getFullYear() + 1, 0, 1);
}

function monthYearLabel(date) {
  return `${shortMonthLabel(date)} ${date.getFullYear()}`;
}

function shortMonthLabel(date) {
  return date.toLocaleString('en-US', { month: 'short' });
}

function weekLabel(date) {
  return `Week ${getIsoWeek(date)}`;
}

function getIsoWeek(date) {
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);
  target.setDate(target.getDate() + 3 - ((target.getDay() + 6) % 7));
  const week1 = new Date(target.getFullYear(), 0, 4);
  return 1 + Math.round(((target - week1) / MS_PER_DAY - 3 + ((week1.getDay() + 6) % 7)) / 7);
}
