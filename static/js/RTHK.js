// RTHK.js
function createRTHKButton() {
    if (!document.querySelector('.rthk-icon')) {
        const rthkIcon = document.createElement('div');
        rthkIcon.classList.add('rthk-icon');
        document.body.appendChild(rthkIcon);
        rthkIcon.addEventListener('click', fetchNewsContent);
    }

    const modal = document.getElementById('newsModal');
    if (!modal) {
        console.warn('RTHK modal not found in HTML. Ensure #newsModal is included.');
        return;
    }

    let originalContent = '';

    function toggleModal() {
        modal.style.display = modal.style.display === 'flex' ? 'none' : 'flex';
    }

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
            .catch(error => {
                console.error('Error fetching news content:', error);
                document.getElementById('newsContent').innerHTML = 'Failed to load news.';
            });
    }

    const closeButton = modal.querySelector('.close');
    if (closeButton) {
        closeButton.addEventListener('click', toggleModal);
    }

    modal.addEventListener('click', (event) => {
        if (event.target === modal) {
            toggleModal();
        }
    });

    const btnChinese = document.getElementById('btnChinese');
    const btnEnglish = document.getElementById('btnEnglish');
    if (btnChinese) {
        btnChinese.addEventListener('click', () => {
            document.getElementById('newsContent').innerHTML = originalContent || 'No news content found.';
        });
    }
    if (btnEnglish) {
        btnEnglish.addEventListener('click', () => {
            document.getElementById('newsContent').innerHTML = originalContent || 'No news content found.';
        });
    }
}

document.addEventListener('DOMContentLoaded', () => {
    if (!window.rthkInitialized) {
        createRTHKButton();
        window.rthkInitialized = true;
    }
});