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

    const logMessageIdentifiers = ["[INFO]", "[ERROR]", "[WARN]", "[DEBUG]"];

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

        const button = document.createElement('button');
        button.textContent = command;
        button.title = note; // Set the tooltip

        const inputField = document.createElement('input');
        inputField.type = 'text';
        inputField.placeholder = 'Enter additional argument(s)';

        const responseDiv = document.createElement('div');
        responseDiv.id = `response-${command}`;

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
        const log = document.getElementById('rollingLog');
        const entry = document.createElement('div');
        entry.textContent = message;
        log.appendChild(entry);
    
        // Scroll to the newest entry
        log.scrollTop = log.scrollHeight;
    }    

    connectButton.addEventListener('click', connectSerial);
    disconnectButton.addEventListener('click', disconnectSerial);
    sendCommandButton.addEventListener('click', sendHelpCommand);
});
