// js/main.js

document.addEventListener('DOMContentLoaded', () => {
    const backArrow = document.getElementById('back-arrow');
    const mainCategories = document.querySelector('.main-categories');
    const subCategories = document.getElementById('sub-categories');
    const mainLinks = document.querySelectorAll('.main-categories li a');

    const subCategoriesData = {
        'videogame-guides': [
            { name: 'Blasphemous - Speedrun Guide', link: 'https://steamcommunity.com/sharedfiles/filedetails/?id=2185710741', tooltip: "A quick step-by-step guide taken off of Kitokys \"All Bosses\" Glitchless speedrun. I find things easier for me whenever they're presented in a text form, so I'm going to provide all the steps taken, which will also help you hit the Bronze Medal achievement." },
            { name: 'Call of Cthulhu - Comprehensive Reference Guide & Game Lore', link: 'https://steamcommunity.com/sharedfiles/filedetails/?id=3353897658', tooltip: 'This guide provides a complete reference to all in-game journal entries in Call of Cthulhu, serving as a comprehensive story compendium. Perfect for players seeking to delve deeper into the lore or track missed content.' },
            { name: 'DARK SOULS™ III - Comprehensive Armor Spreadsheet and Calculator', link: 'https://steamcommunity.com/sharedfiles/filedetails/?id=3388837633', tooltip: "All the armor in the game in one spreadsheet with all stats and sorting method to decide the best armor for you." },
            { name: 'DARK SOULS™ III - Weapon DPS Calculator Script for SoulsPlanner', link: 'https://steamcommunity.com/sharedfiles/filedetails/?id=3385881511', tooltip: "This guide adds a DPS (Damage Per Second) column to the Dark Souls 3 Weapon Attack Table on soulsplanner.com. Using weapon-specific BPM values based on community tests (Poutsos' weapon speed tests)." },
            { name: 'Grand Theft Auto: San Andreas - Clothing & Tattoos Spreadsheet', link: 'https://steamcommunity.com/sharedfiles/filedetails/?id=3394584617', tooltip: "A spreadsheet containing all clothes from all stores sorted by Respect %, Sex Appeal %, Price and Store Name. Tattoos Included." },
            { name: 'Hitman: Codename 47 – Mission Briefings & Story Guide', link: 'https://steamcommunity.com/sharedfiles/filedetails/?id=3394584617', tooltip: "This guide breaks down each mission in Hitman: Codename 47 by providing the official briefing, intelligence, and story context to help players understand the plot and the motivations behind each assignment. It's focused on narrative and lore." },
            { name: 'Hitman: Codename 47 - Launch Errors and Fixes', link: 'https://steamcommunity.com/sharedfiles/filedetails/?id=3394584617', tooltip: "List of some crashes and can occur when launching this game and how to fix them." },
            { name: 'Resident Evil 5 - Comprehensive Weapon DPS Spreadsheet', link: 'https://steamcommunity.com/sharedfiles/filedetails/?id=3414022700', tooltip: "A detailed spreadsheet that provides comprehensive DPS data for all standard weapons in the game." },
            { name: 'Shenmue - Achievement Guide', link: 'https://steamcommunity.com/sharedfiles/filedetails/?id=3162296980', tooltip: 'A comprehensive step-by-step guide on how to get all Steam trophies for the first Shenmue game.' },
            { name: 'Shenmue - Collection Tracker', link: 'https://eeriegoesd.github.io/shenmue-collection-tracker/', tooltip: 'The Shenmue Collection Tracker is a lightweight, browser-based tool designed to help Shenmue 1 players track their progress in collecting Gacha Capsules, Cassettes, and Scrolls.\n\nThe website saves your state locally using browser cookies, so your data remains safe unless you clear them.' },
            { name: 'Shenmue I & II - Original Dreamcast Graphics Settings Guide', link: 'https://steamcommunity.com/sharedfiles/filedetails/?id=3418562523', tooltip: "This guide provides the optimal settings to replicate Shenmue's original graphics as closely as possible in the Steam version." }
        ],
        'music': [
            { name: 'Guitar Samples', link: 'https://www.beatstars.com/eeriegoesd' },
            { name: 'Beats', link: '#' }
        ],
        'apps': [
            { category: 'Apps', name: 'Useful GUI', link: '#', tooltip: 'Includes multiple small tools:\n• Basic and percentage calculators\n• Random number generator\n• Currency and time converters\n• Desktop shortcut remover\n• Simple text notebook' },
            { category: 'Apps', name: 'UnsubscribeAll', link: '#', tooltip: 'Allows bulk unsubscription from YouTube channels. Requires email authorization due to API restrictions.' },
            { category: 'Apps', name: 'ImageDownloader', link: '#', tooltip: 'Downloads high-resolution images or thumbnails from Pinterest, Instagram, YouTube, and Spotify. Supports Instagram videos and multi-posts.' },
            { category: 'Apps', name: 'Image2Text', link: '#', tooltip: 'Converts images or screen selections into plain text using OCR (Pytesseract).' },
            { category: 'League of Legends', name: 'Kill Riot', link: '#', tooltip: 'Forces the League of Legends client to close after champion select to ensure dodges are registered properly.' },
            { category: 'League of Legends', name: 'Average Rank Calculator', link: '#', tooltip: 'Displays the average rank of both teams in a League match. Lets you disable specific players to adjust the calculation.' },
            { category: 'League of Legends', name: 'Game Tracker', link: '#', tooltip: 'Tracks match outcomes like wins, losses, dodges, and AFKs. Saves data to a JSON file for review.' }
        ],
        'contacts': [
            { name: 'TikTok', link: 'https://www.tiktok.com/@eeriegoesd' },
            { name: 'YouTube', link: 'https://www.youtube.com/eeriegoesd' },
            { name: 'Instagram', link: 'https://www.instagram.com/eeriegoesd/?hl=en' },
            { name: 'Discord', link: 'https://discord.gg/45dcFxThZX' },
            { name: 'SoundCloud', link: 'https://soundcloud.com/eeriegoesd' },
            { name: 'Email', link: 'mailto:eeriegoesd@gmail.com' },
            { name: 'Buy Me a Coffee', link: 'https://buymeacoffee.com/eeriegoesd' }
        ]
    };

    function populateSubCategories(categoryKey) {
        subCategories.innerHTML = '';

        let items = subCategoriesData[categoryKey].slice();
        if (categoryKey === 'apps') {
            items.sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
        } else {
            items.sort((a, b) => a.name.localeCompare(b.name));
        }

        let lastGroup = null;
        items.forEach(item => {
            let group = null;
            if (categoryKey === 'apps') {
                group = item.category;
            } else if (categoryKey === 'videogame-guides') {
                group = item.name.charAt(0).toUpperCase();
            }

            if (group !== lastGroup && group !== null) {
                lastGroup = group;
                const headerLi = document.createElement('li');
                headerLi.textContent = group;
                headerLi.classList.add('letter');
                subCategories.appendChild(headerLi);
            }

            const li = document.createElement('li');
            const a = document.createElement('a');
            a.href = item.link;
            a.target = item.link.startsWith('mailto:') ? '_self' : '_blank';
            a.textContent = item.name;

            if (item.tooltip) {
                const tooltip = document.createElement('span');
                tooltip.classList.add('tooltip');
                tooltip.innerHTML = item.tooltip.replace(/\n/g, '<br>');
                a.appendChild(tooltip);
            }

            li.appendChild(a);
            subCategories.appendChild(li);
        });
    }

    mainLinks.forEach(link => {
        link.addEventListener('click', e => {
            e.preventDefault();
            const key = link.getAttribute('data-category');
            if (!subCategoriesData[key]) return;

            populateSubCategories(key);

            if (key === 'videogame-guides' || key === 'apps') {
                subCategories.classList.add('left-align');
            } else {
                subCategories.classList.remove('left-align');
            }

            mainCategories.classList.add('active');
            subCategories.classList.remove('hidden');
            subCategories.classList.add('show');
            backArrow.style.display = 'block';
        });
    });

    backArrow.addEventListener('click', () => {
        mainCategories.classList.remove('active');
        subCategories.classList.remove('show');
        subCategories.classList.add('hidden');
        backArrow.style.display = 'none';

        mainCategories.classList.remove('animate');
        void mainCategories.offsetWidth;
        mainCategories.classList.add('animate');

        setTimeout(() => subCategories.innerHTML = '', 500);
    });

    document.addEventListener('click', e => {
        if (!e.target.closest('.main-categories') && !e.target.closest('.sub-categories') && e.target !== backArrow) {
            if (mainCategories.classList.contains('active')) backArrow.click();
        }
    });
});