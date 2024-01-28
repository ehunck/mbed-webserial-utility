document.addEventListener('DOMContentLoaded', () => {
    const connectButton = document.getElementById('connectButton');
    const disconnectButton = document.getElementById('disconnectButton');
    const sendCommandButton = document.getElementById('sendCommandButton');
    const baudRateSelect = document.getElementById('baudRate');
    const statusDiv = document.getElementById('status');
    const dataReceivedTextarea = document.getElementById('dataReceived');

    let port;
    let reader;
    let writer;
    let keepReading = false;
    let pendingData = '';
    let awaitingHelpResponse = false;

    const logMessageIdentifiers = ["[INFO]", "[ERR ]", "[WARN]", "[DBG ]"];

    async function connectSerial() {
        try {
            port = await navigator.serial.requestPort();
            await port.open({ baudRate: parseInt(baudRateSelect.value) });
            reader = port.readable.getReader();
            writer = port.writable.getWriter();
            keepReading = true;
            readSerial();
            statusDiv.textContent = 'Status: Connected';
            connectButton.disabled = true;
            disconnectButton.disabled = false;
            sendCommandButton.disabled = false;
        } catch (error) {
            console.error('Error:', error);
        }
    }

    async function disconnectSerial() {
        if (reader) {
            await reader.cancel();
            await reader.releaseLock();
        }
        if (writer) {
            await writer.releaseLock();
        }
        if (port) {
            await port.close();
            port = null;
        }
        keepReading = false;
        statusDiv.textContent = 'Status: Disconnected';
        connectButton.disabled = false;
        disconnectButton.disabled = true;
        sendCommandButton.disabled = true;
    }

    async function sendCommand(command, additionalString) {
        if (writer) {
            lastCommandSent = command; // Store the last command sent
            let fullCommand = command + " " + additionalString + "\r\n";
            await writer.write(new TextEncoder().encode(fullCommand));
        }
    }

    async function sendHelpCommand() {
        if (writer) {
            while (buttonsDiv.firstChild) {
                buttonsDiv.removeChild(buttonsDiv.firstChild);
            }
            command = "echo off\r\n";
            await writer.write(new TextEncoder().encode(command));
            command = "help\r\n";
            await writer.write(new TextEncoder().encode(command));
            awaitingHelpResponse = true;
            pendingData = ''; // Reset pending data
            lastCommandSent = '';
        }
    }

    function createButtonWithResponse(command, note) {
        const buttonWrapper = document.createElement('div');
        buttonWrapper.style.display = 'flex'; // Set display to flex for horizontal alignment
        buttonWrapper.style.alignItems = 'center'; // Align items vertically
        buttonWrapper.style.gap = '4px'; // Add a gap between elements
    
        const button = document.createElement('button');
        button.textContent = command;
        button.title = note; // Set the tooltip
        button.style.marginBottom = '2px';
        button.style.marginTop = '2px';
        button.style.marginLeft = '2px';
        button.style.marginRight = '2px';
    
        const inputField = document.createElement('input');
        inputField.type = 'text';
        inputField.placeholder = 'Enter additional string';
    
        const responseDiv = document.createElement('div');
        responseDiv.id = `response-${command}`;
        responseDiv.style.whiteSpace = 'nowrap'; // Prevent wrapping of response text
    
        button.addEventListener('click', () => {
            let additionalString = inputField.value;
            sendCommand(command, additionalString);
        });
    
        buttonWrapper.appendChild(button);
        buttonWrapper.appendChild(inputField);
        buttonWrapper.appendChild(responseDiv);
    
        buttonsDiv.appendChild(buttonWrapper);
    }
    

    function updateResponseDisplay(command, response) {
        const responseDiv = document.getElementById(`response-${command}`);
        if (responseDiv) {
            responseDiv.textContent = response;
        }
    }

    function filterEscapeSequences(text) {
        // Define the regular expressions for the sequences
        const escapeSequence0 = /\x1B\[2J/g; // Matches '\x1B[2J'
        const escapeSequence1 = /\x1B\[2K/g; // Matches '\x1B[2K'
        const escapeSequence2 = /\x1B\[0m/g; // Matches '\x1B[0m'
        const escapeSequence3 = /\x1B\[31m/g; // Matches '\x1B[31m'
        const escapeSequence4 = /\x1B\[33m/g; // Matches '\x1B[33m'
        const escapeSequence5 = /\x1B\[94m/g; // Matches '\x1B[94m'
        const escapeSequence6 = /\x1B\[7h/g; // Matches '\x1B[94m'
        // Replace the sequences with an empty string
        return text.replace(escapeSequence0, '').replace(escapeSequence1, '').replace(escapeSequence2, '').replace(escapeSequence3, '').replace(escapeSequence4, '').replace(escapeSequence5, '').replace(escapeSequence6, '');
    }

    async function readSerial() {
        const decoder = new TextDecoder();

        while (port.readable && keepReading) {
            try {
                const { value, done } = await reader.read();
                if (done) {
                    break; // Reader has been canceled
                }
                const text = decoder.decode(value, {stream: true});
                pendingData += text;

                // Process complete lines
                let eolIndex;
                while ((eolIndex = pendingData.indexOf('\n')) >= 0) {
                    let line = pendingData.slice(0, eolIndex).trim();
                    pendingData = pendingData.slice(eolIndex + 1);
                    
                    line = filterEscapeSequences(line); // filter escaped sequences

                    if ( logMessageIdentifiers.some(str => line.includes(str)) ) {
                        // Line goes in the general log
                        appendToLog(line);
                    } else if (awaitingHelpResponse) {
                        // Line is discarded while we wait for the message indicating the start of the commands
                        if (line.toLowerCase().startsWith("false")) { // 'false' is the last default command
                            // Start processing commands after this line
                            awaitingHelpResponse = false;
                        }
                    } else if( lastCommandSent === "" ) {
                        // Line defines a command that can be sent
                        processLine(line); // Process the line as a command
                    }
                    else if( lastCommandSent ) {
                        // Line is a response from a command that was just sent
                        processReceivedData(line); // Process the line as a potential response
                    }
                    else
                    {
                        // Line goes in the general log
                        appendToLog(line);
                    }
                }
            } catch (error) {
                console.error('Read error:', error);
                break;
            }
        }
    }

    function processReceivedData(line) {
        if (line && lastCommandSent) {
            // Assuming the line is a response to the last command sent
            updateResponseDisplay(lastCommandSent, line);
            lastCommandSent = ''; // Reset the last command sent
        }
    }

    function processLine(line) {
        const [command, ...noteParts] = line.split(' ');
        if (command) {
            createButtonWithResponse(command, noteParts.join(' '));
        }
    }

    function appendToLog(message) {
        const log = document.getElementById('logContent');
        const entry = document.createElement('div');
    
        // Get current Unix timestamp in seconds
        const unixTimestamp = Math.floor(Date.now() / 1000);
    
        // Prepend the timestamp to the message
        entry.textContent = `${unixTimestamp}: ${message}`;
        
        log.appendChild(entry);
    
        // Scroll to the newest entry
        log.scrollTop = log.scrollHeight;
    }

    document.getElementById('clearLogButton').addEventListener('click', () => {
        document.getElementById('logContent').innerHTML = '';
    });
    
    document.getElementById('saveLogButton').addEventListener('click', () => {
        const logContent = document.getElementById('logContent').innerText;
        const blob = new Blob([logContent], { type: 'text/plain' });
    
        // Get current Unix timestamp in seconds
        const unixTimestamp = Math.floor(Date.now() / 1000);
    
        // Generate the filename with the current Unix timestamp
        const fileName = `log_${unixTimestamp}.txt`;
    
        const fileUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = fileUrl;
        a.download = fileName; // Use the dynamically generated filename
        a.click();
    
        URL.revokeObjectURL(fileUrl);
    });
    

    let isDragging = false;

    document.getElementById('resizeHandle').addEventListener('mousedown', function(e) {
        isDragging = true;
    });

    document.addEventListener('mousemove', function(e) {
        if (isDragging) {
            const windowHeight = window.innerHeight;
            const handleHeight = 10; // Height of the handle
            let newHeight = (windowHeight - e.clientY - handleHeight) / windowHeight * 100;
            
            // Constrain the height between 10% and 60%
            newHeight = Math.max(10, Math.min(newHeight, 60));

            document.getElementById('rollingLog').style.height = `${newHeight}%`;
            document.getElementById('resizeHandle').style.bottom = `${newHeight}%`;
        }
    });

    document.addEventListener('mouseup', function(e) {
        isDragging = false;
    });

    
    connectButton.addEventListener('click', connectSerial);
    disconnectButton.addEventListener('click', disconnectSerial);
    sendCommandButton.addEventListener('click', sendHelpCommand);
});
