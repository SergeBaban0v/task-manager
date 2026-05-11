import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { createClient } from '@supabase/supabase-js'
import pomodoroBreakImage from './assets/pomodoro-break.png'
import pomodoroTaskGreenImage from './assets/pomodoro-task-green.png'
import pomodoroTaskRedImage from './assets/pomodoro-task-red.png'
import pomodoroTaskYellowImage from './assets/pomodoro-task-yellow.png'
import pomodoroWorkImage from './assets/pomodoro-work.png'
import './App.css'

const STORAGE_KEY = 'task-manager.tasks'
const STORAGE_MODE_KEY = 'task-manager.storage-mode'
const POMODORO_STORAGE_KEY = 'task-manager.pomodoro'
const STORAGE_VERSION = 2
const HOLD_STEP_MINUTES = 15
const HOLD_STEP_MS = HOLD_STEP_MINUTES * 60000
const HOLD_REPEAT_DELAY_MS = 420
const HOLD_REPEAT_START_MS = 260
const HOLD_REPEAT_MIN_MS = 70
const HOLD_REPEAT_ACCELERATION = 0.78
const DEFAULT_PRIORITY = 'medium'
const PRIORITY_MENU_WIDTH = 184
const PRIORITY_MENU_HEIGHT = 202
const PRIORITY_MENU_GAP = 6
const POMODORO_MENU_WIDTH = 260
const POMODORO_MENU_HEIGHT = 184
const POMODORO_MENU_GAP = 6
const WINDOW_SIZE_INITIALIZED_KEY = 'task-manager.window.initialized'
const INITIAL_WINDOW_MIN_WIDTH = 760
const INITIAL_WINDOW_MAX_WIDTH = 980
const INITIAL_WINDOW_HEIGHT = 720
const ONLINE_SAVE_DEBOUNCE_MS = 900
const DEFAULT_POMODORO_STATE = {
  enabled: true,
  soundEnabled: true,
  workMinutes: 25,
  breakMinutes: 5,
  selectedTaskId: null,
  needsTaskSelection: false,
  mode: 'idle',
  startedAt: null,
  finishedWorkTaskId: null,
}
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY
const supabase =
  SUPABASE_URL && SUPABASE_ANON_KEY
    ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    : null

const PRIORITIES = [
  { id: 'critical', label: 'Критический', icon: 'skull', rank: 0 },
  { id: 'very-high', label: 'Очень высокий', icon: 'double-up', rank: 1 },
  { id: 'high', label: 'Высокий', icon: 'up', rank: 2 },
  { id: 'medium', label: 'Средний', icon: 'equals', rank: 3 },
  { id: 'low', label: 'Низкий', icon: 'down', rank: 4 },
]

function getInitialDemoTasks(currentTime = Date.now()) {
  return [
    {
      id: 'demo-production-release',
      title: 'Выпустить срочное обновление',
      description:
        'Критическая задача. Она зависит от блокера ниже, поэтому блокер визуально поднимает приоритет всей цепочки.',
      dependencies: ['demo-fix-auth-bug'],
      priority: 'critical',
      completed: false,
      completedAt: null,
      createdAt: currentTime - 7 * 60000,
      holdUntil: null,
    },
    {
      id: 'demo-fix-auth-bug',
      title: 'Починить ошибку авторизации',
      description:
        'Эта задача блокирует критический релиз. Ее собственный приоритет средний, но в списке она отображается как критическая.',
      dependencies: ['demo-check-logs'],
      priority: 'medium',
      completed: false,
      completedAt: null,
      createdAt: currentTime - 12 * 60000,
      holdUntil: null,
    },
    {
      id: 'demo-check-logs',
      title: 'Проверить серверные логи',
      description:
        'Нижний блокер цепочки. Через зависимости получает максимальный приоритет заблокированной срочной задачи.',
      dependencies: [],
      priority: 'low',
      completed: false,
      completedAt: null,
      createdAt: currentTime - 18 * 60000,
      holdUntil: null,
    },
    {
      id: 'demo-call-supplier',
      title: 'Позвонить поставщику',
      description: 'Обычная активная задача с высоким приоритетом.',
      dependencies: [],
      priority: 'high',
      completed: false,
      completedAt: null,
      createdAt: currentTime - 3 * 60000,
      holdUntil: null,
    },
    {
      id: 'demo-wait-reply',
      title: 'Дождаться ответа по договору',
      description:
        'Пример ручного hold. Таймер показывает, когда задача вернется в активные.',
      dependencies: [],
      priority: 'very-high',
      completed: false,
      completedAt: null,
      createdAt: currentTime - 45 * 60000,
      holdUntil: currentTime + 90 * 60000,
    },
    {
      id: 'demo-write-notes',
      title: 'Разобрать заметки встречи',
      description: 'Низкоприоритетная задача без блокировок.',
      dependencies: [],
      priority: 'low',
      completed: false,
      completedAt: null,
      createdAt: currentTime - 25 * 60000,
      holdUntil: null,
    },
    {
      id: 'demo-read-brief',
      title: 'Прочитать вводную по проекту',
      description: 'Закрытая задача. Ее можно снова открыть через чекбокс.',
      dependencies: [],
      priority: 'medium',
      completed: true,
      completedAt: currentTime - 20 * 60000,
      createdAt: currentTime - 2 * 60 * 60000,
      holdUntil: null,
    },
  ]
}

const RELATION_TYPES = [
  { id: 'depends-on', label: 'зависит от' },
  { id: 'blocks', label: 'блокирует' },
  { id: 'parallel', label: 'выполняется одновременно' },
]

function getTaskPriority(task) {
  return (
    PRIORITIES.find((priority) => priority.id === task.priority) ||
    PRIORITIES.find((priority) => priority.id === DEFAULT_PRIORITY)
  )
}

function getRelationType(relationTypeId) {
  return (
    RELATION_TYPES.find((relationType) => relationType.id === relationTypeId) ||
    RELATION_TYPES[0]
  )
}

function getDisplayedTaskPriority(task, allTasks) {
  const ownPriority = getTaskPriority(task)

  if (isTaskClosed(task)) {
    return ownPriority
  }

  const visitedTaskIds = new Set([task.id])

  function getHighestDependentPriority(blockerId, currentPriority) {
    return allTasks.reduce((highestPriority, relatedTask) => {
      if (
        visitedTaskIds.has(relatedTask.id) ||
        isTaskClosed(relatedTask) ||
        !getTaskDependencies(relatedTask).includes(blockerId)
      ) {
        return highestPriority
      }

      visitedTaskIds.add(relatedTask.id)

      const relatedPriority = getTaskPriority(relatedTask)
      const directHighestPriority =
        relatedPriority.rank < highestPriority.rank
          ? relatedPriority
          : highestPriority

      return getHighestDependentPriority(relatedTask.id, directHighestPriority)
    }, currentPriority)
  }

  return getHighestDependentPriority(task.id, ownPriority)
}

function PriorityIcon({ icon }) {
  if (icon === 'skull') {
    return (
      <svg aria-hidden="true" viewBox="0 0 20 20">
        <path d="M5.5 8.2a4.5 4.5 0 0 1 9 0v2.1c0 1.4-.8 2.7-2 3.4v2.1H7.5v-2.1a3.9 3.9 0 0 1-2-3.4V8.2Z" />
        <path d="M7.7 9.2h.1" />
        <path d="M12.2 9.2h.1" />
        <path d="M8.5 15.8v-2" />
        <path d="M10 15.8v-2" />
        <path d="M11.5 15.8v-2" />
      </svg>
    )
  }

  if (icon === 'double-up') {
    return (
      <svg aria-hidden="true" viewBox="0 0 20 20">
        <path d="M5 10.5 10 5l5 5.5" />
        <path d="M5 15 10 9.5 15 15" />
      </svg>
    )
  }

  if (icon === 'up') {
    return (
      <svg aria-hidden="true" viewBox="0 0 20 20">
        <path d="M5 13 10 7l5 6" />
      </svg>
    )
  }

  if (icon === 'down') {
    return (
      <svg aria-hidden="true" viewBox="0 0 20 20">
        <path d="M5 7 10 13l5-6" />
      </svg>
    )
  }

  return (
    <svg aria-hidden="true" viewBox="0 0 20 20">
      <path d="M5 8h10" />
      <path d="M5 12h10" />
    </svg>
  )
}

function getStableTaskId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function isFiniteTimestamp(value) {
  return Number.isFinite(value) && value > 0
}

function normalizeTasks(rawTasks, currentTime = Date.now()) {
  if (!Array.isArray(rawTasks)) {
    return []
  }

  const knownIds = new Set()
  const normalizedTasks = rawTasks.map((task) => {
    const safeTask = task && typeof task === 'object' ? task : {}
    const id =
      typeof safeTask.id === 'string' && safeTask.id.trim()
        ? safeTask.id
        : getStableTaskId()
    const title =
      typeof safeTask.title === 'string' && safeTask.title.trim()
        ? safeTask.title.trim()
        : 'Новая задача'
    const completed = Boolean(safeTask.completed)
    const createdAt = isFiniteTimestamp(safeTask.createdAt)
      ? safeTask.createdAt
      : currentTime
    const completedAt =
      completed && isFiniteTimestamp(safeTask.completedAt)
        ? safeTask.completedAt
        : null
    const holdUntil =
      !completed &&
      isFiniteTimestamp(safeTask.holdUntil) &&
      safeTask.holdUntil > currentTime
        ? safeTask.holdUntil
        : null
    const priority = PRIORITIES.some(
      (priorityOption) => priorityOption.id === safeTask.priority,
    )
      ? safeTask.priority
      : DEFAULT_PRIORITY

    knownIds.add(id)

    return {
      id,
      title,
      description:
        typeof safeTask.description === 'string' ? safeTask.description : '',
      dependencies: Array.isArray(safeTask.dependencies)
        ? [...new Set(safeTask.dependencies.filter(Boolean).map(String))]
        : [],
      parallelGroupId:
        typeof safeTask.parallelGroupId === 'string' &&
        safeTask.parallelGroupId.trim()
          ? safeTask.parallelGroupId
          : null,
      priority,
      completed,
      completedAt,
      createdAt,
      holdUntil,
    }
  })

  const groupCounts = normalizedTasks.reduce((counts, task) => {
    if (task.parallelGroupId) {
      counts.set(
        task.parallelGroupId,
        (counts.get(task.parallelGroupId) || 0) + 1,
      )
    }

    return counts
  }, new Map())

  return normalizedTasks.map((task) => ({
    ...task,
    dependencies: task.dependencies.filter(
      (dependencyId) => dependencyId !== task.id && knownIds.has(dependencyId),
    ),
    parallelGroupId:
      task.parallelGroupId && groupCounts.get(task.parallelGroupId) > 1
        ? task.parallelGroupId
        : null,
  }))
}

function readStoredTasks() {
  try {
    const savedTasks = localStorage.getItem(STORAGE_KEY)

    if (!savedTasks) {
      return normalizeTasks(getInitialDemoTasks())
    }

    const parsedTasks = JSON.parse(savedTasks)
    const rawTasks = Array.isArray(parsedTasks)
      ? parsedTasks
      : parsedTasks && Array.isArray(parsedTasks.tasks)
        ? parsedTasks.tasks
        : []

    return normalizeTasks(rawTasks)
  } catch {
    return []
  }
}

function writeStoredTasks(tasks) {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      version: STORAGE_VERSION,
      tasks: normalizeTasks(tasks),
    }),
  )
}

function readStorageMode() {
  try {
    return localStorage.getItem(STORAGE_MODE_KEY) === 'online'
      ? 'online'
      : 'local'
  } catch {
    return 'local'
  }
}

function writeStorageMode(storageMode) {
  localStorage.setItem(STORAGE_MODE_KEY, storageMode)
}

function readPomodoroState() {
  try {
    const savedState = localStorage.getItem(POMODORO_STORAGE_KEY)

    if (!savedState) {
      return DEFAULT_POMODORO_STATE
    }

    const parsedState = JSON.parse(savedState)
    const safeState =
      parsedState && typeof parsedState === 'object' ? parsedState : {}
    const mode = ['idle', 'work', 'work-done', 'break'].includes(safeState.mode)
      ? safeState.mode
      : DEFAULT_POMODORO_STATE.mode

    return {
      enabled:
        typeof safeState.enabled === 'boolean'
          ? safeState.enabled
          : DEFAULT_POMODORO_STATE.enabled,
      soundEnabled:
        typeof safeState.soundEnabled === 'boolean'
          ? safeState.soundEnabled
          : DEFAULT_POMODORO_STATE.soundEnabled,
      workMinutes: Number.isFinite(Number(safeState.workMinutes))
        ? Math.min(180, Math.max(1, Number(safeState.workMinutes)))
        : DEFAULT_POMODORO_STATE.workMinutes,
      breakMinutes: Number.isFinite(Number(safeState.breakMinutes))
        ? Math.min(60, Math.max(1, Number(safeState.breakMinutes)))
        : DEFAULT_POMODORO_STATE.breakMinutes,
      selectedTaskId:
        typeof safeState.selectedTaskId === 'string'
          ? safeState.selectedTaskId
          : null,
      needsTaskSelection: Boolean(safeState.needsTaskSelection),
      mode,
      startedAt: isFiniteTimestamp(safeState.startedAt)
        ? safeState.startedAt
        : null,
      finishedWorkTaskId:
        typeof safeState.finishedWorkTaskId === 'string'
          ? safeState.finishedWorkTaskId
          : null,
    }
  } catch {
    return DEFAULT_POMODORO_STATE
  }
}

function writePomodoroState(pomodoroState) {
  localStorage.setItem(POMODORO_STORAGE_KEY, JSON.stringify(pomodoroState))
}

function getPomodoroDurationMs(pomodoroState) {
  return (
    (pomodoroState.mode === 'break'
      ? pomodoroState.breakMinutes
      : pomodoroState.workMinutes) * 60000
  )
}

function getPomodoroProgress(pomodoroState, currentTime) {
  if (pomodoroState.mode === 'work-done') {
    return 1
  }

  if (!pomodoroState.startedAt) {
    return 0
  }

  return Math.min(
    1,
    Math.max(
      0,
      (currentTime - pomodoroState.startedAt) /
        getPomodoroDurationMs(pomodoroState),
    ),
  )
}

function getPomodoroFillClipPath(progress) {
  if (progress >= 0.995) {
    return 'none'
  }

  if (progress <= 0) {
    return 'polygon(50% 54%, 50% -38%, 50% -38%)'
  }

  const centerX = 50
  const centerY = 54
  const radius = 92
  const sweep = progress * 360
  const steps = Math.max(2, Math.ceil(sweep / 8))
  const points = [`${centerX}% ${centerY}%`]

  for (let index = 0; index <= steps; index += 1) {
    const angle = (-90 + (sweep * index) / steps) * (Math.PI / 180)
    const x = centerX + radius * Math.cos(angle)
    const y = centerY + radius * Math.sin(angle)

    points.push(`${x.toFixed(2)}% ${y.toFixed(2)}%`)
  }

  return `polygon(${points.join(', ')})`
}

function taskToSupabaseRow(task, userId) {
  return {
    id: task.id,
    user_id: userId,
    title: task.title,
    description: task.description,
    dependencies: getTaskDependencies(task),
    parallel_group_id: task.parallelGroupId,
    priority: getTaskPriority(task).id,
    completed: task.completed,
    completed_at: task.completedAt,
    created_at: task.createdAt,
    hold_until: task.holdUntil,
    deleted: false,
    deleted_at: null,
    updated_at: Date.now(),
  }
}

function taskToSupabaseExistingUpdateRow(task) {
  return {
    title: task.title,
    description: task.description,
    dependencies: getTaskDependencies(task),
    parallel_group_id: task.parallelGroupId,
    priority: getTaskPriority(task).id,
    created_at: task.createdAt,
    hold_until: task.holdUntil,
    updated_at: Date.now(),
  }
}

function getComparableSupabaseTask(task) {
  return {
    id: task.id,
    title: task.title,
    description: task.description,
    dependencies: getTaskDependencies(task),
    parallelGroupId: task.parallelGroupId || null,
    priority: getTaskPriority(task).id,
    completed: Boolean(task.completed),
    completedAt: task.completedAt || null,
    createdAt: task.createdAt,
    holdUntil: task.holdUntil || null,
  }
}

function serializeComparableSupabaseTask(task) {
  return JSON.stringify(getComparableSupabaseTask(task))
}

function createSupabaseTasksSnapshot(tasks) {
  return new Map(
    tasks.map((task) => [task.id, serializeComparableSupabaseTask(task)]),
  )
}

function getSupabaseTaskChanges(tasks, previousSnapshot) {
  const nextSnapshot = createSupabaseTasksSnapshot(tasks)
  const changedTasks = tasks.filter(
    (task) => previousSnapshot.get(task.id) !== nextSnapshot.get(task.id),
  )
  const removedTaskIds = [...previousSnapshot.keys()].filter(
    (taskId) => !nextSnapshot.has(taskId),
  )

  return {
    changedTasks,
    removedTaskIds,
    nextSnapshot,
  }
}

function supabaseRowToTask(row) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    dependencies: row.dependencies,
    parallelGroupId: row.parallel_group_id,
    priority: row.priority,
    completed: row.completed,
    completedAt: row.completed_at,
    createdAt: row.created_at,
    holdUntil: row.hold_until,
    deleted: Boolean(row.deleted),
    deletedAt: row.deleted_at,
  }
}

async function loadSupabaseTasks(userId) {
  const { data, error } = await supabase
    .from('tasks')
    .select(
      'id,title,description,dependencies,parallel_group_id,priority,completed,completed_at,created_at,hold_until,deleted,deleted_at',
    )
    .eq('user_id', userId)
    .eq('deleted', false)

  if (error) {
    throw error
  }

  return normalizeTasks((data || []).map(supabaseRowToTask))
}

async function saveSupabaseTasks(tasks, userId, previousSnapshot) {
  const { changedTasks, removedTaskIds, nextSnapshot } = getSupabaseTaskChanges(
    tasks,
    previousSnapshot,
  )

  if (changedTasks.length === 0 && removedTaskIds.length === 0) {
    return { nextSnapshot, changedCount: 0, removedCount: 0 }
  }

  if (removedTaskIds.length > 0) {
    const { error } = await supabase
      .from('tasks')
      .update({
        deleted: true,
        deleted_at: Date.now(),
        updated_at: Date.now(),
      })
      .eq('user_id', userId)
      .in('id', removedTaskIds)

    if (error) {
      throw error
    }
  }

  const newTasks = changedTasks.filter((task) => !previousSnapshot.has(task.id))
  const existingChangedTasks = changedTasks.filter((task) =>
    previousSnapshot.has(task.id),
  )

  for (const task of existingChangedTasks) {
    const { error } = await supabase
      .from('tasks')
      .update(taskToSupabaseExistingUpdateRow(task))
      .eq('user_id', userId)
      .eq('id', task.id)

    if (error) {
      throw error
    }
  }

  if (newTasks.length > 0) {
    const { error } = await supabase
      .from('tasks')
      .upsert(newTasks.map((task) => taskToSupabaseRow(task, userId)), {
        onConflict: 'user_id,id',
      })

    if (error) {
      throw error
    }
  }

  return {
    nextSnapshot,
    changedCount: changedTasks.length,
    removedCount: removedTaskIds.length,
  }
}

async function saveSupabaseTaskCompletion(tasks, userId, taskIds) {
  const targetTaskIds = [...taskIds]

  for (const taskId of targetTaskIds) {
    const task = tasks.find((currentTask) => currentTask.id === taskId)

    if (!task) {
      continue
    }

    const { error } = await supabase
      .from('tasks')
      .update({
        completed: Boolean(task.completed),
        completed_at: task.completedAt,
        hold_until: task.holdUntil,
        updated_at: Date.now(),
      })
      .eq('user_id', userId)
      .eq('id', task.id)

    if (error) {
      throw error
    }
  }
}

function isTaskClosed(task) {
  return Boolean(task.completed)
}

function getTaskDependencies(task) {
  return Array.isArray(task.dependencies) ? task.dependencies : []
}

function getTaskParallelGroupId(task) {
  return task &&
    typeof task.parallelGroupId === 'string' &&
    task.parallelGroupId
    ? task.parallelGroupId
    : null
}

function getParallelGroupTasks(task, allTasks) {
  const parallelGroupId = getTaskParallelGroupId(task)

  if (!parallelGroupId) {
    return [task]
  }

  const groupTasks = allTasks.filter(
    (relatedTask) => getTaskParallelGroupId(relatedTask) === parallelGroupId,
  )

  return groupTasks.length > 1 ? groupTasks : [task]
}

function compareParallelGroupTasks(firstTask, secondTask, allTasks) {
  const priorityDiff =
    getDisplayedTaskPriority(firstTask, allTasks).rank -
    getDisplayedTaskPriority(secondTask, allTasks).rank

  if (priorityDiff) {
    return priorityDiff
  }

  return firstTask.title.localeCompare(secondTask.title, 'ru-RU')
}

function getOrderedParallelGroupTasks(task, allTasks) {
  return [...getParallelGroupTasks(task, allTasks)].sort((firstTask, secondTask) =>
    compareParallelGroupTasks(firstTask, secondTask, allTasks),
  )
}

function normalizeParallelGroups(tasks) {
  const groupCounts = tasks.reduce((counts, task) => {
    if (task.parallelGroupId) {
      counts.set(task.parallelGroupId, (counts.get(task.parallelGroupId) || 0) + 1)
    }

    return counts
  }, new Map())

  return tasks.map((task) =>
    task.parallelGroupId && groupCounts.get(task.parallelGroupId) < 2
      ? { ...task, parallelGroupId: null }
      : task,
  )
}

function orderTasksWithParallelGroups(sortedTasks, allTasks) {
  const sortedTaskById = new Map(sortedTasks.map((task) => [task.id, task]))
  const seenGroupIds = new Set()
  const orderedTasks = []

  for (const task of sortedTasks) {
    const parallelGroupId = getTaskParallelGroupId(task)

    if (!parallelGroupId) {
      orderedTasks.push(task)
      continue
    }

    if (seenGroupIds.has(parallelGroupId)) {
      continue
    }

    seenGroupIds.add(parallelGroupId)
    orderedTasks.push(
      ...getOrderedParallelGroupTasks(task, allTasks).filter((groupTask) =>
        sortedTaskById.has(groupTask.id),
      ),
    )
  }

  return orderedTasks
}

function getOpenDependencyTasks(task, taskById) {
  return getTaskDependencies(task)
    .map((taskId) => taskById.get(taskId))
    .filter((dependencyTask) => dependencyTask && !dependencyTask.completed)
}

function isTaskBlockedByDependency(task, taskById) {
  return !isTaskClosed(task) && getOpenDependencyTasks(task, taskById).length > 0
}

function isTaskOnTimerHold(task, now) {
  return !isTaskClosed(task) && Boolean(task.holdUntil && task.holdUntil > now)
}

function isTaskOnHold(task, now, taskById) {
  return isTaskBlockedByDependency(task, taskById) || isTaskOnTimerHold(task, now)
}

function formatRemainingTime(holdUntil, now) {
  const totalMinutes = Math.max(0, Math.ceil((holdUntil - now) / 60000))
  const days = Math.floor(totalMinutes / 1440)
  const hours = Math.floor((totalMinutes % 1440) / 60)
  const minutes = totalMinutes % 60

  return `${days}д ${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

function formatClosedAt(timestamp) {
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(timestamp)
}

function toDatetimeLocalValue(timestamp) {
  const date = new Date(timestamp)
  const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000)

  return offsetDate.toISOString().slice(0, 16)
}

function fromDatetimeLocalValue(value) {
  return new Date(value).getTime()
}

function normalizeSearchText(value) {
  return String(value || '').trim().toLocaleLowerCase('ru-RU')
}

function getInitialTasksForStorageMode() {
  return readStorageMode() === 'online' ? [] : readStoredTasks()
}

function App() {
  const [tasks, setTasks] = useState(getInitialTasksForStorageMode)
  const [storageMode, setStorageMode] = useState(readStorageMode)
  const [session, setSession] = useState(null)
  const [authEmail, setAuthEmail] = useState('')
  const [syncStatus, setSyncStatus] = useState('idle')
  const [syncMessage, setSyncMessage] = useState('')
  const [taskText, setTaskText] = useState('')
  const [now, setNow] = useState(() => Date.now())
  const [holdEditor, setHoldEditor] = useState(null)
  const [detailEditor, setDetailEditor] = useState(null)
  const [deleteConfirmation, setDeleteConfirmation] = useState(null)
  const [pomodoroHelpOpen, setPomodoroHelpOpen] = useState(false)
  const [priorityMenuTaskId, setPriorityMenuTaskId] = useState(null)
  const [priorityMenuPosition, setPriorityMenuPosition] = useState(null)
  const [pomodoroMenuPosition, setPomodoroMenuPosition] = useState(null)
  const [pomodoro, setPomodoro] = useState(readPomodoroState)
  const [showClosedTasks, setShowClosedTasks] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [frozenTaskOrder, setFrozenTaskOrder] = useState(null)
  const holdRepeatRef = useRef(null)
  const pomodoroAudioContextRef = useRef(null)
  const pomodoroSoundEnabledRef = useRef(pomodoro.soundEnabled)
  const onlineLoadedRef = useRef(false)
  const onlineTasksSnapshotRef = useRef(new Map())
  const onlineSaveImmediatelyRef = useRef(false)
  const onlineSaveInFlightRef = useRef(false)
  const onlineSaveQueuedRef = useRef(false)
  const onlineSaveVersionRef = useRef(0)
  const onlineLatestTasksRef = useRef(tasks)
  const taskItemRefs = useRef(new Map())
  const taskItemRects = useRef(new Map())

  const taskById = useMemo(
    () => new Map(tasks.map((task) => [task.id, task])),
    [tasks],
  )
  const sessionUserId = session?.user?.id || null

  function clearHoldRepeat() {
    if (!holdRepeatRef.current) {
      return
    }

    window.clearTimeout(holdRepeatRef.current.timeoutId)
    holdRepeatRef.current = null
    setFrozenTaskOrder(null)
  }

  function closePriorityMenu() {
    setPriorityMenuTaskId(null)
    setPriorityMenuPosition(null)
  }

  function closePomodoroMenu() {
    setPomodoroMenuPosition(null)
  }

  function getPomodoroMenuPosition(event) {
    const viewportWidth = window.innerWidth
    const viewportHeight = window.innerHeight

    return {
      left: Math.min(
        Math.max(POMODORO_MENU_GAP, event.clientX),
        viewportWidth - POMODORO_MENU_WIDTH - POMODORO_MENU_GAP,
      ),
      top: Math.min(
        Math.max(POMODORO_MENU_GAP, event.clientY),
        viewportHeight - POMODORO_MENU_HEIGHT - POMODORO_MENU_GAP,
      ),
    }
  }

  function playPomodoroBeep() {
    if (!pomodoroSoundEnabledRef.current) {
      return
    }

    const AudioContext = window.AudioContext || window.webkitAudioContext

    if (!AudioContext) {
      return
    }

    const audioContext =
      pomodoroAudioContextRef.current || new AudioContext()
    pomodoroAudioContextRef.current = audioContext

    const oscillator = audioContext.createOscillator()
    const gain = audioContext.createGain()

    oscillator.type = 'sine'
    oscillator.frequency.setValueAtTime(880, audioContext.currentTime)
    gain.gain.setValueAtTime(0.0001, audioContext.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.14, audioContext.currentTime + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 0.2)

    oscillator.connect(gain)
    gain.connect(audioContext.destination)
    oscillator.start()
    oscillator.stop(audioContext.currentTime + 0.22)
  }

  function playPomodoroTickTock(tone = 'tick') {
    if (!pomodoroSoundEnabledRef.current) {
      return
    }

    const AudioContext = window.AudioContext || window.webkitAudioContext

    if (!AudioContext) {
      return
    }

    const audioContext =
      pomodoroAudioContextRef.current || new AudioContext()
    pomodoroAudioContextRef.current = audioContext

    const oscillator = audioContext.createOscillator()
    const gain = audioContext.createGain()

    oscillator.type = 'square'
    oscillator.frequency.setValueAtTime(
      tone === 'tick' ? 760 : 520,
      audioContext.currentTime,
    )
    gain.gain.setValueAtTime(0.0001, audioContext.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.055, audioContext.currentTime + 0.01)
    gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 0.08)

    oscillator.connect(gain)
    gain.connect(audioContext.destination)
    oscillator.start()
    oscillator.stop(audioContext.currentTime + 0.09)
  }

  function getPriorityMenuPosition(buttonElement) {
    const rect = buttonElement.getBoundingClientRect()
    const viewportWidth = window.innerWidth
    const viewportHeight = window.innerHeight
    const availableBelow = viewportHeight - rect.bottom
    const openUp = availableBelow < PRIORITY_MENU_HEIGHT + PRIORITY_MENU_GAP

    return {
      left: Math.min(
        Math.max(PRIORITY_MENU_GAP, rect.left),
        viewportWidth - PRIORITY_MENU_WIDTH - PRIORITY_MENU_GAP,
      ),
      top: openUp
        ? Math.max(PRIORITY_MENU_GAP, rect.top - PRIORITY_MENU_HEIGHT - PRIORITY_MENU_GAP)
        : Math.min(
            rect.bottom + PRIORITY_MENU_GAP,
            viewportHeight - PRIORITY_MENU_HEIGHT - PRIORITY_MENU_GAP,
          ),
    }
  }

  function togglePriorityMenu(taskId, buttonElement) {
    if (priorityMenuTaskId === taskId) {
      closePriorityMenu()
      return
    }

    setPriorityMenuTaskId(taskId)
    setPriorityMenuPosition(getPriorityMenuPosition(buttonElement))
  }

  function startHoldRepeat(action, taskOrder) {
    clearHoldRepeat()
    setFrozenTaskOrder(taskOrder)
    action()

    const repeatState = {
      timeoutId: null,
      interval: HOLD_REPEAT_START_MS,
    }

    function scheduleNext() {
      repeatState.timeoutId = window.setTimeout(() => {
        action()
        repeatState.interval = Math.max(
          HOLD_REPEAT_MIN_MS,
          Math.floor(repeatState.interval * HOLD_REPEAT_ACCELERATION),
        )
        scheduleNext()
      }, repeatState.interval)
    }

    repeatState.timeoutId = window.setTimeout(
      scheduleNext,
      HOLD_REPEAT_DELAY_MS,
    )
    holdRepeatRef.current = repeatState
  }

  useEffect(() => {
    const isStandalone =
      window.matchMedia?.('(display-mode: standalone)').matches ||
      window.navigator.standalone

    if (!isStandalone || typeof window.resizeTo !== 'function') {
      return
    }

    try {
      if (localStorage.getItem(WINDOW_SIZE_INITIALIZED_KEY)) {
        return
      }

      const targetWidth = Math.min(
        INITIAL_WINDOW_MAX_WIDTH,
        Math.max(INITIAL_WINDOW_MIN_WIDTH, window.outerWidth),
        window.screen.availWidth,
      )
      const targetHeight = Math.min(
        INITIAL_WINDOW_HEIGHT,
        window.screen.availHeight,
      )

      if (window.outerWidth < targetWidth || window.outerHeight < targetHeight) {
        window.resizeTo(targetWidth, targetHeight)
      }

      localStorage.setItem(WINDOW_SIZE_INITIALIZED_KEY, 'true')
    } catch {
      // Some browsers disallow programmatic resizing for PWA windows.
    }
  }, [])

  useEffect(() => {
    const timerId = window.setInterval(() => {
      const currentTime = Date.now()

      setNow(currentTime)
      setTasks((currentTasks) =>
        currentTasks.map((task) =>
          task.holdUntil && task.holdUntil <= currentTime
            ? { ...task, holdUntil: null }
            : task,
        ),
      )
    }, 1000)

    return () => window.clearInterval(timerId)
  }, [])

  useEffect(() => {
    function stopRepeat() {
      clearHoldRepeat()
    }

    document.addEventListener('mouseup', stopRepeat)
    window.addEventListener('blur', stopRepeat)

    return () => {
      document.removeEventListener('mouseup', stopRepeat)
      window.removeEventListener('blur', stopRepeat)
      clearHoldRepeat()
    }
  }, [])

  useEffect(() => {
    if (!priorityMenuTaskId) {
      return undefined
    }

    window.addEventListener('resize', closePriorityMenu)
    document.addEventListener('scroll', closePriorityMenu, true)

    return () => {
      window.removeEventListener('resize', closePriorityMenu)
      document.removeEventListener('scroll', closePriorityMenu, true)
    }
  }, [priorityMenuTaskId])

  useEffect(() => {
    if (!pomodoroMenuPosition) {
      return undefined
    }

    function closeOnEscape(event) {
      if (event.key === 'Escape') {
        closePomodoroMenu()
      }
    }

    function closeOnOutsideClick(event) {
      if (!event.target.closest('.pomodoro-menu')) {
        closePomodoroMenu()
      }
    }

    window.addEventListener('resize', closePomodoroMenu)
    document.addEventListener('scroll', closePomodoroMenu, true)
    document.addEventListener('keydown', closeOnEscape)
    document.addEventListener('mousedown', closeOnOutsideClick)

    return () => {
      window.removeEventListener('resize', closePomodoroMenu)
      document.removeEventListener('scroll', closePomodoroMenu, true)
      document.removeEventListener('keydown', closeOnEscape)
      document.removeEventListener('mousedown', closeOnOutsideClick)
    }
  }, [pomodoroMenuPosition])

  useEffect(() => {
    if (!detailEditor && !deleteConfirmation && !pomodoroHelpOpen) {
      return undefined
    }

    function closeOnEscape(event) {
      if (event.key === 'Escape') {
        if (pomodoroHelpOpen) {
          setPomodoroHelpOpen(false)
        } else if (deleteConfirmation) {
          closeDeleteConfirmation()
        } else {
          closeDetailEditor()
        }
      }
    }

    document.addEventListener('keydown', closeOnEscape)

    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [detailEditor, deleteConfirmation, pomodoroHelpOpen])

  useEffect(() => {
    writePomodoroState(pomodoro)
    pomodoroSoundEnabledRef.current = pomodoro.soundEnabled
  }, [pomodoro])

  useEffect(() => {
    if (!pomodoro.enabled) {
      return
    }

    const activeSelectedTask = tasks.find(
      (task) => task.id === pomodoro.selectedTaskId && !task.completed,
    )

    if (activeSelectedTask) {
      if (pomodoro.needsTaskSelection) {
        const timeoutId = window.setTimeout(() => {
          setPomodoro((current) => ({
            ...current,
            needsTaskSelection: false,
          }))
        }, 0)

        return () => window.clearTimeout(timeoutId)
      }

      return
    }

    if (pomodoro.mode === 'work') {
      if (pomodoro.needsTaskSelection) {
        return
      }

      const timeoutId = window.setTimeout(() => {
        setPomodoro((current) => ({
          ...current,
          selectedTaskId: null,
          needsTaskSelection: true,
        }))
      }, 0)

      return () => window.clearTimeout(timeoutId)
    }

    const firstActiveTask = tasks.find((task) => !task.completed)
    const timeoutId = window.setTimeout(() => {
      setPomodoro((current) => ({
        ...current,
        selectedTaskId: firstActiveTask?.id || null,
        needsTaskSelection: false,
        mode: 'idle',
        startedAt: null,
        finishedWorkTaskId: null,
      }))
    }, 0)

    return () => window.clearTimeout(timeoutId)
  }, [
    tasks,
    pomodoro.enabled,
    pomodoro.mode,
    pomodoro.needsTaskSelection,
    pomodoro.selectedTaskId,
  ])

  useEffect(() => {
    if (
      !pomodoro.enabled ||
      !pomodoro.startedAt ||
      !['work', 'break'].includes(pomodoro.mode)
    ) {
      return
    }

    const durationMs = getPomodoroDurationMs(pomodoro)

    if (now - pomodoro.startedAt < durationMs) {
      return
    }

    if (pomodoro.mode === 'work') {
      const timeoutId = window.setTimeout(() => {
        setPomodoro((current) => ({
          ...current,
          mode: 'work-done',
          startedAt: null,
          finishedWorkTaskId: current.selectedTaskId,
        }))
      }, 0)

      return () => window.clearTimeout(timeoutId)
    }

    const timeoutId = window.setTimeout(() => {
      setPomodoro((current) => ({
        ...current,
        mode: 'idle',
        startedAt: null,
      }))
    }, 0)

    return () => window.clearTimeout(timeoutId)
  }, [now, pomodoro])

  useEffect(() => {
    if (!pomodoro.enabled || pomodoro.mode !== 'work-done') {
      return undefined
    }

    playPomodoroBeep()
    const intervalId = window.setInterval(playPomodoroBeep, 900)

    return () => window.clearInterval(intervalId)
  }, [pomodoro.enabled, pomodoro.mode])

  useEffect(() => {
    if (
      !pomodoro.enabled ||
      pomodoro.mode !== 'work' ||
      !pomodoro.needsTaskSelection
    ) {
      return undefined
    }

    let tick = true
    playPomodoroTickTock('tick')
    const intervalId = window.setInterval(() => {
      playPomodoroTickTock(tick ? 'tock' : 'tick')
      tick = !tick
    }, 620)

    return () => window.clearInterval(intervalId)
  }, [pomodoro.enabled, pomodoro.mode, pomodoro.needsTaskSelection])

  useEffect(() => {
    if (!supabase) {
      return undefined
    }

    let mounted = true

    supabase.auth.getSession().then(({ data }) => {
      if (mounted) {
        setSession(data.session)
      }
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession((currentSession) => {
        if (currentSession?.user?.id === nextSession?.user?.id) {
          return currentSession
        }

        onlineLoadedRef.current = false
        onlineTasksSnapshotRef.current = new Map()
        onlineSaveInFlightRef.current = false
        onlineSaveQueuedRef.current = false
        onlineSaveVersionRef.current += 1

        return nextSession
      })
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    writeStorageMode(storageMode)

    if (storageMode === 'local') {
      onlineLoadedRef.current = false
      onlineTasksSnapshotRef.current = new Map()
      onlineSaveInFlightRef.current = false
      onlineSaveQueuedRef.current = false
      onlineSaveVersionRef.current += 1
    }
  }, [storageMode])

  useEffect(() => {
    if (storageMode !== 'online') {
      return
    }

    if (!supabase) {
      queueMicrotask(() => {
        setSyncStatus('error')
        setSyncMessage('Supabase не настроен')
      })
      return
    }

    if (!sessionUserId) {
      onlineLoadedRef.current = false
      onlineTasksSnapshotRef.current = new Map()
      onlineSaveInFlightRef.current = false
      onlineSaveQueuedRef.current = false
      onlineSaveVersionRef.current += 1
      queueMicrotask(() => {
        setSyncStatus('signed-out')
        setSyncMessage('Войдите, чтобы загрузить онлайн-задачи')
      })
      return
    }

    let cancelled = false

    async function loadOnlineTasks() {
      try {
        setSyncStatus('loading')
        setSyncMessage('Загрузка онлайн-задач')

        const onlineTasks = await loadSupabaseTasks(sessionUserId)

        if (cancelled) {
          return
        }

        onlineTasksSnapshotRef.current = createSupabaseTasksSnapshot(onlineTasks)
        onlineLoadedRef.current = true
        setTasks(onlineTasks)
        setSyncStatus('synced')
        setSyncMessage('Онлайн-задачи загружены')
      } catch (error) {
        if (!cancelled) {
          setSyncStatus('error')
          setSyncMessage(error.message || 'Не удалось загрузить онлайн-задачи')
        }
      }
    }

    loadOnlineTasks()

    return () => {
      cancelled = true
    }
  }, [storageMode, sessionUserId])

  useEffect(() => {
    onlineLatestTasksRef.current = tasks
    onlineSaveVersionRef.current += 1

    if (storageMode === 'local') {
      onlineSaveImmediatelyRef.current = false
      writeStoredTasks(tasks)
      return
    }

    if (
      storageMode !== 'online' ||
      !supabase ||
      !sessionUserId ||
      !onlineLoadedRef.current
    ) {
      return
    }

    const pendingChanges = getSupabaseTaskChanges(
      tasks,
      onlineTasksSnapshotRef.current,
    )

    if (
      pendingChanges.changedTasks.length === 0 &&
      pendingChanges.removedTaskIds.length === 0
    ) {
      onlineSaveImmediatelyRef.current = false
      return
    }

    let cancelled = false
    const saveImmediately = onlineSaveImmediatelyRef.current
    const scheduledSaveVersion = onlineSaveVersionRef.current
    onlineSaveImmediatelyRef.current = false

    async function persistOnlineTasks(expectedSaveVersion) {
      if (expectedSaveVersion !== onlineSaveVersionRef.current) {
        return
      }

      if (onlineSaveInFlightRef.current) {
        onlineSaveQueuedRef.current = true
        onlineSaveVersionRef.current += 1
        return
      }

      onlineSaveInFlightRef.current = true

      try {
        if (!cancelled) {
          setSyncStatus('saving')
          setSyncMessage('Сохранение онлайн')
        }

        const saveResult = await saveSupabaseTasks(
          onlineLatestTasksRef.current,
          sessionUserId,
          onlineTasksSnapshotRef.current,
        )

        if (storageMode === 'online') {
          onlineTasksSnapshotRef.current = saveResult.nextSnapshot

          if (!cancelled) {
            setSyncStatus('synced')
            setSyncMessage('Онлайн-сохранение выполнено')
          }
        }
      } catch (error) {
        if (!cancelled) {
          setSyncStatus('error')
          setSyncMessage(error.message || 'Не удалось сохранить онлайн-задачи')
        }
      } finally {
        onlineSaveInFlightRef.current = false

        if (
          onlineSaveQueuedRef.current &&
          storageMode === 'online'
        ) {
          onlineSaveQueuedRef.current = false
          persistOnlineTasks(onlineSaveVersionRef.current)
        }
      }
    }

    setSyncStatus('saving')
    setSyncMessage('Онлайн-сохранение ожидает паузы в изменениях')

    if (saveImmediately) {
      persistOnlineTasks(scheduledSaveVersion)

      return () => {
        cancelled = true
      }
    }

    const timeoutId = window.setTimeout(() => {
      persistOnlineTasks(scheduledSaveVersion)
    }, ONLINE_SAVE_DEBOUNCE_MS)

    return () => {
      cancelled = true
      window.clearTimeout(timeoutId)
    }
  }, [tasks, storageMode, sessionUserId])

  const visibleTasks = useMemo(() => {
    const activeTasks = []
    const dependencyHoldTasks = []
    const timerHoldTasks = []
    const closedTasks = []
    const normalizedSearchQuery = normalizeSearchText(searchQuery)

    function taskMatchesSearch(task) {
      if (!normalizedSearchQuery) {
        return true
      }

      const relatedTaskTitles = [
        ...getTaskDependencies(task)
          .map((taskId) => taskById.get(taskId)?.title)
          .filter(Boolean),
        ...tasks
          .filter((relatedTask) =>
            getTaskDependencies(relatedTask).includes(task.id),
          )
          .map((relatedTask) => relatedTask.title),
        ...getParallelGroupTasks(task, tasks)
          .filter((relatedTask) => relatedTask.id !== task.id)
          .map((relatedTask) => relatedTask.title),
      ]

      return normalizeSearchText(
        [task.title, task.description, ...relatedTaskTitles].join(' '),
      ).includes(normalizedSearchQuery)
    }

    function getOpenParallelGroupTasks(task) {
      return getParallelGroupTasks(task, tasks).filter(
        (groupTask) => !isTaskClosed(groupTask),
      )
    }

    function isParallelGroupBlocked(task) {
      return getOpenParallelGroupTasks(task).some((groupTask) =>
        isTaskBlockedByDependency(groupTask, taskById),
      )
    }

    function getParallelGroupHoldUntil(task) {
      const holdUntil = Math.max(
        ...getOpenParallelGroupTasks(task).map((groupTask) =>
          groupTask.holdUntil && groupTask.holdUntil > now
            ? groupTask.holdUntil
            : 0,
        ),
      )

      return holdUntil > 0 ? holdUntil : null
    }

    for (const task of tasks) {
      if (!taskMatchesSearch(task)) {
        continue
      }

      if (isTaskClosed(task)) {
        closedTasks.push(task)
      } else if (isParallelGroupBlocked(task)) {
        dependencyHoldTasks.push(task)
      } else if (getParallelGroupHoldUntil(task)) {
        timerHoldTasks.push(task)
      } else {
        activeTasks.push(task)
      }
    }

    activeTasks.sort((firstTask, secondTask) => {
      const priorityDiff =
        getDisplayedTaskPriority(firstTask, tasks).rank -
        getDisplayedTaskPriority(secondTask, tasks).rank

      return priorityDiff || secondTask.createdAt - firstTask.createdAt
    })
    dependencyHoldTasks.sort((firstTask, secondTask) => {
      const priorityDiff =
        getTaskPriority(firstTask).rank - getTaskPriority(secondTask).rank

      return priorityDiff || secondTask.createdAt - firstTask.createdAt
    })
    timerHoldTasks.sort((firstTask, secondTask) => {
      const firstHoldUntil = getParallelGroupHoldUntil(firstTask) || 0
      const secondHoldUntil = getParallelGroupHoldUntil(secondTask) || 0

      return firstHoldUntil - secondHoldUntil
    })
    closedTasks.sort(
      (firstTask, secondTask) =>
        (secondTask.completedAt || 0) - (firstTask.completedAt || 0),
    )

    const openTasks = [...activeTasks, ...dependencyHoldTasks, ...timerHoldTasks]

    const groupedOpenTasks = orderTasksWithParallelGroups(openTasks, tasks)
    const groupedClosedTasks = orderTasksWithParallelGroups(closedTasks, tasks)
    const sortedTasks = showClosedTasks
      ? [...groupedOpenTasks, ...groupedClosedTasks]
      : groupedOpenTasks

    if (!frozenTaskOrder) {
      return sortedTasks
    }

    const sortedTaskById = new Map(sortedTasks.map((task) => [task.id, task]))
    const frozenTasks = frozenTaskOrder
      .map((taskId) => sortedTaskById.get(taskId))
      .filter(Boolean)
    const newTasks = sortedTasks.filter((task) => !frozenTaskOrder.includes(task.id))

    return [...frozenTasks, ...newTasks]
  }, [tasks, now, showClosedTasks, taskById, frozenTaskOrder, searchQuery])

  const completedCount = useMemo(
    () => tasks.filter((task) => task.completed).length,
    [tasks],
  )
  const activeCount = useMemo(
    () => tasks.filter((task) => !task.completed).length,
    [tasks],
  )

  function switchStorageMode(nextStorageMode) {
    if (nextStorageMode === storageMode) {
      return
    }

    closePriorityMenu()
    setDetailEditor(null)
    setDeleteConfirmation(null)
    onlineLoadedRef.current = false
    onlineTasksSnapshotRef.current = new Map()

    if (nextStorageMode === 'local') {
      setTasks(readStoredTasks())
      setSyncStatus('idle')
      setSyncMessage('')
    }

    setStorageMode(nextStorageMode)
  }

  async function signInOnline(event) {
    event.preventDefault()

    if (!supabase || !authEmail.trim()) {
      return
    }

    try {
      setSyncStatus('loading')
      setSyncMessage('Отправляем ссылку для входа')

      const { error } = await supabase.auth.signInWithOtp({
        email: authEmail.trim(),
        options: {
          emailRedirectTo: window.location.href,
        },
      })

      if (error) {
        throw error
      }

      setSyncStatus('signed-out')
      setSyncMessage('Проверьте почту и откройте ссылку для входа')
    } catch (error) {
      setSyncStatus('error')
      setSyncMessage(error.message || 'Не удалось отправить ссылку для входа')
    }
  }

  async function signOutOnline() {
    if (!supabase) {
      return
    }

    await supabase.auth.signOut()
    setSession(null)
    onlineLoadedRef.current = false
    onlineTasksSnapshotRef.current = new Map()
    setTasks(readStoredTasks())
    setStorageMode('local')
  }

  async function migrateLocalTasksOnline() {
    if (!supabase || !session) {
      return
    }

    try {
      setSyncStatus('saving')
      setSyncMessage('Переносим локальные задачи в онлайн')

      const localTasks = readStoredTasks()
      const saveResult = await saveSupabaseTasks(
        localTasks,
        session.user.id,
        onlineTasksSnapshotRef.current,
      )

      onlineTasksSnapshotRef.current = saveResult.nextSnapshot
      onlineLoadedRef.current = true
      setTasks(localTasks)
      setSyncStatus('synced')
      setSyncMessage('Локальные задачи перенесены в онлайн')
    } catch (error) {
      setSyncStatus('error')
      setSyncMessage(error.message || 'Не удалось перенести задачи')
    }
  }

  useLayoutEffect(() => {
    const nextRects = new Map()

    for (const [taskId, element] of taskItemRefs.current) {
      nextRects.set(taskId, element.getBoundingClientRect())
    }

    for (const [taskId, nextRect] of nextRects) {
      const previousRect = taskItemRects.current.get(taskId)
      const element = taskItemRefs.current.get(taskId)

      if (!previousRect || !element) {
        continue
      }

      const deltaX = previousRect.left - nextRect.left
      const deltaY = previousRect.top - nextRect.top

      if (Math.abs(deltaX) < 1 && Math.abs(deltaY) < 1) {
        continue
      }

      element.style.transition = 'none'
      element.style.transform = `translate(${deltaX}px, ${deltaY}px)`

      window.requestAnimationFrame(() => {
        element.style.transition = 'transform 180ms ease'
        element.style.transform = ''
      })
    }

    taskItemRects.current = nextRects
  }, [visibleTasks])

  function addTask(event) {
    event.preventDefault()

    const title = taskText.trim()

    if (!title) {
      return
    }

    setTasks((currentTasks) => [
      {
        id: getStableTaskId(),
        title,
        description: '',
        dependencies: [],
        parallelGroupId: null,
        priority: DEFAULT_PRIORITY,
        completed: false,
        completedAt: null,
        createdAt: Date.now(),
        holdUntil: null,
      },
      ...currentTasks,
    ])
    setTaskText('')
  }

  function toggleTask(taskId) {
    let nextTasksForOnlineSave = null
    let affectedTaskIdsForOnlineSave = new Set()

    onlineSaveImmediatelyRef.current = false
    setTasks((currentTasks) => {
      const targetTask = currentTasks.find(
        (currentTask) => currentTask.id === taskId,
      )
      const affectedTaskIds = new Set(
        targetTask
          ? getParallelGroupTasks(targetTask, currentTasks).map(
              (groupTask) => groupTask.id,
            )
          : [taskId],
      )

      affectedTaskIdsForOnlineSave = affectedTaskIds

      const nextTasks = normalizeParallelGroups(
        currentTasks.map((task) => {
          if (!affectedTaskIds.has(task.id)) {
            return task
          }

          if (targetTask?.completed) {
            return { ...task, completed: false, completedAt: null }
          }

          return {
            ...task,
            completed: true,
            completedAt: Date.now(),
            holdUntil: null,
          }
        }),
      )

      nextTasksForOnlineSave = nextTasks
      onlineLatestTasksRef.current = nextTasks

      return nextTasks
    })

    if (
      storageMode === 'online' &&
      supabase &&
      sessionUserId &&
      onlineLoadedRef.current &&
      nextTasksForOnlineSave
    ) {
      setSyncStatus('saving')
      setSyncMessage('Сохранение онлайн')

      saveSupabaseTaskCompletion(
        nextTasksForOnlineSave,
        sessionUserId,
        affectedTaskIdsForOnlineSave,
      )
        .then(() => {
          const nextSnapshot = new Map(onlineTasksSnapshotRef.current)

          for (const taskId of affectedTaskIdsForOnlineSave) {
            const task = nextTasksForOnlineSave.find(
              (currentTask) => currentTask.id === taskId,
            )

            if (task) {
              nextSnapshot.set(task.id, serializeComparableSupabaseTask(task))
            }
          }

          onlineTasksSnapshotRef.current = nextSnapshot
          onlineSaveVersionRef.current += 1
          setSyncStatus('synced')
          setSyncMessage('Онлайн-сохранение выполнено')
        })
        .catch((error) => {
          setSyncStatus('error')
          setSyncMessage(
            error.message || 'Не удалось сохранить онлайн-задачи',
          )
        })
    }
  }

  function addHoldStep(taskId) {
    setTasks((currentTasks) => {
      const targetTask = currentTasks.find((task) => task.id === taskId)
      const affectedTaskIds = new Set(
        targetTask
          ? getParallelGroupTasks(targetTask, currentTasks).map((task) => task.id)
          : [taskId],
      )
      const nextHoldUntil =
        Math.max(
          ...currentTasks
            .filter((task) => affectedTaskIds.has(task.id))
            .map((task) => task.holdUntil || 0),
          Date.now(),
        ) + HOLD_STEP_MS

      return currentTasks.map((task) => {
        if (!affectedTaskIds.has(task.id) || task.completed) {
          return task
        }

        return {
          ...task,
          holdUntil: nextHoldUntil,
        }
      })
    })
  }

  function reduceHoldStep(taskId) {
    setTasks((currentTasks) => {
      const targetTask = currentTasks.find((task) => task.id === taskId)
      const affectedTaskIds = new Set(
        targetTask
          ? getParallelGroupTasks(targetTask, currentTasks).map((task) => task.id)
          : [taskId],
      )
      const currentHoldUntil = Math.max(
        ...currentTasks
          .filter((task) => affectedTaskIds.has(task.id))
          .map((task) => task.holdUntil || 0),
      )
      const nextHoldUntil = currentHoldUntil - HOLD_STEP_MS

      return currentTasks.map((task) => {
        if (
          !affectedTaskIds.has(task.id) ||
          task.completed ||
          !currentHoldUntil
        ) {
          return task
        }

        return {
          ...task,
          holdUntil: nextHoldUntil > Date.now() ? nextHoldUntil : null,
        }
      })
    })
  }

  function updateTaskHold(taskId, holdUntil) {
    setTasks((currentTasks) => {
      const targetTask = currentTasks.find((task) => task.id === taskId)
      const affectedTaskIds = new Set(
        targetTask
          ? getParallelGroupTasks(targetTask, currentTasks).map((task) => task.id)
          : [taskId],
      )

      return currentTasks.map((task) =>
        affectedTaskIds.has(task.id) && !task.completed
          ? { ...task, holdUntil }
          : task,
      )
    })
  }

  function updateTaskPriority(taskId, priority) {
    setTasks((currentTasks) =>
      currentTasks.map((task) =>
        task.id === taskId && !task.completed ? { ...task, priority } : task,
      ),
    )
    closePriorityMenu()
  }

  function applyDetailRelationships(nextRelationships) {
    setTasks((currentTasks) => {
      const selectedParallelTaskIds = new Set(
        nextRelationships
          .filter((relation) => relation.type === 'parallel')
          .map((relation) => relation.taskId),
      )
      const editedTask = currentTasks.find(
        (task) => task.id === detailEditor.taskId,
      )
      const currentParallelGroupId = getTaskParallelGroupId(editedTask)
      const selectedParallelGroupIds = new Set(
        currentTasks
          .filter(
            (task) =>
              selectedParallelTaskIds.has(task.id) &&
              getTaskParallelGroupId(task),
          )
          .map((task) => getTaskParallelGroupId(task)),
      )
      const nextParallelGroupId =
        selectedParallelTaskIds.size > 0
          ? currentParallelGroupId ||
            selectedParallelGroupIds.values().next().value ||
            `parallel-${getStableTaskId()}`
          : null

      return normalizeParallelGroups(currentTasks.map((task) => {
        if (task.id === detailEditor.taskId && !task.completed) {
          return {
            ...task,
            dependencies: nextRelationships
              .filter((relation) => relation.type === 'depends-on')
              .map((relation) => relation.taskId),
            parallelGroupId: nextParallelGroupId,
          }
        }

        if (task.completed) {
          return task
        }

        const taskParallelGroupId = getTaskParallelGroupId(task)
        const belongsToSelectedParallelGroup =
          taskParallelGroupId && selectedParallelGroupIds.has(taskParallelGroupId)
        const belongsToCurrentParallelGroup =
          taskParallelGroupId && taskParallelGroupId === currentParallelGroupId

        const taskDependencies = getTaskDependencies(task).filter(
          (dependencyId) => dependencyId !== detailEditor.taskId,
        )
        const isBlockedByEditedTask = nextRelationships.some(
          (relation) =>
            relation.type === 'blocks' && relation.taskId === task.id,
        )

        return {
          ...task,
          dependencies: isBlockedByEditedTask
            ? [...taskDependencies, detailEditor.taskId]
            : taskDependencies,
          parallelGroupId:
            selectedParallelTaskIds.has(task.id) || belongsToSelectedParallelGroup
              ? nextParallelGroupId
              : belongsToCurrentParallelGroup
                ? null
                : task.parallelGroupId,
        }
      }))
    })
  }

  function updateDetailTaskField(field, value) {
    setDetailEditor((current) => ({
      ...current,
      [field]: value,
    }))

    if (field === 'title' && !value.trim()) {
      return
    }

    setTasks((currentTasks) =>
      currentTasks.map((task) =>
        task.id === detailEditor.taskId && !task.completed
          ? {
              ...task,
              [field]: field === 'title' ? value.trim() : value,
            }
          : task,
      ),
    )
  }

  function requestDeleteTask(task) {
    setDeleteConfirmation({
      taskId: task.id,
      title: task.title,
    })
  }

  function closeDeleteConfirmation() {
    setDeleteConfirmation(null)
  }

  function confirmDeleteTask() {
    const taskId = deleteConfirmation.taskId

    setTasks((currentTasks) =>
      normalizeParallelGroups(
        currentTasks
          .filter((task) => task.id !== taskId)
          .map((task) => ({
          ...task,
          dependencies: getTaskDependencies(task).filter(
            (dependencyId) => dependencyId !== taskId,
          ),
          })),
      ),
    )
    closeDeleteConfirmation()
  }

  function handleDeleteConfirmationSubmit(event) {
    event.preventDefault()
    confirmDeleteTask()
  }

  function handleDeleteBackdropMouseDown(event) {
    if (event.target === event.currentTarget) {
      closeDeleteConfirmation()
    }
  }

  function addDetailRelation() {
    if (!detailEditor.selectedLinkedTaskId) {
      return
    }

    const selectedRelationTask = taskById.get(detailEditor.selectedLinkedTaskId)
    const addedRelations =
      detailEditor.selectedRelationType === 'parallel' && selectedRelationTask
        ? getParallelGroupTasks(selectedRelationTask, tasks)
            .filter((task) => task.id !== detailEditor.taskId)
            .map((task) => ({
              type: 'parallel',
              taskId: task.id,
            }))
        : [
            {
              type: detailEditor.selectedRelationType,
              taskId: detailEditor.selectedLinkedTaskId,
            },
          ]
    const nextRelationships = [
      ...detailEditor.relationships,
      ...addedRelations.filter(
        (addedRelation) =>
          !detailEditor.relationships.some(
            (relation) =>
              relation.type === addedRelation.type &&
              relation.taskId === addedRelation.taskId,
          ),
      ),
    ]

    applyDetailRelationships(nextRelationships)
    setDetailEditor((current) => ({
      ...current,
      relationships: nextRelationships,
      selectedLinkedTaskId: '',
    }))
  }

  function removeDetailRelation(taskId, relationType) {
    const nextRelationships = detailEditor.relationships.filter(
      (relation) =>
        relation.taskId !== taskId || relation.type !== relationType,
    )

    applyDetailRelationships(nextRelationships)
    setDetailEditor((current) => ({
      ...current,
      relationships: nextRelationships,
    }))
  }

  function closeDetailEditor() {
    setDetailEditor(null)
  }

  function handleDetailSubmit(event) {
    event.preventDefault()
  }

  function handleDetailBackdropMouseDown(event) {
    if (event.target === event.currentTarget) {
      closeDetailEditor()
    }
  }

  function handleTaskContextMenu(event, task) {
    if (
      event.target.closest(
        'button, input, .hold-timer, .dependency-reason, .closed-date, .priority-cell, .pomodoro-task-cell',
      )
    ) {
      return
    }

    if (task.completed) {
      event.preventDefault()
      return
    }

    event.preventDefault()
  }

  function handleTaskMouseDown(event, task) {
    if (
      event.button !== 2 ||
      event.target.closest(
        'button, input, .hold-timer, .dependency-reason, .closed-date, .priority-cell, .pomodoro-task-cell',
      )
    ) {
      return
    }

    event.preventDefault()

    if (task.completed) {
      return
    }

    startHoldRepeat(
      () => addHoldStep(task.id),
      visibleTasks.map((visibleTask) => visibleTask.id),
    )
  }

  function openHoldEditor(event, task) {
    event.preventDefault()
    event.stopPropagation()

    if (task.completed) {
      return
    }

    const holdUntil = task.holdUntil || Date.now() + HOLD_STEP_MS

    setHoldEditor({
      taskId: task.id,
      value: toDatetimeLocalValue(holdUntil),
    })
  }

  function saveHoldEditor(event) {
    event.preventDefault()

    const holdUntil = fromDatetimeLocalValue(holdEditor.value)

    if (!Number.isNaN(holdUntil)) {
      updateTaskHold(holdEditor.taskId, Math.max(holdUntil, Date.now()))
    }

    setHoldEditor(null)
  }

  function getPomodoroTaskState(task) {
    if (!pomodoro.enabled) {
      return null
    }

    if (pomodoro.mode === 'work' && task.id === pomodoro.selectedTaskId) {
      return 'red'
    }

    if (
      pomodoro.finishedWorkTaskId &&
      task.id === pomodoro.finishedWorkTaskId &&
      pomodoro.mode !== 'work'
    ) {
      return 'yellow'
    }

    if (task.id === pomodoro.selectedTaskId) {
      return 'green'
    }

    return null
  }

  function getPomodoroNeedsTaskSelection() {
    return (
      pomodoro.enabled &&
      pomodoro.mode === 'work' &&
      pomodoro.needsTaskSelection
    )
  }

  function getPomodoroTaskImage(taskState) {
    if (taskState === 'red') {
      return pomodoroTaskRedImage
    }

    if (taskState === 'yellow') {
      return pomodoroTaskYellowImage
    }

    return pomodoroTaskGreenImage
  }

  function handlePomodoroClick() {
    closePomodoroMenu()

    if (!pomodoro.enabled) {
      setPomodoro((current) => ({
        ...current,
        enabled: true,
        needsTaskSelection: false,
      }))
      return
    }

    if (pomodoro.mode === 'work-done') {
      setPomodoro((current) => ({
        ...current,
        mode: 'break',
        startedAt: Date.now(),
      }))
      return
    }

    if (pomodoro.mode !== 'idle' || !pomodoro.selectedTaskId) {
      return
    }

    const AudioContext = window.AudioContext || window.webkitAudioContext

    if (AudioContext && !pomodoroAudioContextRef.current) {
      pomodoroAudioContextRef.current = new AudioContext()
    }

    pomodoroAudioContextRef.current?.resume?.()
    setPomodoro((current) => ({
      ...current,
      mode: 'work',
      startedAt: Date.now(),
      needsTaskSelection: false,
      finishedWorkTaskId: null,
    }))
  }

  function handlePomodoroContextMenu(event) {
    event.preventDefault()
    event.stopPropagation()
    closePriorityMenu()
    setPomodoroMenuPosition(getPomodoroMenuPosition(event))
  }

  function updatePomodoroSettings(field, value) {
    const numericValue = Number(value)
    const maxValue = field === 'breakMinutes' ? 60 : 180

    setPomodoro((current) => ({
      ...current,
      [field]: Number.isFinite(numericValue)
        ? Math.min(maxValue, Math.max(1, Math.round(numericValue)))
        : current[field],
    }))
  }

  function togglePomodoroEnabled() {
    setPomodoro((current) => ({
      ...current,
      enabled: !current.enabled,
      mode: 'idle',
      startedAt: null,
      needsTaskSelection: false,
      finishedWorkTaskId: current.enabled ? null : current.finishedWorkTaskId,
    }))
  }

  function togglePomodoroSound() {
    setPomodoro((current) => ({
      ...current,
      soundEnabled: !current.soundEnabled,
    }))
  }

  function handlePomodoroDragStart(event, task) {
    if (
      !pomodoro.enabled ||
      task.completed ||
      (!getPomodoroTaskState(task) && !pomodoroNeedsTaskSelection)
    ) {
      event.preventDefault()
      return
    }

    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', task.id)
  }

  function handlePomodoroDragOver(event, task) {
    if (!pomodoro.enabled || task.completed) {
      return
    }

    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
  }

  function handlePomodoroDrop(event, task) {
    if (!pomodoro.enabled || task.completed) {
      return
    }

    event.preventDefault()
    setPomodoro((current) => ({
      ...current,
      selectedTaskId: task.id,
      needsTaskSelection: false,
      finishedWorkTaskId:
        current.mode === 'work' ? current.finishedWorkTaskId : null,
    }))
  }

  function openPomodoroHelp() {
    closePomodoroMenu()
    setPomodoroHelpOpen(true)
  }

  function openDetailEditor(event, task) {
    if (
      event.target.closest('button, input, .priority-menu')
    ) {
      return
    }

    closePriorityMenu()
    setDetailEditor({
      taskId: task.id,
      title: task.title,
      priority: getTaskPriority(task).id,
      description: task.description || '',
      readonly: task.completed,
      relationships: [
        ...getTaskDependencies(task).map((taskId) => ({
          type: 'depends-on',
          taskId,
        })),
        ...tasks
          .filter(
            (relatedTask) =>
              !relatedTask.completed &&
              getTaskDependencies(relatedTask).includes(task.id),
          )
          .map((relatedTask) => ({
            type: 'blocks',
            taskId: relatedTask.id,
          })),
        ...getParallelGroupTasks(task, tasks)
          .filter((relatedTask) => relatedTask.id !== task.id)
          .map((relatedTask) => ({
            type: 'parallel',
            taskId: relatedTask.id,
          })),
      ],
      selectedRelationType: 'depends-on',
      selectedLinkedTaskId: '',
    })
  }

  function getDependencyReason(task) {
    const openDependencies = [
      ...new Map(
        getParallelGroupTasks(task, tasks)
          .flatMap((groupTask) => getOpenDependencyTasks(groupTask, taskById))
          .map((dependencyTask) => [dependencyTask.id, dependencyTask]),
      ).values(),
    ]
    const firstDependency = openDependencies[0]

    if (!firstDependency) {
      return null
    }

    return {
      title: firstDependency.title,
      extraCount: openDependencies.length - 1,
    }
  }

  const detailLinkedTaskOptions = detailEditor
    ? tasks.filter(
        (task) =>
          !task.completed &&
          task.id !== detailEditor.taskId &&
          !detailEditor.relationships.some(
            (relation) => relation.taskId === task.id,
          ),
      )
    : []

  const detailRelationships = detailEditor
    ? detailEditor.relationships
        .map((relation) => ({
          ...relation,
          task: taskById.get(relation.taskId),
          relationType: getRelationType(relation.type),
        }))
        .filter((relation) => relation.task)
    : []

  const priorityMenuTask = priorityMenuTaskId
    ? taskById.get(priorityMenuTaskId)
    : null
  const priorityMenuTaskPriority = priorityMenuTask
    ? getTaskPriority(priorityMenuTask)
    : null
  const pomodoroProgress = getPomodoroProgress(pomodoro, now)
  const pomodoroFillClipPath = getPomodoroFillClipPath(pomodoroProgress)
  const pomodoroNeedsTaskSelection = getPomodoroNeedsTaskSelection()
  const pomodoroImage =
    pomodoro.mode === 'break' ? pomodoroBreakImage : pomodoroWorkImage
  const pomodoroMinutes =
    pomodoro.mode === 'break' ? pomodoro.breakMinutes : pomodoro.workMinutes
  const pomodoroRemainingMs =
    pomodoro.startedAt && pomodoro.mode !== 'work-done'
      ? Math.max(
          0,
          getPomodoroDurationMs(pomodoro) - (now - pomodoro.startedAt),
        )
      : getPomodoroDurationMs(pomodoro)
  const pomodoroRemainingTotalSeconds = Math.ceil(pomodoroRemainingMs / 1000)
  const pomodoroRemainingMinutes = Math.floor(
    pomodoroRemainingTotalSeconds / 60,
  )
  const pomodoroRemainingSeconds = pomodoroRemainingTotalSeconds % 60
  const pomodoroTimeLabel =
    pomodoro.mode === 'work-done'
      ? '00:00'
      : `${String(pomodoroRemainingMinutes).padStart(2, '0')}:${String(
          pomodoroRemainingSeconds,
        ).padStart(2, '0')}`

  return (
    <main className="app">
      <section className="task-panel" aria-labelledby="task-manager-title">
        <header className="task-header">
          <div>
            <p className="eyebrow">Task Manager</p>
            <h1 id="task-manager-title">Мои задачи</h1>
          </div>
          <div className="task-search">
            <label className="sr-only" htmlFor="task-search-input">
              Поиск задач
            </label>
            <input
              id="task-search-input"
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Поиск по задачам"
              autoComplete="off"
            />
          </div>
          <div className="task-stats" aria-label="Статистика задач">
            <button
              className="completed-toggle"
              data-state={showClosedTasks ? 'shown' : 'hidden'}
              type="button"
              onClick={() => setShowClosedTasks((current) => !current)}
              aria-pressed={showClosedTasks}
              title={
                showClosedTasks
                  ? 'Скрыть закрытые задачи'
                  : 'Показать закрытые задачи'
              }
            >
              {completedCount} выполнено
            </button>
            <span>{activeCount} активных</span>
          </div>
          <button
            className={[
              'pomodoro-widget',
              pomodoro.enabled ? '' : 'disabled',
              pomodoro.mode === 'break' ? 'break' : '',
              pomodoro.mode === 'work-done' ? 'done' : '',
              pomodoroNeedsTaskSelection ? 'needs-task' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            type="button"
            onClick={handlePomodoroClick}
            onContextMenu={handlePomodoroContextMenu}
            style={{
              '--pomodoro-progress': `${pomodoroProgress * 360}deg`,
              '--pomodoro-brightness': 0.42 + pomodoroProgress * 0.9,
              '--pomodoro-saturation': 0.72 + pomodoroProgress * 0.55,
            }}
            aria-label={
              pomodoro.enabled
                ? `Pomodoro: ${pomodoroTimeLabel}, ${pomodoroMinutes} минут`
                : 'Pomodoro выключен'
            }
            title="Левый клик - старт или перерыв. Правый клик - настройки."
          >
            {pomodoroNeedsTaskSelection ? (
              <span
                className="pomodoro-task-alert"
                draggable
                onDragStart={(event) => {
                  event.dataTransfer.effectAllowed = 'move'
                  event.dataTransfer.setData('text/plain', 'pomodoro-alert')
                }}
                title="Перетащите на незавершенную задачу."
              >
                <img src={pomodoroTaskRedImage} alt="" />
                <img src={pomodoroTaskYellowImage} alt="" />
                <img src={pomodoroTaskGreenImage} alt="" />
              </span>
            ) : null}
            <span className="pomodoro-tomato">
              <img className="pomodoro-tomato-dim" src={pomodoroImage} alt="" />
              <img
                className="pomodoro-tomato-fill"
                src={pomodoroImage}
                alt=""
                style={{
                  clipPath: pomodoroFillClipPath,
                  WebkitClipPath: pomodoroFillClipPath,
                }}
              />
            </span>
            {pomodoro.enabled ? (
              <span className="pomodoro-time">{pomodoroTimeLabel}</span>
            ) : null}
          </button>
        </header>

        <section className="storage-panel" aria-label="Режим хранения задач">
          <div className="storage-toggle" role="group" aria-label="Режим хранения">
            <button
              type="button"
              data-state={storageMode === 'local' ? 'active' : 'idle'}
              onClick={() => switchStorageMode('local')}
            >
              Локально
            </button>
            <button
              className="online-mode-button"
              type="button"
              data-state={storageMode === 'online' ? 'active' : 'idle'}
              onClick={() => switchStorageMode('online')}
            >
              {storageMode === 'online' ? (
                <span
                  className={`sync-dot ${syncStatus}`}
                  aria-label={syncMessage || 'Статус онлайн-синхронизации'}
                  tabIndex={0}
                >
                  <span className="sync-popover" role="status">
                    {syncMessage || 'Онлайн-режим'}
                  </span>
                </span>
              ) : null}
              Онлайн
            </button>
          </div>

          <span className="storage-status">
            {storageMode === 'local'
              ? 'Данные хранятся в этом браузере'
              : session?.user?.email || 'Онлайн-режим'}
          </span>

          {storageMode === 'online' && !supabase ? (
            <span className="storage-warning">Supabase env не настроены</span>
          ) : null}

          {storageMode === 'online' && supabase && !session ? (
            <form className="auth-form" onSubmit={signInOnline}>
              <label className="sr-only" htmlFor="auth-email">
                Email для входа
              </label>
              <input
                id="auth-email"
                type="email"
                value={authEmail}
                onChange={(event) => setAuthEmail(event.target.value)}
                placeholder="email для входа"
                autoComplete="email"
              />
              <button type="submit" disabled={!authEmail.trim()}>
                Войти
              </button>
            </form>
          ) : null}

          {storageMode === 'online' && session ? (
            <div className="online-actions">
              <button type="button" onClick={migrateLocalTasksOnline}>
                Перенести локальные
              </button>
              <button type="button" onClick={signOutOnline}>
                Выйти
              </button>
            </div>
          ) : null}
        </section>

        <form className="task-form" onSubmit={addTask}>
          <label className="sr-only" htmlFor="task-input">
            Новая задача
          </label>
          <input
            id="task-input"
            type="text"
            value={taskText}
            onChange={(event) => setTaskText(event.target.value)}
            placeholder="Например: подготовить отчет"
            autoComplete="off"
          />
          <button type="submit">Добавить</button>
        </form>

        {visibleTasks.length > 0 ? (
          <ul className="task-list" aria-label="Список задач">
            {visibleTasks.map((task) => {
              const dependencyReason = getDependencyReason(task)
              const dependencyHold = Boolean(dependencyReason)
              const parallelGroupTasks = getParallelGroupTasks(task, tasks)
              const orderedParallelGroupTasks = getOrderedParallelGroupTasks(
                task,
                tasks,
              )
              const parallelGroupIndex = orderedParallelGroupTasks.findIndex(
                (groupTask) => groupTask.id === task.id,
              )
              const parallelGroupHoldUntil = Math.max(
                ...parallelGroupTasks.map((groupTask) =>
                  groupTask.holdUntil && groupTask.holdUntil > now
                    ? groupTask.holdUntil
                    : 0,
                ),
              )
              const onHold =
                dependencyHold ||
                Boolean(parallelGroupHoldUntil) ||
                isTaskOnHold(task, now, taskById)
              const closed = isTaskClosed(task)
              const closedAt = task.completedAt || task.createdAt
              const displayedPriority = getDisplayedTaskPriority(task, tasks)
              const pomodoroTaskState = getPomodoroTaskState(task)
              const itemClassName = [
                'task-item',
                closed ? 'completed' : '',
                `priority-${displayedPriority.id}`,
                dependencyHold ? 'dependency-hold' : '',
                onHold ? 'on-hold' : '',
                priorityMenuTaskId === task.id ? 'priority-menu-open' : '',
                parallelGroupTasks.length > 1 ? 'parallel-grouped' : '',
                parallelGroupTasks.length > 1 && parallelGroupIndex === 0
                  ? 'parallel-first'
                  : '',
                parallelGroupTasks.length > 1 &&
                parallelGroupIndex === parallelGroupTasks.length - 1
                  ? 'parallel-last'
                  : '',
              ]
                .filter(Boolean)
                .join(' ')

              return (
                <li
                  className={itemClassName}
                  key={task.id}
                  ref={(element) => {
                    if (element) {
                      taskItemRefs.current.set(task.id, element)
                    } else {
                      taskItemRefs.current.delete(task.id)
                    }
                  }}
                  onContextMenu={(event) => handleTaskContextMenu(event, task)}
                  onMouseDown={(event) => handleTaskMouseDown(event, task)}
                  onDragOver={(event) => handlePomodoroDragOver(event, task)}
                  onDrop={(event) => handlePomodoroDrop(event, task)}
                  onDoubleClick={(event) => openDetailEditor(event, task)}
                >
                  <div className="priority-cell">
                    <button
                      className="priority-button"
                      type="button"
                      disabled={closed}
                      onClick={(event) => {
                        event.stopPropagation()

                        if (closed) {
                          return
                        }

                        togglePriorityMenu(task.id, event.currentTarget)
                      }}
                      aria-label={`Изменить приоритет задачи: ${displayedPriority.label}`}
                      aria-expanded={priorityMenuTaskId === task.id}
                      title={`Приоритет: ${displayedPriority.label}`}
                    >
                      <PriorityIcon icon={displayedPriority.icon} />
                    </button>
                  </div>
                  <div className="task-check">
                    <input
                      type="checkbox"
                      checked={task.completed}
                      onChange={() => toggleTask(task.id)}
                      aria-label={
                        task.completed
                          ? `Открыть задачу: ${task.title}`
                          : `Закрыть задачу: ${task.title}`
                      }
                    />
                    <span>{task.title}</span>
                  </div>
                  {dependencyReason ? (
                    <span
                      className="dependency-reason"
                      title={`Зависит от: ${dependencyReason.title}`}
                    >
                      {dependencyReason.title}
                      {dependencyReason.extraCount > 0
                        ? ` +${dependencyReason.extraCount}`
                        : ''}
                    </span>
                  ) : null}
                  {!dependencyReason && onHold ? (
                    <button
                      className="hold-timer"
                      type="button"
                      onContextMenu={(event) => {
                        event.preventDefault()
                        event.stopPropagation()
                      }}
                      onMouseDown={(event) => {
                        if (event.button !== 2) {
                          return
                        }

                        event.preventDefault()
                        event.stopPropagation()
                        startHoldRepeat(
                          () => reduceHoldStep(task.id),
                          visibleTasks.map((visibleTask) => visibleTask.id),
                        )
                      }}
                      onClick={(event) => openHoldEditor(event, task)}
                      aria-label={`Изменить время холда задачи: ${task.title}`}
                      title="Левый клик - выбрать срок. Правый клик - уменьшить холд на 15 минут."
                    >
                      {formatRemainingTime(
                        parallelGroupHoldUntil || task.holdUntil,
                        now,
                      )}
                    </button>
                  ) : null}
                  {closed ? (
                    <time
                      className="closed-date"
                      dateTime={new Date(closedAt).toISOString()}
                    >
                      {formatClosedAt(closedAt)}
                    </time>
                  ) : null}
                  <div
                    className={[
                      'pomodoro-task-cell',
                      pomodoroTaskState ? 'active' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                  >
                    {pomodoroTaskState ? (
                      <img
                        src={getPomodoroTaskImage(pomodoroTaskState)}
                        alt=""
                        draggable={!closed}
                        onDragStart={(event) =>
                          handlePomodoroDragStart(event, task)
                        }
                        title="Перетащите на другую задачу, чтобы перенести Pomodoro."
                      />
                    ) : null}
                  </div>
                  <button
                    className="delete-button"
                    type="button"
                    onClick={() => requestDeleteTask(task)}
                    aria-label={`Удалить задачу: ${task.title}`}
                    title="Удалить"
                  >
                    ×
                  </button>
                </li>
              )
            })}
          </ul>
        ) : (
          <p className="empty-state">
            {searchQuery.trim()
              ? 'Ничего не найдено.'
              : storageMode === 'online' &&
                  (syncStatus === 'loading' || syncStatus === 'signed-out')
                ? syncMessage || 'Загрузка онлайн-задач.'
              : 'Список пуст. Добавьте первую задачу.'}
          </p>
        )}
      </section>

      {priorityMenuTask && priorityMenuPosition && typeof document !== 'undefined'
        ? createPortal(
            <div
              className="priority-menu"
              role="menu"
              style={{
                left: `${priorityMenuPosition.left}px`,
                top: `${priorityMenuPosition.top}px`,
              }}
            >
              {PRIORITIES.map((priorityOption) => (
                <button
                  className={
                    priorityOption.id === priorityMenuTaskPriority.id
                      ? 'selected'
                      : ''
                  }
                  key={priorityOption.id}
                  type="button"
                  role="menuitemradio"
                  aria-checked={priorityOption.id === priorityMenuTaskPriority.id}
                  onClick={() =>
                    updateTaskPriority(priorityMenuTask.id, priorityOption.id)
                  }
                >
                  <span
                    className={`priority-swatch priority-${priorityOption.id}`}
                  >
                    <PriorityIcon icon={priorityOption.icon} />
                  </span>
                  <span>{priorityOption.label}</span>
                </button>
              ))}
            </div>,
            document.body,
          )
        : null}

      {pomodoroMenuPosition && typeof document !== 'undefined'
        ? createPortal(
            <form
              className="pomodoro-menu"
              style={{
                left: `${pomodoroMenuPosition.left}px`,
                top: `${pomodoroMenuPosition.top}px`,
              }}
              onSubmit={(event) => event.preventDefault()}
              onMouseDown={(event) => event.stopPropagation()}
            >
              <label>
                <span>Работа, минут</span>
                <input
                  type="number"
                  min="1"
                  max="180"
                  value={pomodoro.workMinutes}
                  onChange={(event) =>
                    updatePomodoroSettings('workMinutes', event.target.value)
                  }
                />
              </label>
              <label>
                <span>Отдых, минут</span>
                <input
                  type="number"
                  min="1"
                  max="60"
                  value={pomodoro.breakMinutes}
                  onChange={(event) =>
                    updatePomodoroSettings('breakMinutes', event.target.value)
                  }
                />
              </label>
              <label className="pomodoro-enabled-row">
                <input
                  type="checkbox"
                  checked={pomodoro.enabled}
                  onChange={togglePomodoroEnabled}
                />
                <span>Включить Pomodoro</span>
              </label>
              <label className="pomodoro-enabled-row">
                <input
                  type="checkbox"
                  checked={pomodoro.soundEnabled}
                  onChange={togglePomodoroSound}
                />
                <span>Звуковое сопровождение</span>
              </label>
              <button
                className="pomodoro-help-button"
                type="button"
                onClick={openPomodoroHelp}
              >
                Краткая справка
              </button>
            </form>,
            document.body,
          )
        : null}

      {holdEditor ? (
        <div className="modal-backdrop" role="presentation">
          <form className="hold-dialog" onSubmit={saveHoldEditor}>
            <h2>Срок холда</h2>
            <label htmlFor="hold-until-input">Когда вернуть задачу в активные</label>
            <input
              id="hold-until-input"
              type="datetime-local"
              value={holdEditor.value}
              min={toDatetimeLocalValue(now)}
              step={HOLD_STEP_MINUTES * 60}
              onChange={(event) =>
                setHoldEditor((current) => ({
                  ...current,
                  value: event.target.value,
                }))
              }
              autoFocus
            />
            <div className="hold-dialog-actions">
              <button type="button" onClick={() => setHoldEditor(null)}>
                Отмена
              </button>
              <button type="submit">Сохранить</button>
            </div>
          </form>
        </div>
      ) : null}

      {deleteConfirmation ? (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={handleDeleteBackdropMouseDown}
        >
          <form
            className="confirm-dialog"
            onSubmit={handleDeleteConfirmationSubmit}
          >
            <h2>Удалить задачу?</h2>
            <p>{deleteConfirmation.title}</p>
            <div className="confirm-dialog-actions">
              <button type="button" onClick={closeDeleteConfirmation}>
                Отмена
              </button>
              <button type="submit">Удалить</button>
            </div>
          </form>
        </div>
      ) : null}

      {pomodoroHelpOpen ? (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setPomodoroHelpOpen(false)
            }
          }}
        >
          <section className="pomodoro-help-dialog" role="dialog" aria-modal="true">
            <button
              className="dialog-close-button"
              type="button"
              onClick={() => setPomodoroHelpOpen(false)}
              aria-label="Закрыть справку"
              title="Закрыть"
            >
              ×
            </button>
            <h2>Pomodoro</h2>
            <p>
              Pomodoro - это способ работать короткими сфокусированными
              отрезками. Обычно один цикл состоит из 25 минут работы и 5 минут
              отдыха. В течение рабочего отрезка важно заниматься одной
              конкретной задачей и не переключаться без необходимости.
            </p>
            <p>
              Смысл техники - снизить усталость от постоянного выбора, держать
              понятный ритм и видеть реальный прогресс. Если задача закончилась
              раньше, можно перенести маленький помидор на следующую задачу, но
              рабочий цикл при этом продолжается.
            </p>
            <p>
              Когда рабочее время закончится, большой помидор начнет мигать и
              подаст сигнал. После клика начинается короткий отдых. Длительность
              работы и отдыха можно настроить правым кликом по большому
              помидору.
            </p>
          </section>
        </div>
      ) : null}

      {detailEditor ? (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={handleDetailBackdropMouseDown}
        >
          <form
            className={`detail-dialog${detailEditor.readonly ? ' readonly' : ''}`}
            onSubmit={handleDetailSubmit}
          >
            <button
              className="dialog-close-button"
              type="button"
              onClick={closeDetailEditor}
              aria-label="Закрыть детали задачи"
              title="Закрыть"
            >
              <span aria-hidden="true">×</span>
            </button>
            <h2>Детали задачи</h2>
            <label htmlFor="detail-title">Заголовок</label>
            <input
              id="detail-title"
              type="text"
              value={detailEditor.title}
              onChange={(event) =>
                updateDetailTaskField('title', event.target.value)
              }
              readOnly={detailEditor.readonly}
              autoFocus
            />

            <label htmlFor="detail-priority">Приоритет</label>
            <select
              id="detail-priority"
              value={detailEditor.priority}
              onChange={(event) =>
                updateDetailTaskField('priority', event.target.value)
              }
              disabled={detailEditor.readonly}
            >
              {PRIORITIES.map((priority) => (
                <option key={priority.id} value={priority.id}>
                  {priority.label}
                </option>
              ))}
            </select>

            <label htmlFor="detail-description">Описание</label>
            <textarea
              id="detail-description"
              value={detailEditor.description}
              onChange={(event) =>
                updateDetailTaskField('description', event.target.value)
              }
              readOnly={detailEditor.readonly}
              rows={5}
            />

            <section className="relationship-section">
              <h3>Связи</h3>

              <div className="relationship-block">
                {!detailEditor.readonly ? (
                  <div className="relationship-add">
                    <select
                      aria-label="Тип связи"
                      value={detailEditor.selectedRelationType}
                      onChange={(event) =>
                        setDetailEditor((current) => ({
                          ...current,
                          selectedRelationType: event.target.value,
                        }))
                      }
                    >
                      {RELATION_TYPES.map((relationType) => (
                        <option key={relationType.id} value={relationType.id}>
                          {relationType.label}
                        </option>
                      ))}
                    </select>
                    <select
                      aria-label="Задача связи"
                      value={detailEditor.selectedLinkedTaskId}
                      onChange={(event) =>
                        setDetailEditor((current) => ({
                          ...current,
                          selectedLinkedTaskId: event.target.value,
                        }))
                      }
                    >
                      <option value="">Выберите задачу</option>
                      {detailLinkedTaskOptions.map((task) => (
                        <option key={task.id} value={task.id}>
                          {task.title}
                        </option>
                      ))}
                    </select>
                    <button
                      className="relationship-icon-button"
                      type="button"
                      onClick={addDetailRelation}
                      disabled={!detailEditor.selectedLinkedTaskId}
                      aria-label="Добавить связь"
                      title="Добавить связь"
                    >
                      <span aria-hidden="true">+</span>
                    </button>
                  </div>
                ) : null}

                {detailRelationships.length > 0 ? (
                  <ul className="relationship-list">
                    {detailRelationships.map((relation) => (
                      <li key={`${relation.type}-${relation.taskId}`}>
                        <span className="relationship-type">
                          {relation.relationType.label}
                        </span>
                        <span>{relation.task.title}</span>
                        {!detailEditor.readonly ? (
                          <button
                            className="relationship-icon-button"
                            type="button"
                            onClick={() =>
                              removeDetailRelation(
                                relation.taskId,
                                relation.type,
                              )
                            }
                            aria-label={`Удалить связь: ${relation.relationType.label} ${relation.task.title}`}
                            title="Удалить связь"
                          >
                            <span aria-hidden="true">-</span>
                          </button>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>Связей нет.</p>
                )}
              </div>
            </section>
          </form>
        </div>
      ) : null}
    </main>
  )
}

export default App
