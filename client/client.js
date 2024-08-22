console.log("Client.js started.");

// Initializing Variables
let verificationResponse = false

let indicator = document.createElement('h2')
indicator.style.color = "white";
let resetButton = document.createElement('button')
resetButton.className = 'gameButton center'
resetButton.innerText = "Reset Game"

const players = ['player1', 'player2']

let clientBoard = null
let squares = null

let serverAwaitingReset = false;
let clientPlayer = null;
let currentServerPlayer = null;
let serverBoard = null;
let serverGameEndState = null;
let stopPollingLobby = false;
let handlingResetting = false;
let playerWallet = null;

document.getElementById("login").addEventListener('click', login)
document.getElementById("createGame").addEventListener('click', createGame)
document.getElementById("joinGame").addEventListener('click', joinGame)
squares = document.getElementsByClassName("square")
for (let square of squares) {square.addEventListener('click', sendMove)}

// Game Functions
async function login() {
    await window.k2.connect()

    playerWallet = "TestPlayerWalletKey"

    let signed = await window.k2.signMessage(playerWallet);
    
    // FOR TESTING ONLY
    // sig = true

    verificationResponse = false;
    try {
        verificationResponse = await fetch("/game/verify", {
            method:"POST", 
            headers: {
                'Accept' : 'application/json', 
                'Content-Type': 'application/json', 
            },
            body:JSON.stringify({
                playerWallet:playerWallet,
                signature:signed.signature,
                publicKey:signed.publicKey
            })
        }).then(response => response.json());

        
        console.log("Window successfully connected to K2");
    } catch (e) {
        console.error("Failed to fetch server, does Finnie have any notifications?; ", e)
    }

    if (verificationResponse) {
        document.getElementById("createGame").disabled = false;
        document.getElementById("joinGame").disabled = false;
    
        document.getElementById("login").disabled = true;
    }
}

async function createGame() {
    clientPlayer = players[0]
    
    try {
        console.log("Attempting to create game.");
        await fetch("/createGame").then((response) => response.json()).then(data => console.log(data))
    } catch(e) {
        console.log("Could not create game:", e)
    }

    document.getElementById('menu').style.display = 'none';
    document.getElementById('gameplay').style.display = 'block';

    let copyButton = document.createElement('button');
    copyButton.style.display = "block"
    copyButton.style.marginTop = "10px"
    copyButton.className = "center gameButton"
    copyButton.innerText = "Copy code to clipboard"
    copyButton.addEventListener('click', () => {
        navigator.clipboard.writeText("2bH83nm#b4b").then(function() {
            console.log("Copying to clipboard was successful")
        }, function(err) {
            console.error("Could not copy text: ", err)
        })
    })

    document.getElementById('lobbyArea').innerText = `Waiting for another player, please share Room ID:  DefaultRoomID`;
    document.getElementById('lobbyArea').appendChild(copyButton);
    
    pollServerForLobbyUpdate();
}

async function joinGame() {
    clientPlayer = players[1]
    await fetch("/joinGame").then((response) => response.json()).then(data => console.log(data))
    
    pollServerForLobbyUpdate();
}

async function sendMove(event) {
    let playerMoveChoice = await event.target.id;

    console.log(clientPlayer, "Move is", playerMoveChoice, ". Sending playerMadeMove")
    await fetch("/game/playerMadeMove", {
        method:"POST", 
        headers: {
            'Accept' : 'application/json', 
            'Content-Type': 'application/json', 
        },
        body:JSON.stringify({
            playerMoveChoice:playerMoveChoice,
            player:clientPlayer,
            playerWallet:playerWallet
        })
    });

}

async function updateBoard() {
    if (serverGameEndState === "player1") {
        if (clientPlayer === "player1") {
            indicator.textContent = `Blue Koii wins!`
            indicator.style.color = "#A0FFAB"

            handleResetButton();
    
        } else if (clientPlayer === "player2") {
            indicator.textContent = "Blue Koii wins! Waiting on Player1 for reset"
            indicator.style.color = "#F94449"
        } else {
            console.error("Could not find clientPlayer.")
        }

    } else if (serverGameEndState === "player2") {
        if (clientPlayer === "player2") {
            indicator.textContent = `Orange Koii wins!`
            indicator.style.color = "#A0FFAB"
    
            handleResetButton();

            indicator.after(resetButton)
        } else if (clientPlayer === "player1") {
            indicator.textContent = "Orange Koii wins! Waiting on Player2 for reset"
            indicator.style.color = "#F94449"
        } else {
            console.error("Could not find clientPlayer.")
        }
    } else if (serverGameEndState === "tie") { 
        if (clientPlayer === "player1") {
            indicator.textContent = `The game has ended in a tie.`
            indicator.style.color = "blue"
    
            handleResetButton();

            indicator.after(resetButton)
        } else if (clientPlayer === "player2") {
            indicator.textContent = "Game had ended in a tie. Waiting on Player1 for reset."
        } else {
            console.error("Could not find clientPlayer.")
        }
    } else {
        indicator.textContent = `You are ${clientPlayer}. It's currently ${currentServerPlayer}'s turn!`
        indicator.style.color = "white";
    }

    for (let i = 0; i < squares.length; i++) {
        const squareKey = "square"+i

        if (serverBoard[squareKey] === "player1") {
            squares[i].innerHTML = "<img src='assets/koii_blue.png' style='width:100px;height:60px;' />"
        } else if (serverBoard[squareKey] === "player2") {
            squares[i].innerHTML = "<img src='assets/koii_orange.png' style='width:100px;height:60px;' />"
        } else {
            squares[i].innerHTML = ""
        }

    }
}

function handleResetButton() {
    if (handlingResetting === false) {
        console.log("Handling Reset")
        resetButton.style.display = ""
        
        resetButton.removeEventListener('click', resetClientBoard);
        resetButton.addEventListener('click', resetClientBoard);
        
        indicator.after(resetButton)
    }
    handlingResetting = true
}

async function resetClientBoard() {
    resetButton.style.display = "none"
    indicator.style.color = "white"
    indicator.textContent = `You are ${clientPlayer}. It's currently ${currentServerPlayer}'s turn!`
    if (serverAwaitingReset === true) {

        // Posting reset to server
        console.log("Posting reset to server.")
        await fetch("/game/reset", {
            method:"POST", 
            headers: {
                'Accept' : 'application/json', 
                'Content-Type': 'application/json', 
            },
            body:JSON.stringify({
                player:clientPlayer
            })
        }).then((response) =>
            response.json()).then(data => 
                serverBoard = data.board
        ); 
        
    } else {
        console.error("Something went wrong while attempting to reset the board.")
    }
    
    for (let i = 0; i < squares.length; i++) {
        squares[i].innerHTML = "";
    }
    handlingResetting = false

}

function lobbyReady() {
    if (verificationResponse) {
        console.log("Polling server for game update...");
        stopPollingLobby = true
        pollServerForGameUpdate();
    } else {
        console.log("Something went wrong connecting to server.");
    }
    
    document.getElementById('menu').style.display = 'none';
    document.getElementById('lobbyArea').style.display = 'none';
    
    clientBoard = document.getElementById('board')
    squares = document.getElementsByClassName('square')
    
    indicator.textContent = `You are ${clientPlayer}. It's currently ${currentServerPlayer}'s turn!`
    indicator.style.marginTop = '30px'
    indicator.style.textAlign='center'
    clientBoard.after(indicator)
    
    document.getElementById('board').style.display = '';

}

// Poll
// The client needs to be constantly fetching
async function pollServerForGameUpdate() {
    try {
        let a = await fetch("/game/board").then(response => response.json())

        serverBoard = a.board;
        serverAwaitingReset = a.playersAwaitingReset;
        currentServerPlayer = a.currentServerPlayer;
        serverGameEndState = a.serverGameEndState;
        
        updateBoard();
        
    } catch (e) {
        console.error("Could not find a server: ", e)
    }
    
    try {
        setTimeout(pollServerForGameUpdate, 100);
    } catch (e) {
        console.log("Could not continue polling", e)
    }
}

async function pollServerForLobbyUpdate() {   
    if (!stopPollingLobby) {
        console.log("Polling server for lobby update...");
        try {
            await fetch("/game/state").then((response) => response.json()).then(data => {
                if (data.lobbyReady) {
                    lobbyReady();
                }
            });
    
        } catch (e) {
            console.error("Could not find a server: ", e)
        }
        setTimeout(pollServerForLobbyUpdate, 100);
    } 
}
