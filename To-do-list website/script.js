/* Animated To-Do List with localStorage, edit/delete, filters, drag reorder
   Place this file as script.js
*/

// ======= Storage helpers =======
const STORAGE_KEY = 'todo.tasks.v1';

function saveTasks(tasks){
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
}
function loadTasks(){
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch (e) {
    return [];
  }
}

// ======= App state =======
let tasks = loadTasks(); // { id, text, done, createdAt }
let filter = 'all'; // all, active, completed

// ======= DOM =======
const taskForm = document.getElementById('taskForm');
const taskInput = document.getElementById('taskInput');
const taskList = document.getElementById('taskList');
const emptyState = document.getElementById('emptyState');
const remaining = document.getElementById('remaining');
const filters = document.querySelectorAll('.filter');
const clearCompletedBtn = document.getElementById('clearCompleted');
const toggleAllBtn = document.getElementById('toggleAll');

// ======= Utility =======
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2,8);

// ======= Rendering =======
function render(){
  // filter tasks
  const visible = tasks.filter(t => {
    if (filter === 'active') return !t.done;
    if (filter === 'completed') return t.done;
    return true;
  });

  taskList.innerHTML = '';
  if (visible.length === 0) {
    emptyState.style.display = 'block';
  } else {
    emptyState.style.display = 'none';
  }

  visible.forEach((task, index) => {
    const li = document.createElement('li');
    li.className = 'task enter';
    li.setAttribute('draggable', 'true');
    li.dataset.id = task.id;
    li.innerHTML = `
      <div class="drag-handle" title="Drag to reorder" aria-hidden="true">≡</div>
      <button class="checkbox ${task.done ? 'checked' : ''}" aria-label="${task.done ? 'Mark as not done' : 'Mark as done'}" data-action="toggle"></button>
      <div class="task-title ${task.done ? 'completed' : ''}" tabindex="0" role="textbox" aria-label="Task">${escapeHtml(task.text)}</div>
      <div class="actions">
        <button class="icon-btn edit" title="Edit" data-action="edit" aria-label="Edit task">✎</button>
        <button class="icon-btn delete" title="Delete" data-action="delete" aria-label="Delete task">🗑</button>
      </div>
    `;

    // append and attach events
    taskList.appendChild(li);
    attachTaskEvents(li, task);
  });

  // remaining count
  const rem = tasks.filter(t => !t.done).length;
  remaining.textContent = `${rem} ${rem===1 ? 'task' : 'tasks'} left`;

  saveTasks(tasks);
  updateFilterUI();
}

// simple escape to prevent HTML injection inside task titles
function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, (m) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}

// ======= Events: form add =======
taskForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const text = taskInput.value.trim();
  if (!text) {
    flash(emptyState, 'Please enter a task', 'warn');
    return;
  }
  const newTask = { id: uid(), text, done: false, createdAt: Date.now() };
  tasks.unshift(newTask); // newest on top
  taskInput.value = '';
  render();
  focusFirstTask();
});

// ======= Attach per-task events (toggle, delete, edit, drag) =======
function attachTaskEvents(li, task){
  const id = task.id;
  const checkbox = li.querySelector('[data-action="toggle"]');
  const deleteBtn = li.querySelector('[data-action="delete"]');
  const editBtn = li.querySelector('[data-action="edit"]');
  const titleEl = li.querySelector('.task-title');
  const dragHandle = li.querySelector('.drag-handle');

  checkbox.addEventListener('click', () => {
    task.done = !task.done;
    render();
  });

  deleteBtn.addEventListener('click', () => {
    // animate removal
    li.style.transition = 'opacity .25s ease, transform .25s ease';
    li.style.opacity = 0;
    li.style.transform = 'translateX(18px) scale(.98)';
    setTimeout(() => {
      tasks = tasks.filter(t => t.id !== id);
      render();
    }, 240);
  });

  editBtn.addEventListener('click', () => startEdit(titleEl, task));

  // inline edit on double click or Enter while focused
  titleEl.addEventListener('dblclick', () => startEdit(titleEl, task));
  titleEl.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') {
      ev.preventDefault();
      startEdit(titleEl, task);
    }
  });

  // Drag & drop
  li.addEventListener('dragstart', (ev) => {
    li.classList.add('dragging');
    ev.dataTransfer.setData('text/plain', id);
    // allow move
    ev.dataTransfer.effectAllowed = 'move';
  });
  li.addEventListener('dragend', () => {
    li.classList.remove('dragging');
  });

  // when dragging over list, handle reorder
  li.addEventListener('dragover', (ev) => {
    ev.preventDefault();
    const dragging = taskList.querySelector('.dragging');
    if (!dragging || dragging === li) return;
    const bounding = li.getBoundingClientRect();
    const offset = ev.clientY - bounding.top;
    const half = bounding.height / 2;
    if (offset > half) {
      li.parentNode.insertBefore(dragging, li.nextSibling);
    } else {
      li.parentNode.insertBefore(dragging, li);
    }
  });

  // when drop happens on list container
  taskList.addEventListener('drop', (ev) => {
    ev.preventDefault();
    const droppedId = ev.dataTransfer.getData('text/plain');
    const orderEls = Array.from(taskList.children);
    const newOrderIds = orderEls.map(el => el.dataset.id);
    // re-order tasks array to new order, but keep all tasks (not filtered only)
    const newTasks = [];
    newOrderIds.forEach(id => {
      const t = tasks.find(x => x.id === id);
      if (t) newTasks.push(t);
    });
    // also append tasks that might be filtered out (shouldn't happen but safe)
    tasks.forEach(t => {
      if (!newTasks.find(x => x.id === t.id)) newTasks.push(t);
    });
    tasks = newTasks;
    render();
  });
}

// ======= Inline editing =======
function startEdit(titleEl, task){
  const li = titleEl.closest('.task');
  const original = task.text;
  const input = document.createElement('input');
  input.className = 'edit-input';
  input.value = original;
  titleEl.replaceWith(input);
  input.focus();
  // move caret to end
  input.setSelectionRange(input.value.length, input.value.length);

  function cancel(){
    input.replaceWith(titleEl);
  }
  function save(){
    const val = input.value.trim();
    if (!val) {
      flash(emptyState, "Task can't be empty", 'warn');
      input.focus();
      return;
    }
    task.text = val;
    render();
  }

  input.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') {
      cancel();
    } else if (ev.key === 'Enter') {
      save();
    }
  });

  // click outside to save
  setTimeout(() => {
    document.addEventListener('click', outside);
  }, 0);

  function outside(e){
    if (!input.contains(e.target)) {
      save();
      document.removeEventListener('click', outside);
    }
  }
}

// ======= Filters =======
filters.forEach(btn => {
  btn.addEventListener('click', () => {
    filter = btn.dataset.filter;
    render();
  });
});
function updateFilterUI(){
  filters.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.filter === filter);
    btn.setAttribute('aria-selected', btn.dataset.filter === filter ? 'true' : 'false');
  });
}

// ======= bulk actions =======
clearCompletedBtn.addEventListener('click', () => {
  const any = tasks.some(t => t.done);
  if (!any) {
    flash(emptyState, 'No completed tasks to clear', 'warn');
    return;
  }
  tasks = tasks.filter(t => !t.done);
  render();
});

toggleAllBtn.addEventListener('click', () => {
  const allDone = tasks.every(t => t.done);
  tasks.forEach(t => t.done = !allDone);
  render();
});

// helper to focus first task (used after adding)
function focusFirstTask(){
  requestAnimationFrame(() => {
    const first = taskList.querySelector('.task .task-title');
    if (first) first.focus();
  });
}

// small flashing message right above empty area for lightweight feedback
function flash(targetEl, text, type='info'){
  const prev = document.querySelector('.temp-flash');
  if (prev) prev.remove();
  const span = document.createElement('div');
  span.className = 'temp-flash';
  span.textContent = text;
  span.style.cssText = 'padding:8px 12px;background:rgba(0,0,0,0.06);border-radius:8px;display:inline-block;margin:8px auto;color:#111827';
  targetEl.after(span);
  setTimeout(()=> span.style.opacity = '0', 1600);
  setTimeout(()=> span.remove(), 2200);
}

// ======= Initialize with rendering =======
render();

// for accessibility: allow Enter on filters
filters.forEach(f => {
  f.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') f.click();
  });
});

// preload some example tasks if none exist (optional)
if (tasks.length === 0) {
  tasks = [
    { id: uid(), text: 'Welcome — try adding a task!', done: false, createdAt: Date.now() },
    { id: uid(), text: 'Double-click title to edit', done: false, createdAt: Date.now() },
    { id: uid(), text: 'Drag tasks to reorder', done: false, createdAt: Date.now() }
  ];
  saveTasks(tasks);
  render();
}