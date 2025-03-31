// navbar.js
function createNavbar() {
    // Create the nav-bar element
    const navbar = document.createElement('div');
    navbar.classList.add('nav-bar');

// Add the title
const title = document.createElement('a');
title.href = 'index.html';
title.classList.add('nav-title');
title.textContent = 'Route Planner';
navbar.appendChild(title);
    // Define the buttons with their properties, including icon URLs
    const buttons = [
        { id: 'train-btn', text: 'Train', href: 'mtr.html', icon: src="mtr_button.png" },
        { id: 'bus-btn', text: 'Bus', href: 'KMBbus.html', icon: src="kmb_button.png"},
        { id: 'bus-btn', text: 'CityBus', href: 'citybus.html', icon: src="citybus_button.png"},
        { id: 'tram-btn', text: 'Tram', href: 'tram_schedule.html', icon: src="tram_button.png" },
        { id: 'mini-btn', text: 'Mini Bus', href: 'minibus_schedule.html', icon: src="minibus_button.png" }
    ];
    function createNavbar() {
        // Create the nav-bar element
        const navbar = document.createElement('div');
        navbar.classList.add('nav-bar');
    
        // Add the title
        const title = document.createElement('a');
        title.href = 'index.html';
        title.classList.add('nav-title');
        title.textContent = 'Route Planner';
        navbar.appendChild(title);
    
        // Rest of the function (buttons, etc.) remains unchanged
        // ...
    }
    // Get the current page to set the active class
    const currentPage = window.location.pathname.split('/').pop() || 'index.html';

    // Create and append each button
    buttons.forEach(buttonData => {
        const button = document.createElement('button');
        button.id = buttonData.id;

        // Create the icon
        const icon = document.createElement('img');
        icon.src = buttonData.icon; // Jogging icon (or customize per button)
        icon.alt = `${buttonData.text} icon`;
        icon.style.width = '20px'; // Adjust size as needed
        icon.style.height = '20px';
        icon.style.marginRight = '8px'; // Space between icon and text
        icon.style.verticalAlign = 'middle'; // Align with text

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

    // Append the navbar to the body
    document.body.appendChild(navbar);
}

// Call the function when the DOM is fully loaded
document.addEventListener('DOMContentLoaded', createNavbar);