let currentlyShowingCharacter1 = true;
let currentEmotionIndex = 0;
let apiKey = null;

//state variables
const emotions = ['annoyed with', 'mad at', 'jealous of'];
const MAX_PREVIOUS_SUGGESTIONS = 6;
let allSuggestions = [];

async function loadApiKey() {
    if (!apiKey) {
        const userApiKey = prompt('Please enter your OpenAI API key to use Storytime.\nFind your API key at: https://platform.openai.com/account/api-keys');
        if (!userApiKey) {
            throw new Error('API key is required to use Storytime.');
        }
        apiKey = userApiKey.trim();
    }
    return { OPENAI_API_KEY: apiKey };
}

async function requestInitialApiKey() {
    const message = 'Welcome to Storytime!\nTo get started, please enter your OpenAI API key.\nYou can find your API key at: https://platform.openai.com/account/api-keys';
    
    while (!apiKey) {
        const userApiKey = window.prompt(message);
        if (userApiKey && userApiKey.trim()) {
            apiKey = userApiKey.trim();
        } else {
            const tryAgain = window.confirm('An API key is required to use Storytime. Would you like to try entering it again?');
            if (!tryAgain) {
                throw new Error('API key is required.');
            }
        }
    }
}

async function callGPTStream(prompt, onUpdate) {
    console.log('Story generation prompt:', prompt);
    const config = await loadApiKey();
    const apiKey = config.OPENAI_API_KEY;
    if (!apiKey) {
        throw new Error("API key is missing in the config file.");
    }
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
            model: 'gpt-4.1',
            messages: [
                { 
                    role: 'system', 
                    content: `You are a helpful assistant that creates children's stories for an interactive educational tool. Use simple language suitable for young children. You will be given information in the following format: Character 1, Character 2, Setting, Problem, Resolution. Write a story based on these inputs, using several paragraph breaks, and in a style reminiscent of Aesop's fables.` 
                },
                { role: 'user', content: prompt }
            ],
            max_tokens: 2000,
            temperature: 1,
            stream: true
        })
    });

    if (!response.ok) {
        const errorDetails = await response.text();
        console.error(`OpenAI API error: ${response.statusText}`, errorDetails);
        throw new Error(`OpenAI API error: ${response.statusText}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let story = '';

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n').filter(line => line.trim() !== '');
        
        for (const line of lines) {
            if (line.trim() === 'data: [DONE]') {
                break;
            }
            
            if (line.startsWith('data: ')) {
                try {
                    const jsonStr = line.slice(5).trim();
                    if (!jsonStr) continue;
                    
                    const json = JSON.parse(jsonStr);
                    if (json.choices && json.choices[0].delta && json.choices[0].delta.content) {
                        const word = json.choices[0].delta.content;
                        story += word;
                        onUpdate(story);
                    }
                } catch (error) {
                    if (!line.includes('[DONE]')) {
                        console.error('Error parsing JSON:', error);
                    }
                }
            }
        }
    }
}

function getProblemContext() {
    const problemMessage = document.getElementById('problem-message');
    return problemMessage?.textContent?.trim() || '';
}

async function generateSuggestions() {
    const problem = getProblemContext();
    const char1 = document.getElementById('character-1').value;
    const char2 = document.getElementById('character-2').value;
    const setting = document.getElementById('setting').value;
    const suggestButton = document.querySelector('.suggest-button');
    const previousSuggestions = [];

    suggestButton.textContent = 'Generating...';
    suggestButton.disabled = true;

    try {
        const config = await loadApiKey();
        const suggestions = [];
        
        for (let i = 0; i < 3; i++) {
            const recentSuggestions = [...allSuggestions, ...previousSuggestions]
                .slice(-MAX_PREVIOUS_SUGGESTIONS);
            
            const previousSuggestionsText = recentSuggestions.length > 0 
                ? `Previous suggestions: ${recentSuggestions.map(s => `"${s}"`).join(', ')}. Suggest something different.`
                : '';
            
            const prompt = `Given a story set in ${setting}, with characters ${char1} and ${char2} where the problem is "${problem}", suggest a creative resolution in under 10 words. Do not enclose your answer in quotation marks. ${previousSuggestionsText}`;
            console.log(`Resolution suggestion prompt ${i + 1}:`, prompt);

            const response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${config.OPENAI_API_KEY}`
                },
                body: JSON.stringify({
                    model: 'gpt-4',
                    messages: [{
                        role: 'user',
                        content: prompt
                    }],
                    max_tokens: 50,
                    temperature: 1.1,
                })
            });
            
            if (!response.ok) throw new Error('Failed to generate suggestion');
            const data = await response.json();
            const suggestion = data.choices[0].message.content.trim();
            previousSuggestions.push(suggestion);
            suggestions.push(suggestion);
        }

        allSuggestions.push(...suggestions);

        suggestButton.innerHTML = '<div class="suggestions-list">' +
            suggestions
                .map(suggestion => `<div class="suggestion" data-suggestion="${suggestion.replace(/"/g, '&quot;')}">${suggestion}</div>`)
                .join('') +
            '</div>' +
            '<div class="refresh-suggestions">Try new suggestions</div>';

        const suggestionsList = suggestButton.querySelector('.suggestions-list');
        suggestionsList.addEventListener('click', (e) => {
            const suggestion = e.target.closest('.suggestion');
            if (suggestion) {
                e.stopPropagation();
                useResolution(suggestion.dataset.suggestion);
            }
        });

        const refreshButton = suggestButton.querySelector('.refresh-suggestions');
        refreshButton.addEventListener('click', (e) => {
            e.stopPropagation();
            generateSuggestions();
        });

        suggestButton.style.textAlign = 'left';
        
    } catch (error) {
        console.error(error);
        suggestButton.textContent = 'Error generating suggestions';
    }
}

function useResolution(text) {
    const resolutionBox = document.getElementById('resolution');
    resolutionBox.value = text;
    resolutionBox.style.height = 'auto';
    resolutionBox.style.height = resolutionBox.scrollHeight + 'px';
    resolutionBox.dispatchEvent(new Event('input'));
}

function toggleCustomProblemField() {
    const problemSelect = document.getElementById('problem-select');
    const customProblem = document.getElementById('custom-problem');
    const problemMessage = document.getElementById('problem-message');
    const lostItemInput = document.getElementById('lost-item-input');
    const conflictReasonInput = document.getElementById('conflict-reason-input');
    const character1 = document.getElementById('character-1').value || 'Character 1';
    const character2 = document.getElementById('character-2').value || 'Character 2';

    lostItemInput.style.display = 'none';
    conflictReasonInput.style.display = 'none';

    if (problemSelect.value === 'custom') {
        customProblem.style.display = 'block';
        problemMessage.innerHTML = '';
    } else {
        customProblem.style.display = 'none';
        customProblem.value = '';

        if (problemSelect.value === 'lost-item') {
            handleLostItem(character1);
        } else if (problemSelect.value === 'interpersonal-conflict') {
            handleInterpersonalConflict(character1, character2);
        } else {
            problemMessage.innerHTML = '';
        }
    }
}

function handleLostItem(character1) {
    const lostItemInput = document.getElementById('lost-item-input');
    const problemMessage = document.getElementById('problem-message');
    currentlyShowingCharacter1 = true;
    lostItemInput.style.display = 'block';
    problemMessage.innerHTML = `
        <span id="toggle-character" style="cursor: pointer; color: #6c6c6c; text-decoration: underline;" onclick="toggleCharacter()">
            ${character1}
        </span> lost an item.
    `;
}

function handleInterpersonalConflict(character1, character2) {
    const problemMessage = document.getElementById('problem-message');
    const conflictReasonInput = document.getElementById('conflict-reason-input');
    currentlyShowingCharacter1 = true;
    currentEmotionIndex = 0;
    
    conflictReasonInput.style.display = 'block';
    updateConflictMessage(character1, character2);
}

function updateConflictMessage(character1, character2) {
    const problemMessage = document.getElementById('problem-message');
    const conflictReasonInput = document.getElementById('conflict-reason-input');
    const reason = conflictReasonInput.value.trim();
    
    problemMessage.innerHTML = `
        <span id="toggle-character1" style="cursor: pointer; color: #6c6c6c; text-decoration: underline;" onclick="toggleCharacters()">${character1}</span>
        is
        <span id="toggle-emotion" style="cursor: pointer; color: #6c6c6c; text-decoration: underline;" onclick="toggleEmotion()">${emotions[currentEmotionIndex]}</span>
        <span id="toggle-character2" style="cursor: pointer; color: #6c6c6c; text-decoration: underline;" onclick="toggleCharacters()">${character2}</span>${reason ? ` because ${reason}` : ''}.
    `;
}

function toggleCharacters() {
    const character1 = document.getElementById('character-1').value || 'Character 1';
    const character2 = document.getElementById('character-2').value || 'Character 2';
    currentlyShowingCharacter1 = !currentlyShowingCharacter1;
    
    const char1Element = document.getElementById('toggle-character1');
    const char2Element = document.getElementById('toggle-character2');
    
    if (char1Element && char2Element) {
        char1Element.textContent = currentlyShowingCharacter1 ? character1 : character2;
        char2Element.textContent = currentlyShowingCharacter1 ? character2 : character1;
    }
}

function toggleEmotion() {
    const emotionElement = document.getElementById('toggle-emotion');
    currentEmotionIndex = (currentEmotionIndex + 1) % emotions.length;
    emotionElement.textContent = emotions[currentEmotionIndex];
}

function updateProblemMessage() {
    const problemSelect = document.getElementById('problem-select');
    const problemMessage = document.getElementById('problem-message');
    
    if (problemSelect.value === 'lost-item' && problemMessage) {
        const character1 = document.getElementById('character-1').value || 'Character 1';
        const character2 = document.getElementById('character-2').value || 'Character 2';
        const lostItemInput = document.getElementById('lost-item-input');
        const item = lostItemInput.value.trim();
        
        const currentCharacter = currentlyShowingCharacter1 ? character1 : character2;

        problemMessage.innerHTML = 
            `<span id="toggle-character" style="cursor: pointer; color: #6c6c6c; text-decoration: underline;" onclick="toggleCharacter()">${currentCharacter}</span>` + 
            (item ? ` lost their ${item}.` : ' lost an item.');
    } else if (problemSelect.value === 'interpersonal-conflict') {
        const character1 = document.getElementById('character-1').value || 'Character 1';
        const character2 = document.getElementById('character-2').value || 'Character 2';
        handleInterpersonalConflict(character1, character2);
    }
}

function toggleCharacter() {
    const character1 = document.getElementById('character-1').value || 'Character 1';
    const character2 = document.getElementById('character-2').value || 'Character 2';
    
    currentlyShowingCharacter1 = !currentlyShowingCharacter1;
    updateProblemMessage();
}

//event listeners
document.getElementById('character-1').addEventListener('input', updateProblemMessage);
document.getElementById('character-2').addEventListener('input', updateProblemMessage);
document.getElementById('lost-item-input').addEventListener('input', updateProblemMessage);
document.getElementById('conflict-reason-input').addEventListener('input', function() {
    const character1 = document.getElementById('character-1').value || 'Character 1';
    const character2 = document.getElementById('character-2').value || 'Character 2';
    updateConflictMessage(character1, character2);
});

document.getElementById('resolution').addEventListener('input', function() {
    this.style.height = 'auto';
    this.style.height = this.scrollHeight + 'px';
});

function checkInputs() {
    const sidebarBoxes = document.querySelectorAll('.sidebar-box textarea, .sidebar-box select');
    const generateButton = document.querySelector('.generate-button');
    const resolutionBox = document.getElementById('resolution');
    
    const requiredInputs = Array.from(sidebarBoxes).filter(input => {
        return input.id !== 'resolution' && input.id !== 'custom-problem' && input.id !== 'lost-item-input' && input.id !== 'conflict-reason-input';
    });
    
    const allRequiredFilled = requiredInputs.every(input => input.value.trim() !== '');
    
    resolutionBox.disabled = !allRequiredFilled;
    
    const allFilled = allRequiredFilled && resolutionBox.value.trim() !== '';
    generateButton.disabled = !allFilled;

    const suggestButton = document.querySelector('.suggest-button');
    if (suggestButton) {
        suggestButton.disabled = !allRequiredFilled;
    }
}

document.querySelectorAll('.sidebar-box textarea, .sidebar-box select').forEach(input => {
    input.addEventListener('input', checkInputs);
});

checkInputs();

async function generateStory() {
    const problem = getProblemContext();
    const prompt = `Character 1: ${document.getElementById('character-1').value}\n` +
        `Character 2: ${document.getElementById('character-2').value}\n` +
        `Setting: ${document.getElementById('setting').value}\n` +
        `Problem: ${problem}\n` +
        `Resolution: ${document.getElementById('resolution').value}`;
    
    const mainBox = document.querySelector('.main-box');
    mainBox.textContent = '';

    try {
        await callGPTStream(prompt, (updatedStory) => {
            mainBox.innerHTML = updatedStory
                .split('\n\n')
                .filter(para => para.trim() !== '')
                .map(para => `<p>${para.trim()}</p>`)
                .join('');
            document.querySelector('.container').style.height = 'auto';
        });
    } catch (error) {
        mainBox.innerHTML = `<p>An error occurred while generating the story: ${error.message}. Please refresh the page to try again.</p>`;
    }
}

async function loadReadme() {
    try {
        const response = await fetch('README.md');
        if (!response.ok) {
            throw new Error(`Failed to load readme: ${response.statusText}`);
        }
        const text = await response.text();
        const readmeContent = document.getElementById('readme-content');
        
        if (!window.marked) {
            const script = document.createElement('script');
            script.src = 'https://cdn.jsdelivr.net/npm/marked/marked.min.js';
            script.onload = () => {
                readmeContent.innerHTML = marked.parse(text);
            };
            document.head.appendChild(script);
        } else {
            readmeContent.innerHTML = marked.parse(text);
        }
    } catch (error) {
        console.error(error);
        document.getElementById('readme-content').textContent = "Failed to load readme.";
    }
}

loadReadme();

function clearAllInputs() {
    document.querySelectorAll('textarea, select').forEach(el => {
        el.value = '';
    });

    document.getElementById('custom-problem').style.display = 'none';
    document.getElementById('lost-item-input').style.display = 'none';
    document.getElementById('conflict-reason-input').style.display = 'none';
    document.getElementById('problem-message').innerHTML = '';
    document.getElementById('problem-select').selectedIndex = 0;

    document.querySelector('.main-box').innerHTML = '';

    const suggestButton = document.querySelector('.suggest-button');
    if (suggestButton) {
        suggestButton.textContent = 'Generate suggestions';
    }

    allSuggestions = [];
    currentlyShowingCharacter1 = true;
    currentEmotionIndex = 0;

    checkInputs();
}

//initialize
window.addEventListener('DOMContentLoaded', async () => {
    clearAllInputs();
    try {
        await requestInitialApiKey();
    } catch (error) {
        console.error('Failed to load API key:', error);
        document.querySelector('.main-box').innerHTML = '<p>API key is required to use Storytime. Please refresh the page to try again.</p>';
    }
});