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

    async function sendCommand() {
        if (writer) {
            command = "echo off\r\n";
            await writer.write(new TextEncoder().encode(command));
            command = "help\r\n";
            await writer.write(new TextEncoder().encode(command));
        }
    }

    function processReceivedData(data) {
        buttonsDiv.innerHTML = ''; // Clear existing buttons
        const lines = data.split('\n');
        lines.forEach(line => {
            const [label, ...noteParts] = line.trim().split(' ');
            if (label) {
                const note = noteParts.join(' ');
                const buttonWrapper = document.createElement('div'); // Create a wrapper div for each button
                const button = document.createElement('button');
                button.textContent = label;
                button.title = note; // Set the tooltip
                buttonWrapper.appendChild(button); // Append the button to the wrapper
                buttonsDiv.appendChild(buttonWrapper); // Append the wrapper to the buttonsDiv
            }
        });
    }

    async function readSerial() {
        const decoder = new TextDecoder();
        let receivedData = '';

        while (port.readable && keepReading) {
            try {
                const { value, done } = await reader.read();
                if (done) {
                    // Reader has been canceled.
                    break;
                }
                const text = decoder.decode(value, {stream: true});
                receivedData += text;
                processReceivedData(receivedData);
            } catch (error) {
                console.error('Read error:', error);
                break;
            }
        }
    }

    connectButton.addEventListener('click', connectSerial);
    disconnectButton.addEventListener('click', disconnectSerial);
    sendCommandButton.addEventListener('click', sendCommand);
});
