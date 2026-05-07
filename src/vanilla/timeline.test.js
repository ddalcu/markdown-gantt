import { describe, expect, it } from 'vitest';
import {
  addDays,
  buildCalendarRows,
  formatDate,
  getViewConfig,
  inclusiveDays,
  parseDateOnly,
  pixelsToDays,
} from './timeline.js';

describe('vanilla gantt timeline', () => {
  it('uses stable view mode configs for day, week, month, and year', () => {
    expect(getViewConfig('Day')).toMatchObject({ viewMode: 'Day', unit: 'day', stepDays: 1 });
    expect(getViewConfig('Week')).toMatchObject({ viewMode: 'Week', unit: 'day', stepDays: 7 });
    expect(getViewConfig('Month')).toMatchObject({ viewMode: 'Month', unit: 'day', stepDays: 30 });
    expect(getViewConfig('Year')).toMatchObject({ viewMode: 'Year', unit: 'day', stepDays: 365 });
  });

  it('treats task end dates as inclusive for display math', () => {
    expect(inclusiveDays('2026-05-07', '2026-05-07')).toBe(1);
    expect(inclusiveDays('2026-05-07', '2026-05-10')).toBe(4);
  });

  it('snaps pixel movement to whole days in coarse views without rounding to zero months', () => {
    const month = getViewConfig('Month');
    const year = getViewConfig('Year');

    expect(pixelsToDays(12, month)).toBe(3);
    expect(pixelsToDays(8, year)).toBe(24);
  });

  it('formats local date-only values without timezone drift', () => {
    const start = parseDateOnly('2026-05-07');

    expect(formatDate(addDays(start, 30))).toBe('2026-06-06');
  });

  it('builds calendar rows that match each view mode scale', () => {
    const range = {
      start: parseDateOnly('2026-05-01'),
      end: parseDateOnly('2026-06-15'),
    };

    expect(buildCalendarRows(range, 'Day')[0][0].label).toBe('May 2026');
    expect(buildCalendarRows(range, 'Day')[1].slice(0, 3).map((tick) => tick.label)).toEqual(['1', '2', '3']);
    expect(buildCalendarRows(range, 'Week')[1][0].label).toMatch(/^Week \d+$/);
    expect(buildCalendarRows(range, 'Month')[1].map((tick) => tick.label)).toEqual(['May', 'Jun']);
  });
});
