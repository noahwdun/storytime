async function loadApiKey() {
    try {
        const response = await fetch('api-key.json'); // Fetch the config file
        if (!response.ok) {
            throw new Error(`Failed to load config: ${response.statusText}`);
        }
        const config = await response.json(); // Parse the JSON
        return config;
    } catch (error) {
        console.error(error);
        throw new Error("Unable to load configuration.");
    }
}

async function callGPTStream(prompt, onUpdate) {
    const config = await loadApiKey(); // Corrected function name
    const apiKey = config.OPENAI_API_KEY; // Access the API key
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
            model: 'gpt-4.1', // Specify the correct model
            messages: [
                { 
                    role: 'system', 
                    content: `You are a helpful assistant that creates children's stories for an interactive educational tool. Use simple language suitable for young children. You will be given information in the following format: Character 1, Character 2, Setting, Problem, Resolution. Write a story based on these inputs, using several paragraph breaks, and in a style reminiscent of Aesop's fables.` 
                },
                { role: 'user', content: prompt }
            ],
            max_tokens: 2000, // Adjust token limit as needed
            temperature: 1, // Adjust creativity level as needed
            stream: true // Enable streaming
        })
    });

    if (!response.ok) {
        const errorDetails = await response.text(); // Log detailed error response
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
            if (line === '[DONE]') {
                // End of stream, break out of the loop
                break;
            }
            if (line.startsWith('data: ')) {
                try {
                    const json = JSON.parse(line.slice(6));
                    if (json.choices && json.choices[0].delta && json.choices[0].delta.content) {
                        const word = json.choices[0].delta.content;
                        story += word;
                        onUpdate(story); // Update the story in real-time
                    }
                } catch (error) {
                    console.error('Error parsing JSON:', error);
                }
            }
        }
    }
}

function toggleCustomProblemField() {
    const problemSelect = document.getElementById('problem-select');
    const customProblem = document.getElementById('custom-problem');
    if (problemSelect.value === 'custom') {
        customProblem.style.display = 'block';
        customProblem.disabled = false; // Enable the custom problem field
    } else {
        customProblem.style.display = 'none';
        customProblem.disabled = true; // Disable the custom problem field
        customProblem.value = ''; // Clear the custom problem field when hidden
    }
}

function checkInputs() {
    const sidebarBoxes = document.querySelectorAll('.sidebar-box textarea, .sidebar-box select');
    const generateButton = document.querySelector('.generate-button');
    const allFilled = Array.from(sidebarBoxes).every(input => {
        if (input.style.display === 'none') return true; // Skip hidden inputs
        return input.value.trim() !== '';
    });
    generateButton.disabled = !allFilled; // Enable button if all inputs are filled
}

// Attach event listeners to all inputs
document.querySelectorAll('.sidebar-box textarea, .sidebar-box select').forEach(input => {
    input.addEventListener('input', checkInputs);
});

// Call checkInputs initially to set the correct state
checkInputs();

async function generateStory() {
    const problemSelect = document.getElementById('problem-select');
    const customProblem = document.getElementById('custom-problem');
    const problem = problemSelect.value === 'custom' && !customProblem.disabled
        ? customProblem.value
        : problemSelect.value;

    const prompt = `Character 1: ${document.querySelector('.sidebar-box:nth-child(1) textarea').value}\n` +
        `Character 2: ${document.querySelector('.sidebar-box:nth-child(2) textarea').value}\n` +
        `Setting: ${document.querySelector('.sidebar-box:nth-child(3) textarea').value}\n` +
        `Problem: ${problem}\n` +
        `Resolution: ${document.querySelector('.sidebar-box:nth-child(5) textarea').value}`;
    
    const mainBox = document.querySelector('.main-box');
    mainBox.textContent = ''; // Clear the main box before generating the story

    try {
        await callGPTStream(prompt, (updatedStory) => {
            mainBox.textContent = updatedStory; // Update the main box as the story is generated
        });
    } catch (error) {
        console.error(error);
        mainBox.textContent = `An error occurred while generating the story: ${error.message}. Please try again later.`;
    }
}

async function loadInfoText() {
    try {
        const response = await fetch('info page.txt'); // Fetch the file
        if (!response.ok) {
            throw new Error(`Failed to load info page: ${response.statusText}`);
        }
        const text = await response.text(); // Get the text content
        document.getElementById('info-text').textContent = text; // Set the text in the element
    } catch (error) {
        console.error(error);
        document.getElementById('info-text').textContent = "Failed to load information.";
    }
}

// Call the function to load the text when the page loads
loadInfoText();