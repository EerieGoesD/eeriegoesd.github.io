document.addEventListener('DOMContentLoaded', () => {
    function updateProgress() {
        const checkboxes = document.querySelectorAll('#progress-tracker .status-checkbox');
        const collections = {};
        let overallChecked = 0;
        let overallTotal = 0;

        checkboxes.forEach(checkbox => {
            const collection = checkbox.dataset.collection;
            if (!collections[collection]) {
                collections[collection] = { checked: 0, total: 0 };
            }
            collections[collection].total += 1;
            if (checkbox.checked) {
                collections[collection].checked += 1;
                overallChecked += 1;
            }
            overallTotal += 1;
        });

        for (const [collection, data] of Object.entries(collections)) {
            const percentage = data.total === 0 ? 0 : Math.round((data.checked / data.total) * 100);
            const sanitizedCollection = collection.replace(/\s+/g, '');
            const progressDiv = document.getElementById(`${sanitizedCollection}-progress`);
            if (progressDiv) {
                const collectionDiv = document.querySelector(`div.collection[data-collection-type="${collection}"]`);
                const collectionName = collectionDiv ? collectionDiv.querySelector('h3').textContent : collection;
                progressDiv.textContent = `${percentage}% ${collectionName} Completed / ${overallTotal === 0 ? 0 : Math.round((overallChecked / overallTotal) * 100)}% Total Collection Completed`;
            }
        }

        const overallPercentage = overallTotal === 0 ? 0 : Math.round((overallChecked / overallTotal) * 100);
        const overallProgressDiv = document.getElementById('Overall-progress');
        if (overallProgressDiv) {
            overallProgressDiv.textContent = `${overallPercentage}% Total Collection Completed`;
        }
    }

    function showPopup(checkbox, message) {
        const existingPopup = checkbox.closest('td').querySelector('.popup-progress');
        if (existingPopup) {
            existingPopup.remove();
        }

        const popup = document.createElement('div');
        popup.className = 'popup-progress';
        popup.textContent = message;

        checkbox.closest('td').appendChild(popup);

        void popup.offsetWidth;

        popup.classList.add('show');

        setTimeout(() => {
            popup.classList.remove('show');
            popup.addEventListener('transitionend', () => {
                popup.remove();
            });
        }, 2600);
    }

    function loadProgress() {
        const checkboxes = document.querySelectorAll('#progress-tracker .status-checkbox');
        checkboxes.forEach(checkbox => {
            const id = checkbox.id;
            const savedState = localStorage.getItem(id);
            if (savedState === 'true') {
                checkbox.checked = true;
            }
        });
    }

    function saveProgress(id, state) {
        if (state) {
            localStorage.setItem(id, 'true');
        } else {
            localStorage.removeItem(id);
        }
    }

    function exportProgress() {
        const state = {};
        const checkboxes = document.querySelectorAll('#progress-tracker .status-checkbox');
        checkboxes.forEach(checkbox => {
            state[checkbox.id] = checkbox.checked;
        });
        const stateJSON = JSON.stringify(state, null, 2);

        const blob = new Blob([stateJSON], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = 'shenmue-collection-progress.json';
        a.click();

        URL.revokeObjectURL(url);
    }

    function importProgress(event) {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const state = JSON.parse(e.target.result);
                const checkboxes = document.querySelectorAll('#progress-tracker .status-checkbox');
                checkboxes.forEach(checkbox => {
                    if (state[checkbox.id] !== undefined) {
                        checkbox.checked = state[checkbox.id];
                    }
                });
                updateProgress();
                alert('Progress has been successfully loaded!');
            } catch (error) {
                alert('Error loading progress. Please make sure the file format is correct.');
            }
        };
        reader.readAsText(file);
    }

    function updateStatus(checkbox, label) {
        if (checkbox.checked) {
            label.classList.add('done');
            label.classList.remove('in_progress');
        } else {
            label.classList.add('in_progress');
            label.classList.remove('done');
        }
    }

    function initTracker() {
        loadProgress();

        updateProgress();

        const checkboxes = document.querySelectorAll('#progress-tracker .status-checkbox');
        checkboxes.forEach(checkbox => {
            const label = checkbox.nextElementSibling;
            updateStatus(checkbox, label);

            checkbox.addEventListener('change', () => {
                const id = checkbox.id;
                const collection = checkbox.dataset.collection;

                saveProgress(id, checkbox.checked);

                updateProgress();

                const collectionCheckboxes = document.querySelectorAll(`input[data-collection="${collection}"]`);
                const total = collectionCheckboxes.length;
                const checked = Array.from(collectionCheckboxes).filter(cb => cb.checked).length;
                const percentage = total === 0 ? 0 : Math.round((checked / total) * 100);

                const allCheckboxes = document.querySelectorAll('#progress-tracker .status-checkbox');
                const overallTotal = allCheckboxes.length;
                const overallChecked = Array.from(allCheckboxes).filter(cb => cb.checked).length;
                const overallPercentage = overallTotal === 0 ? 0 : Math.round((overallChecked / overallTotal) * 100);

                const collectionDiv = document.querySelector(`div.collection[data-collection-type="${collection}"]`);
                const collectionName = collectionDiv ? collectionDiv.querySelector('h3').textContent : collection;
                const message = `${percentage}% ${collectionName} Completed / ${overallPercentage}% Total Collection Completed`;

                showPopup(checkbox, message);

                updateStatus(checkbox, label);
            });
        });

        const exportBtn = document.getElementById('export-state-btn');
        if (exportBtn) {
            exportBtn.addEventListener('click', exportProgress);
        }

        const importInput = document.getElementById('import-state-input');
        if (importInput) {
            importInput.addEventListener('change', importProgress);
        }
    }

    initTracker();
});