(async function() {
try {

const SUPABASE_URL = 'https://wjvejcktclwcsignauld.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndqdmVqY2t0Y2x3Y3NpZ25hdWxkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkyMDQ4MjUsImV4cCI6MjA5NDc4MDgyNX0.7-eGOYkxWpcXdYYCgvxtrDaO3CTQPsF7URcBGfKN6iQ';

if (!window.supabase) return;

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Auth elements
const authContainer = document.getElementById('auth-container');
const appContainer = document.getElementById('app');
const authForm = document.getElementById('auth-form');
const authEmail = document.getElementById('auth-email');
const authPassword = document.getElementById('auth-password');
const authSubmitBtn = document.getElementById('auth-submit-btn');
const authError = document.getElementById('auth-error');
const authTabs = document.querySelectorAll('.auth-tab');
const logoutBtn = document.getElementById('logout-btn');

// App elements
const form = document.getElementById('todo-form');
const input = document.getElementById('todo-input');
const prioritySelect = document.getElementById('priority-select');
const dueDateInput = document.getElementById('due-date-input');
const list = document.getElementById('todo-list');
const emptyMsg = document.getElementById('empty-msg');
const filterTabs = document.getElementById('filter-tabs');
const statFill = document.getElementById('stat-fill');
const statText = document.getElementById('stat-text');
const todayDate = document.getElementById('today-date');

const priorityLabels = { high: '높음', medium: '중간', low: '낮음' };
let todos = [];
let currentFilter = 'all';
let dragIndex = null;
let authMode = 'login';
let currentUser = null;

const now = new Date();
todayDate.textContent = `${now.getFullYear()}년 ${now.getMonth() + 1}월 ${now.getDate()}일`;

// --- Auth ---
authTabs.forEach(tab => {
    tab.addEventListener('click', () => {
        authTabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        authMode = tab.dataset.tab;
        authSubmitBtn.textContent = authMode === 'login' ? '로그인' : '회원가입';
        authError.classList.add('hidden');
    });
});

authForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    authError.classList.add('hidden');
    const email = authEmail.value.trim();
    const password = authPassword.value;

    let result;
    if (authMode === 'login') {
        result = await sb.auth.signInWithPassword({ email, password });
    } else {
        result = await sb.auth.signUp({ email, password });
    }

    if (result.error) {
        authError.textContent = result.error.message;
        authError.classList.remove('hidden');
    }
});

logoutBtn.addEventListener('click', async () => {
    await sb.auth.signOut();
});

// Social login
const googleLoginBtn = document.getElementById('google-login-btn');
const githubLoginBtn = document.getElementById('github-login-btn');

googleLoginBtn.addEventListener('click', async () => {
    await sb.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: window.location.origin + window.location.pathname }
    });
});

githubLoginBtn.addEventListener('click', async () => {
    await sb.auth.signInWithOAuth({
        provider: 'github',
        options: { redirectTo: window.location.origin + window.location.pathname }
    });
});

// 세션 확인
const { data: { session } } = await sb.auth.getSession();
if (session && session.user) {
    currentUser = session.user;
    authContainer.classList.add('hidden');
    appContainer.classList.remove('hidden');
    await loadTodos();
}

sb.auth.onAuthStateChange(async (event, session) => {
    if (session && session.user) {
        currentUser = session.user;
        authContainer.classList.add('hidden');
        appContainer.classList.remove('hidden');
        await loadTodos();
    } else {
        currentUser = null;
        authContainer.classList.remove('hidden');
        appContainer.classList.add('hidden');
        todos = [];
    }
});

// --- Supabase CRUD ---
async function loadTodos() {
    const { data, error } = await sb
        .from('todos')
        .select('*')
        .order('sort_order', { ascending: true });
    if (error) return;
    todos = data || [];
    render();
}

async function addTodo(text, priority, dueDate) {
    if (!currentUser) return;
    const maxOrder = todos.length > 0 ? Math.max(...todos.map(t => t.sort_order)) + 1 : 0;
    const { data, error } = await sb
        .from('todos')
        .insert({
            text,
            priority,
            due_date: dueDate || null,
            sort_order: maxOrder,
            user_id: currentUser.id
        })
        .select()
        .single();
    if (error) return;
    todos.push(data);
    render();
}

async function toggle(index) {
    const todo = todos[index];
    const { error } = await sb
        .from('todos')
        .update({ completed: !todo.completed })
        .eq('id', todo.id);
    if (error) return;
    todo.completed = !todo.completed;
    render();
}

async function remove(index) {
    const todo = todos[index];
    const { error } = await sb
        .from('todos')
        .delete()
        .eq('id', todo.id);
    if (error) return;
    todos.splice(index, 1);
    render();
}

async function updateText(index, newText) {
    const todo = todos[index];
    const { error } = await sb
        .from('todos')
        .update({ text: newText })
        .eq('id', todo.id);
    if (error) return;
    todo.text = newText;
    render();
}

async function reorder(fromIndex, toIndex) {
    const [moved] = todos.splice(fromIndex, 1);
    todos.splice(toIndex, 0, moved);

    const updates = todos.map((todo, idx) => ({
        id: todo.id,
        sort_order: idx
    }));

    const { error } = await sb
        .from('todos')
        .upsert(updates);
    if (error) console.error(error);
    render();
}

// --- Rendering ---
function isOverdue(dueDate) {
    if (!dueDate) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const due = new Date(dueDate + 'T00:00:00');
    return due < today;
}

function formatDate(dateStr) {
    if (!dateStr) return '';
    const [year, month, day] = dateStr.split('-').map(Number);
    return `${month}월 ${day}일`;
}

function getFiltered() {
    if (currentFilter === 'active') return todos.filter(t => !t.completed);
    if (currentFilter === 'completed') return todos.filter(t => t.completed);
    return todos;
}

function updateStats() {
    const total = todos.length;
    const done = todos.filter(t => t.completed).length;
    const pct = total === 0 ? 0 : Math.round((done / total) * 100);
    statFill.style.width = pct + '%';
    statText.textContent = `${done} / ${total} 완료`;
}

function render() {
    list.innerHTML = '';
    const filtered = getFiltered();

    filtered.forEach((todo) => {
        const realIndex = todos.indexOf(todo);
        const li = document.createElement('li');
        li.className = 'todo-item';
        if (todo.completed) li.classList.add('completed');
        if (!todo.completed && isOverdue(todo.due_date)) li.classList.add('overdue');
        li.setAttribute('draggable', 'true');
        li.dataset.index = realIndex;

        li.addEventListener('dragstart', handleDragStart);
        li.addEventListener('dragover', handleDragOver);
        li.addEventListener('dragleave', handleDragLeave);
        li.addEventListener('drop', handleDrop);
        li.addEventListener('dragend', handleDragEnd);

        li.addEventListener('touchstart', handleTouchStart, { passive: true });
        li.addEventListener('touchmove', handleTouchMove, { passive: false });
        li.addEventListener('touchend', handleTouchEnd);

        const checkbox = document.createElement('div');
        checkbox.className = 'todo-checkbox';
        checkbox.addEventListener('click', () => toggle(realIndex));

        const content = document.createElement('div');
        content.className = 'todo-content';

        const text = document.createElement('span');
        text.className = 'todo-text';
        text.textContent = todo.text;
        text.addEventListener('click', () => startEdit(realIndex, text, content));

        content.appendChild(text);

        if (todo.due_date) {
            const due = document.createElement('span');
            due.className = 'todo-due';
            if (!todo.completed && isOverdue(todo.due_date)) due.classList.add('overdue');
            const prefix = (!todo.completed && isOverdue(todo.due_date)) ? '⚠ 기한 초과 · ' : '';
            due.textContent = prefix + formatDate(todo.due_date);
            content.appendChild(due);
        }

        const badge = document.createElement('span');
        badge.className = 'priority-badge ' + todo.priority;
        badge.textContent = priorityLabels[todo.priority];

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'delete-btn';
        deleteBtn.textContent = '×';
        deleteBtn.addEventListener('click', () => remove(realIndex));

        li.append(checkbox, content, badge, deleteBtn);
        list.appendChild(li);
    });

    emptyMsg.classList.toggle('hidden', filtered.length > 0);
    updateStats();
}

function startEdit(index, textEl, contentEl) {
    const editInput = document.createElement('input');
    editInput.type = 'text';
    editInput.className = 'todo-text-edit';
    editInput.value = todos[index].text;

    contentEl.replaceChild(editInput, textEl);
    editInput.focus();
    editInput.select();

    function finishEdit() {
        const newText = editInput.value.trim();
        if (newText && newText !== todos[index].text) {
            updateText(index, newText);
        } else {
            render();
        }
    }

    editInput.addEventListener('blur', finishEdit);
    editInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') editInput.blur();
        if (e.key === 'Escape') {
            editInput.value = todos[index].text;
            editInput.blur();
        }
    });
}

// --- Drag and Drop (mouse) ---
function handleDragStart(e) {
    dragIndex = +e.currentTarget.dataset.index;
    e.currentTarget.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
}

function handleDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    e.currentTarget.classList.add('drag-over');
}

function handleDragLeave(e) {
    e.currentTarget.classList.remove('drag-over');
}

function handleDrop(e) {
    e.preventDefault();
    e.currentTarget.classList.remove('drag-over');
    const dropIndex = +e.currentTarget.dataset.index;
    if (dragIndex === null || dragIndex === dropIndex) return;
    reorder(dragIndex, dropIndex);
}

function handleDragEnd(e) {
    e.currentTarget.classList.remove('dragging');
    dragIndex = null;
}

// --- Drag and Drop (touch) ---
let touchStartY = 0;
let touchItem = null;

function handleTouchStart(e) {
    touchItem = e.currentTarget;
    touchStartY = e.touches[0].clientY;
    dragIndex = +touchItem.dataset.index;
}

function handleTouchMove(e) {
    if (!touchItem) return;
    e.preventDefault();
    touchItem.classList.add('dragging');
}

function handleTouchEnd(e) {
    if (!touchItem) return;
    touchItem.classList.remove('dragging');
    const touchEndY = e.changedTouches[0].clientY;
    const items = [...list.querySelectorAll('.todo-item')];
    let dropTarget = null;

    for (const item of items) {
        const rect = item.getBoundingClientRect();
        if (touchEndY >= rect.top && touchEndY <= rect.bottom) {
            dropTarget = item;
            break;
        }
    }

    if (dropTarget && dragIndex !== null) {
        const dropIndex = +dropTarget.dataset.index;
        if (dragIndex !== dropIndex) {
            reorder(dragIndex, dropIndex);
        }
    }

    touchItem = null;
    dragIndex = null;
}

// --- Filter ---
filterTabs.addEventListener('click', (e) => {
    if (!e.target.classList.contains('filter-btn')) return;
    filterTabs.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
    e.target.classList.add('active');
    currentFilter = e.target.dataset.filter;
    render();
});

// --- Form submit ---
form.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    addTodo(text, prioritySelect.value, dueDateInput.value);
    input.value = '';
    prioritySelect.value = 'medium';
    dueDateInput.value = '';
    input.focus();
});

} catch (err) {
    console.error(err);
}
})();
