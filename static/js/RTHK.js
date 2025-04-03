// RTHK.js
function createRTHKButton() {
    // Create the RTHK button (as an icon)
    const rthkIcon = document.createElement('div');
    rthkIcon.classList.add('rthk-icon');
    document.body.appendChild(rthkIcon);

    // Create the modal
    const modal = document.createElement('div');
    modal.id = 'newsModal';
    modal.classList.add('modal');
    modal.innerHTML = `
        <div class="modal-content">
            <span class="close">×</span>
            <div class="language-switch">
                <button id="btnChinese">中文</button>
                <button id="btnEnglish">English</button>
            </div>
            <div id="newsContent">Loading news content...</div>
            <div class="source-reference">Source: RTHK</div>
        </div>
    `;
    document.body.appendChild(modal);

    // Variables for news content
    let originalContent = '';

    // Toggle modal function
    function toggleModal() {
        modal.style.display = modal.style.display === 'block' ? 'none' : 'block';
    }

    // Fetch news content function
    function fetchNewsContent() {
        fetch('https://programme.rthk.hk/channel/radio/trafficnews/index.php')
            .then(response => response.text())
            .then(data => {
                const parser = new DOMParser();
                const doc = parser.parseFromString(data, 'text/html');
                const newsItems = doc.querySelectorAll('ul.dec > li.inner');
                let innerContent = '';
                newsItems.forEach(item => {
                    const textContent = item.textContent.trim();
                    innerContent += `<div class="news-item">${textContent}</div>`;
                });
                originalContent = innerContent;
                document.getElementById('newsContent').innerHTML = originalContent || 'No news content found.';
                toggleModal();
            })
            .catch(error => console.error('Error fetching news content:', error));
    }

    // Event listeners
    rthkIcon.addEventListener('click', fetchNewsContent);
    modal.querySelector('.close').addEventListener('click', toggleModal);
    modal.addEventListener('click', (event) => {
        if (event.target === modal) {
            toggleModal();
        }
    });
    document.getElementById('btnChinese').addEventListener('click', () => {
        document.getElementById('newsContent').innerHTML = originalContent || 'No news content found.';
    });
}

// Call the function when the DOM is fully loaded
document.addEventListener('DOMContentLoaded', createRTHKButton);