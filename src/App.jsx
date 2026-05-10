import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import './App.css'

const STORAGE_KEY = 'task-manager.tasks'
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
const WINDOW_SIZE_INITIALIZED_KEY = 'task-manager.window.initialized'
const INITIAL_WINDOW_MIN_WIDTH = 760
const INITIAL_WINDOW_MAX_WIDTH = 980
const INITIAL_WINDOW_HEIGHT = 720

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
      priority,
      completed,
      completedAt,
      createdAt,
      holdUntil,
    }
  })

  return normalizedTasks.map((task) => ({
    ...task,
    dependencies: task.dependencies.filter(
      (dependencyId) => dependencyId !== task.id && knownIds.has(dependencyId),
    ),
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

function isTaskClosed(task) {
  return Boolean(task.completed)
}

function getTaskDependencies(task) {
  return Array.isArray(task.dependencies) ? task.dependencies : []
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

function App() {
  const [tasks, setTasks] = useState(readStoredTasks)
  const [taskText, setTaskText] = useState('')
  const [now, setNow] = useState(() => Date.now())
  const [holdEditor, setHoldEditor] = useState(null)
  const [detailEditor, setDetailEditor] = useState(null)
  const [deleteConfirmation, setDeleteConfirmation] = useState(null)
  const [priorityMenuTaskId, setPriorityMenuTaskId] = useState(null)
  const [priorityMenuPosition, setPriorityMenuPosition] = useState(null)
  const [showClosedTasks, setShowClosedTasks] = useState(true)
  const [frozenTaskOrder, setFrozenTaskOrder] = useState(null)
  const holdRepeatRef = useRef(null)
  const taskItemRefs = useRef(new Map())
  const taskItemRects = useRef(new Map())

  const taskById = useMemo(
    () => new Map(tasks.map((task) => [task.id, task])),
    [tasks],
  )

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
    if (!detailEditor && !deleteConfirmation) {
      return undefined
    }

    function closeOnEscape(event) {
      if (event.key === 'Escape') {
        if (deleteConfirmation) {
          closeDeleteConfirmation()
        } else {
          closeDetailEditor()
        }
      }
    }

    document.addEventListener('keydown', closeOnEscape)

    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [detailEditor, deleteConfirmation])

  useEffect(() => {
    writeStoredTasks(tasks)
  }, [tasks])

  const visibleTasks = useMemo(() => {
    const activeTasks = []
    const dependencyHoldTasks = []
    const timerHoldTasks = []
    const closedTasks = []

    for (const task of tasks) {
      if (isTaskClosed(task)) {
        closedTasks.push(task)
      } else if (isTaskBlockedByDependency(task, taskById)) {
        dependencyHoldTasks.push(task)
      } else if (isTaskOnTimerHold(task, now)) {
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
    timerHoldTasks.sort(
      (firstTask, secondTask) => firstTask.holdUntil - secondTask.holdUntil,
    )
    closedTasks.sort(
      (firstTask, secondTask) =>
        (secondTask.completedAt || 0) - (firstTask.completedAt || 0),
    )

    const openTasks = [...activeTasks, ...dependencyHoldTasks, ...timerHoldTasks]

    const sortedTasks = showClosedTasks ? [...openTasks, ...closedTasks] : openTasks

    if (!frozenTaskOrder) {
      return sortedTasks
    }

    const sortedTaskById = new Map(sortedTasks.map((task) => [task.id, task]))
    const frozenTasks = frozenTaskOrder
      .map((taskId) => sortedTaskById.get(taskId))
      .filter(Boolean)
    const newTasks = sortedTasks.filter((task) => !frozenTaskOrder.includes(task.id))

    return [...frozenTasks, ...newTasks]
  }, [tasks, now, showClosedTasks, taskById, frozenTaskOrder])

  const completedCount = useMemo(
    () => tasks.filter((task) => task.completed).length,
    [tasks],
  )
  const activeCount = useMemo(
    () => tasks.filter((task) => !task.completed).length,
    [tasks],
  )

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
    setTasks((currentTasks) =>
      currentTasks.map((task) => {
        if (task.id !== taskId) {
          return task
        }

        if (task.completed) {
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
  }

  function addHoldStep(taskId) {
    setTasks((currentTasks) =>
      currentTasks.map((task) => {
        if (task.id !== taskId || task.completed) {
          return task
        }

        return {
          ...task,
          holdUntil: Math.max(task.holdUntil || 0, Date.now()) + HOLD_STEP_MS,
        }
      }),
    )
  }

  function reduceHoldStep(taskId) {
    setTasks((currentTasks) =>
      currentTasks.map((task) => {
        if (task.id !== taskId || task.completed || !task.holdUntil) {
          return task
        }

        const nextHoldUntil = task.holdUntil - HOLD_STEP_MS

        return {
          ...task,
          holdUntil: nextHoldUntil > Date.now() ? nextHoldUntil : null,
        }
      }),
    )
  }

  function updateTaskHold(taskId, holdUntil) {
    setTasks((currentTasks) =>
      currentTasks.map((task) =>
        task.id === taskId && !task.completed ? { ...task, holdUntil } : task,
      ),
    )
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
    setTasks((currentTasks) =>
      currentTasks.map((task) => {
        if (task.id === detailEditor.taskId && !task.completed) {
          return {
            ...task,
            dependencies: nextRelationships
              .filter((relation) => relation.type === 'depends-on')
              .map((relation) => relation.taskId),
          }
        }

        if (task.completed) {
          return task
        }

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
        }
      }),
    )
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
      currentTasks
        .filter((task) => task.id !== taskId)
        .map((task) => ({
          ...task,
          dependencies: getTaskDependencies(task).filter(
            (dependencyId) => dependencyId !== taskId,
          ),
        })),
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

    const nextRelationships = [
      ...detailEditor.relationships,
      {
        type: detailEditor.selectedRelationType,
        taskId: detailEditor.selectedLinkedTaskId,
      },
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
        'button, input, .hold-timer, .dependency-reason, .closed-date, .priority-cell',
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
        'button, input, .hold-timer, .dependency-reason, .closed-date, .priority-cell',
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

  function openDetailEditor(event, task) {
    if (
      task.completed ||
      event.target.closest('button, input, .priority-menu, .closed-date')
    ) {
      return
    }

    closePriorityMenu()
    setDetailEditor({
      taskId: task.id,
      title: task.title,
      priority: getTaskPriority(task).id,
      description: task.description || '',
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
      ],
      selectedRelationType: 'depends-on',
      selectedLinkedTaskId: '',
    })
  }

  function getDependencyReason(task) {
    const openDependencies = getOpenDependencyTasks(task, taskById)
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

  return (
    <main className="app">
      <section className="task-panel" aria-labelledby="task-manager-title">
        <header className="task-header">
          <div>
            <p className="eyebrow">Task Manager</p>
            <h1 id="task-manager-title">Мои задачи</h1>
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
        </header>

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
              const onHold = isTaskOnHold(task, now, taskById)
              const closed = isTaskClosed(task)
              const closedAt = task.completedAt || task.createdAt
              const displayedPriority = getDisplayedTaskPriority(task, tasks)
              const itemClassName = [
                'task-item',
                closed ? 'completed' : '',
                `priority-${displayedPriority.id}`,
                dependencyHold ? 'dependency-hold' : '',
                onHold ? 'on-hold' : '',
                priorityMenuTaskId === task.id ? 'priority-menu-open' : '',
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
                      {formatRemainingTime(task.holdUntil, now)}
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
            Список пуст. Добавьте первую задачу.
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

      {detailEditor ? (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={handleDetailBackdropMouseDown}
        >
          <form className="detail-dialog" onSubmit={handleDetailSubmit}>
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
              autoFocus
            />

            <label htmlFor="detail-priority">Приоритет</label>
            <select
              id="detail-priority"
              value={detailEditor.priority}
              onChange={(event) =>
                updateDetailTaskField('priority', event.target.value)
              }
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
              rows={5}
            />

            <section className="relationship-section">
              <h3>Связи</h3>

              <div className="relationship-block">
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

                {detailRelationships.length > 0 ? (
                  <ul className="relationship-list">
                    {detailRelationships.map((relation) => (
                      <li key={`${relation.type}-${relation.taskId}`}>
                        <span className="relationship-type">
                          {relation.relationType.label}
                        </span>
                        <span>{relation.task.title}</span>
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
