// navbar.js
document.addEventListener('DOMContentLoaded', () => {
    const navbar = document.createElement('div');
    navbar.classList.add('nav-bar');

    const title = document.createElement('a');
    title.href = '/home.html';
    title.classList.add('nav-title');
    title.textContent = 'HK Transit Edge';
    navbar.appendChild(title);

    const buttons = [
        { id: 'home-btn', text: 'Home', href: 'home.html', icon: '/static/images/home.png' },
        { id: 'transit_planner-btn', text: 'Search', href: 'transit_planner.html', icon: '/static/images/transit_planner.png' },
        { id: 'route_planner-btn', text: 'Planning', href: 'route_planner.html', icon: '/static/images/route_planning.png' },
        { id: 'train-btn', text: 'Train', href: 'mtr.html', icon: '/static/images/mtr_button.png' },
        { id: 'tram-btn', text: 'Tram', href: 'tram_schedule.html', icon: '/static/images/tram_button.png' },
        { id: 'ferry-btn', text: 'Ferry', href: 'ferry.html', icon: '/static/images/ferry_button.png' },
        { id: 'news-btn', text: 'News', href: '#', icon: '/static/images/news_icon.png' },
    ];

    const currentPage = window.location.pathname.split('/').pop() || 'home.html';
    let newsModal, newsContent, originalContent = '';

    buttons.forEach(buttonData => {
        const button = document.createElement('button');
        button.id = buttonData.id;

        const icon = document.createElement('img');
        icon.src = buttonData.icon;
        icon.alt = `${buttonData.text} icon`;
        icon.style.width = '20px';
        icon.style.height = '20px';
        icon.style.marginRight = '8px';
        icon.style.verticalAlign = 'middle';

        button.appendChild(icon);
        button.appendChild(document.createTextNode(buttonData.text));

        if (buttonData.href === currentPage) {
            button.classList.add('active');
        }

        if (buttonData.id === 'news-btn') {
            button.addEventListener('click', (e) => {
                e.preventDefault();
                toggleNewsModal();
            });
        } else {
            button.addEventListener('click', () => {
                window.location.href = buttonData.href;
            });
        }
        
        navbar.appendChild(button);
    });

    function createNewsModal() {
        const modal = document.createElement('div');
        modal.id = 'newsModal';
        modal.classList.add('modal');
        modal.innerHTML = `
            <div class="modal-content">
                <span class="close">×</span>
                <div id="newsContent">Loading news content...</div>
                <div class="source-reference">Source: RTHK</div>
            </div>
        `;
        document.body.appendChild(modal);

        newsContent = modal.querySelector('#newsContent');
        const closeBtn = modal.querySelector('.close');

        closeBtn.addEventListener('click', () => modal.style.display = 'none');
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.style.display = 'none';
        });

        return modal;
    }

    function toggleNewsModal() {
        if (!newsModal) {
            newsModal = createNewsModal();
            fetchNewsContent();
        } else {
            newsModal.style.display = newsModal.style.display === 'block' ? 'none' : 'block';
            if (originalContent && newsContent.innerHTML === 'Loading news content...') {
                newsContent.innerHTML = originalContent;
            }
        }
    }

    async function fetchNewsContent() {
        newsContent.innerHTML = 'Loading news content...';
        try {
            const response = await fetch('https://programme.rthk.hk/channel/radio/trafficnews/index.php');
            if (!response.ok) throw new Error('Network response was not ok');
            const data = await response.text();
            const parser = new DOMParser();
            const doc = parser.parseFromString(data, 'text/html');
            const newsItems = doc.querySelectorAll('ul.dec > li.inner');
            let content = '';
            newsItems.forEach(item => {
                content += `<div class="news-item">${item.textContent.trim()}</div>`;
            });
            originalContent = content || 'No news content available.';
            newsContent.innerHTML = originalContent;
        } catch (error) {
            console.error('Error fetching news:', error);
            newsContent.innerHTML = 'Failed to load news content. Please try again later.';
        }
    }

    // Dark mode functionality
    const darkModeToggle = document.createElement('button');
    darkModeToggle.id = 'darkModeToggle';
    darkModeToggle.classList.add('dark-mode-toggle');
    darkModeToggle.setAttribute('aria-label', 'Toggle Dark Mode');
    darkModeToggle.textContent = '🌙';
    navbar.appendChild(darkModeToggle);

    document.body.insertBefore(navbar, document.body.firstChild);

    function toggleDarkMode() {
        const isDark = document.body.getAttribute('data-theme') === 'dark';
        document.body.setAttribute('data-theme', isDark ? '' : 'dark');
        localStorage.setItem('theme', isDark ? 'light' : 'dark');
        darkModeToggle.textContent = isDark ? '🌙' : '☀️';
    }

    function initTheme() {
        if (localStorage.getItem('theme') === 'dark') {
            document.body.setAttribute('data-theme', 'dark');
            darkModeToggle.textContent = '☀️';
        }
    }

    document.addEventListener('DOMContentLoaded', () => {
        const menuToggle = document.querySelector('.menu-toggle');
        const navBar = document.querySelector('.nav-bar');
        if (menuToggle && navBar) {
            menuToggle.addEventListener('click', () => {
                navBar.classList.toggle('active');
            });
        }
    });

    initTheme();
    darkModeToggle.addEventListener('click', toggleDarkMode);
});