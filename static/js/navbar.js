// navbar.js
document.addEventListener('DOMContentLoaded', () => {
    // Create the nav-bar element
    const navbar = document.createElement('div');
    navbar.classList.add('nav-bar');

    // Add the title
    const title = document.createElement('a');
    title.href = '/index.html';
    title.classList.add('nav-title');
    title.textContent = 'Route Planner';
    navbar.appendChild(title);

    // Define the buttons with their properties
    const buttons = [
        { id: 'home-btn', text: 'Home', href: 'home.html', icon: '/static/images/home.png' },
        { id: 'train-btn', text: 'Train', href: 'mtr.html', icon: '/static/images/mtr_button.png' },
        { id: 'transit_planner-btn', text: 'Search', href: 'transit_planner.html', icon: '/static/images/transit_planner.png' },
        { id: 'citybus-btn', text: 'CityBus', href: 'citybus.html', icon: '/static/images/citybus_button.png' },
        { id: 'tram-btn', text: 'Tram', href: 'tram_schedule.html', icon: '/static/images/tram_button.png' },
        { id: 'mini-btn', text: 'Mini Bus', href: 'minibus_schedule.html', icon: '/static/images/minibus_button.png' },
        { id: 'ferry-btn', text: 'Ferry', href: 'ferry.html', icon: '/static/images/ferry_button.png' },
    ];

    // Get the current page to set the active class
    const currentPage = window.location.pathname.split('/').pop() || 'index.html';

    // Create and append each button
    buttons.forEach(buttonData => {
        const button = document.createElement('button');
        button.id = buttonData.id;

        // Create the icon
        const icon = document.createElement('img');
        icon.src = buttonData.icon;
        icon.alt = `${buttonData.text} icon`;
        icon.style.width = '20px';
        icon.style.height = '20px';
        icon.style.marginRight = '8px';
        icon.style.verticalAlign = 'middle';

        // Add icon and text to button
        button.appendChild(icon);
        button.appendChild(document.createTextNode(buttonData.text));

        if (buttonData.href === currentPage) {
            button.classList.add('active');
        }
        button.addEventListener('click', () => {
            window.location.href = buttonData.href;
        });
        navbar.appendChild(button);
    });

    // Add dark mode toggle button
    const darkModeToggle = document.createElement('button');
    darkModeToggle.id = 'darkModeToggle';
    darkModeToggle.classList.add('dark-mode-toggle');
    darkModeToggle.setAttribute('aria-label', 'Toggle Dark Mode');
    darkModeToggle.textContent = '🌙'; // Default to moon (light mode)
    navbar.appendChild(darkModeToggle);

    // Append the navbar to the body
    document.body.insertBefore(navbar, document.body.firstChild);

    // Dark mode functions
    function toggleDarkMode() {
        const isDark = document.body.getAttribute('data-theme') === 'dark';
        if (isDark) {
            document.body.removeAttribute('data-theme');
            localStorage.setItem('theme', 'light');
            darkModeToggle.textContent = '🌙';
        } else {
            document.body.setAttribute('data-theme', 'dark');
            localStorage.setItem('theme', 'dark');
            darkModeToggle.textContent = '☀️';
        }
    }

    function initTheme() {
        const savedTheme = localStorage.getItem('theme');
        if (savedTheme === 'dark') {
            document.body.setAttribute('data-theme', 'dark');
            darkModeToggle.textContent = '☀️';
        } else {
            document.body.removeAttribute('data-theme');
            darkModeToggle.textContent = '🌙';
        }
    }

    // Initialize theme and add event listener
    initTheme();
    darkModeToggle.addEventListener('click', toggleDarkMode);
    
});