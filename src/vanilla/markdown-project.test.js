import { describe, expect, it } from 'vitest';
import {
  appendMarkdownTaskAfter,
  collectTaskLaneOptions,
  defaultMarkdown,
  ensureTaskLaneColumn,
  parseProject,
  removeMarkdownTask,
} from './markdown-project.js';

describe('ensureTaskLaneColumn', () => {
  it('inserts a lane column with task ids when missing', () => {
    const markdown = ensureTaskLaneColumn(defaultMarkdown);
    expect(markdown).toContain('| lane |');
    const project = parseProject(markdown);
    const lanes = project.tasks.map((task) => task.lane);
    expect(lanes.length).toBeGreaterThan(0);
    expect(lanes.every((lane, index) => lane === project.tasks[index].id)).toBe(true);
  });

  it('returns the same markdown when a lane column already exists', () => {
    const once = ensureTaskLaneColumn(defaultMarkdown);
    const twice = ensureTaskLaneColumn(once);
    expect(twice).toBe(once);
  });
});

describe('appendMarkdownTaskAfter', () => {
  it('inserts a row after the anchor with the given lane and returns the new id', () => {
    const markdown = `## Tasks

| id | name | start | end | progress | dependencies | assignee | lane |
| --- | --- | --- | --- | --- | --- | --- | --- |
| a | A | 2026-05-07 | 2026-05-07 | 0 | | | a |
| b | B | 2026-05-08 | 2026-05-08 | 0 | | | b |
`;
    const { markdown: next, newTaskId } = appendMarkdownTaskAfter(markdown, 'a', 'a');
    expect(newTaskId).toMatch(/^task-/);
    const lines = next.split('\n');
    const aIndex = lines.findIndex((line) => line.includes('| a |'));
    const newIndex = lines.findIndex((line) => line.includes(`| ${newTaskId} |`));
    expect(newIndex).toBe(aIndex + 1);
    const project = parseProject(next);
    const created = project.tasks.find((task) => task.id === newTaskId);
    expect(created?.start).toBe('2026-05-10');
    expect(created?.end).toBe('2026-05-14');
    expect(created?.dependencies).toBe('a');
    expect(created?.lane).toBe('a');
  });
});

describe('removeMarkdownTask', () => {
  it('removes the task row and strips the id from other tasks dependencies', () => {
    const markdown = `## Tasks

| id | name | start | end | progress | dependencies | assignee |
| --- | --- | --- | --- | --- | --- | --- |
| a | A | 2026-05-07 | 2026-05-07 | 0 | | |
| b | B | 2026-05-08 | 2026-05-08 | 0 | a | |
`;
    const next = removeMarkdownTask(markdown, 'a');
    expect(next).not.toContain('| a | A |');
    const project = parseProject(next);
    expect(project.tasks.map((task) => task.id)).toEqual(['b']);
    expect(project.tasks[0].dependencies).toBe('');
  });

  it('throws when the task still has subtasks', () => {
    const markdown = `## Tasks

| id | name | start | end | progress | dependencies | assignee |
| --- | --- | --- | --- | --- | --- | --- |
| a | A | 2026-05-07 | 2026-05-07 | 0 | | |

## Subtasks

| id | task | name | done | assignee |
| --- | --- | --- | --- | --- |
| s1 | a | Sub | false | |
`;
    expect(() => removeMarkdownTask(markdown, 'a')).toThrow(/subtasks/i);
  });
});

describe('collectTaskLaneOptions', () => {
  it('includes every non-empty lane cell, each task id, and each task effective lane', () => {
    const markdown = `## Tasks

| id | name | start | end | progress | dependencies | assignee | lane |
| --- | --- | --- | --- | --- | --- | --- | --- |
| a | A | 2026-05-07 | 2026-05-07 | 0 | | | team |
| b | B | 2026-05-08 | 2026-05-08 | 0 | | | team |
| c | C | 2026-05-09 | 2026-05-09 | 0 | | | solo |
`;
    const project = parseProject(markdown);
    const options = collectTaskLaneOptions(project);
    expect(new Set(options)).toEqual(new Set(['a', 'b', 'c', 'solo', 'team']));
  });
});
