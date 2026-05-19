import { describe, expect, it } from 'vitest';
import {
  appendMarkdownTaskAfter,
  collectTaskLaneOptions,
  defaultMarkdown,
  ensureTaskLaneColumn,
  parseProject,
  removeMarkdownTask,
  reorderLaneRows,
} from './markdown-project.js';

describe('ensureTaskLaneColumn', () => {
  const noLaneMarkdown = `## Tasks

| id | name | start | end | progress | dependencies | assignee |
| --- | --- | --- | --- | --- | --- | --- |
| a | A | 2026-05-07 | 2026-05-07 | 0 | | |
| b | B | 2026-05-08 | 2026-05-08 | 0 | | |
`;

  it('inserts a lane column with empty values when missing', () => {
    const markdown = ensureTaskLaneColumn(noLaneMarkdown);
    expect(markdown).toContain('| lane |');
    const project = parseProject(markdown);
    const lanes = project.tasks.map((task) => task.lane);
    expect(lanes.length).toBeGreaterThan(0);
    expect(lanes.every((lane) => lane === '')).toBe(true);
  });

  it('returns the same markdown when a lane column already exists', () => {
    const once = ensureTaskLaneColumn(noLaneMarkdown);
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
    const next = removeMarkdownTask(markdown, 'a');
    expect(next).not.toContain('| a |');
    expect(next).not.toContain('| s1 |');
  });
});

describe('collectTaskLaneOptions', () => {
  it('includes every non-empty lane cell, each task id, and each task effective lane when no lane table', () => {
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

  it('only includes lane table ids when a lane table exists', () => {
    const markdown = `## Lanes

| id | name | color |
| --- | --- | --- |
| dev | Development | #3154d4 |
| design | Design | #b54708 |

## Tasks

| id | name | start | end | progress | dependencies | assignee | lane |
| --- | --- | --- | --- | --- | --- | --- | --- |
| a | A | 2026-05-07 | 2026-05-07 | 0 | | | dev |
| b | B | 2026-05-08 | 2026-05-08 | 0 | | | design |
`;
    const project = parseProject(markdown);
    const options = collectTaskLaneOptions(project);
    expect(new Set(options)).toEqual(new Set(['dev', 'design']));
  });
});

describe('lane table parsing', () => {
  const markdownWithLanes = `## Lanes

| id | name | color |
| --- | --- | --- |
| dev | Development | #3154d4 |
| design | Design | #b54708 |

## Tasks

| id | name | start | end | progress | dependencies | assignee | lane |
| --- | --- | --- | --- | --- | --- | --- | --- |
| a | A | 2026-05-07 | 2026-05-07 | 0 | | | dev |
| b | B | 2026-05-08 | 2026-05-08 | 0 | | | design |
| c | C | 2026-05-09 | 2026-05-09 | 0 | | | |
`;

  it('detects a lane table and parses lanes with id, name, and color', () => {
    const project = parseProject(markdownWithLanes);
    expect(project.laneTable).not.toBeNull();
    expect(project.lanes).toHaveLength(2);
    expect(project.lanes[0]).toMatchObject({ id: 'dev', name: 'Development', color: '#3154d4' });
    expect(project.lanes[1]).toMatchObject({ id: 'design', name: 'Design', color: '#b54708' });
  });

  it('does not confuse the lane table with assignee or task tables', () => {
    const markdown = `## Assignees

| assignee | role | color |
| --- | --- | --- |
| Maya | product | #087443 |

## Lanes

| id | name | color |
| --- | --- | --- |
| dev | Development | #3154d4 |

## Tasks

| id | name | start | end | progress | dependencies | assignee |
| --- | --- | --- | --- | --- | --- | --- |
| a | A | 2026-05-07 | 2026-05-07 | 0 | | Maya |
`;
    const project = parseProject(markdown);
    expect(project.laneTable).not.toBeNull();
    expect(project.lanes).toHaveLength(1);
    expect(project.lanes[0].id).toBe('dev');
    expect(project.assigneeTable).not.toBeNull();
  });

  it('returns empty lanes array when no lane table is present', () => {
    const markdown = `## Tasks

| id | name | start | end | progress | dependencies | assignee |
| --- | --- | --- | --- | --- | --- | --- |
| a | A | 2026-05-07 | 2026-05-07 | 0 | | |
`;
    const project = parseProject(markdown);
    expect(project.laneTable).toBeNull();
    expect(project.lanes).toEqual([]);
  });

  it('tasks with empty lane get empty string, not task id', () => {
    const project = parseProject(markdownWithLanes);
    const taskC = project.tasks.find((task) => task.id === 'c');
    expect(taskC.lane).toBe('');
  });

  it('tasks without a lane column get empty lane', () => {
    const markdown = `## Tasks

| id | name | start | end | progress | dependencies | assignee |
| --- | --- | --- | --- | --- | --- | --- |
| a | A | 2026-05-07 | 2026-05-07 | 0 | | |
`;
    const project = parseProject(markdown);
    expect(project.tasks[0].lane).toBe('');
  });
});

describe('reorderLaneRows', () => {
  it('reorders lane table rows to match the given id order', () => {
    const markdown = `## Lanes

| id | name | color |
| --- | --- | --- |
| dev | Development | #3154d4 |
| design | Design | #b54708 |
| qa | QA | #087443 |

## Tasks

| id | name | start | end | progress | dependencies | assignee | lane |
| --- | --- | --- | --- | --- | --- | --- | --- |
| a | A | 2026-05-07 | 2026-05-07 | 0 | | | dev |
`;
    const reordered = reorderLaneRows(markdown, ['qa', 'dev', 'design']);
    const project = parseProject(reordered);
    expect(project.lanes.map((lane) => lane.id)).toEqual(['qa', 'dev', 'design']);
  });
});
