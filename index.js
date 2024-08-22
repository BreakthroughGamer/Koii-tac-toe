const { coreLogic } = require('./coreLogic');

// Game Require Statements
const express = require('express');
const nacl = require("tweetnacl");
const { PublicKey } = require('@_koii/web3.js');
const path = require('path');



// Init Vars
let turnLog = {};
let serverGameEndState = false;
let currentServerPlayer = "player1";
let playersAwaitingReset = false;

let player1 = false;
let player2 = false;
let lobbyReady = false;

const winning_combinations = [
  ['square0', 'square1', 'square2'],
  ['square3', 'square4', 'square5'],
  ['square6', 'square7', 'square8'],
  ['square0', 'square3', 'square6'],
  ['square1', 'square4', 'square7'],
  ['square2', 'square5', 'square8'],
  ['square0', 'square4', 'square8'],
  ['square2', 'square4', 'square6']];

const newBoard = {
  'square0': null,
  'square1': null,
  'square2': null,
  'square3': null,
  'square4': null,
  'square5': null,
  'square6': null,
  'square7': null,
  'square8': null
};

var board = structuredClone(newBoard);

const {
  namespaceWrapper,
  taskNodeAdministered,
  app,
} = require('@_koii/namespace-wrapper');

if (app) {
    app.use(express.json())
    app.use(express.static(path.join(__dirname, 'client')));


    //  Write your Express Endpoints here.
    //  Ex. app.post('/accept-cid', async (req, res) => {})

    // Sample API that return your task state
    app.get('/taskState', async (req, res) => {
        const state = await namespaceWrapper.getTaskState();
        console.log('TASK STATE', state);
        res.status(200).json({ taskState: state });
    });

    // Sample API that return the value stored in NeDB
    // app.get('/value', async (req, res) => {
    // const value = await namespaceWrapper.storeGet('value');
    // console.log('value', value);
    // res.status(200).json({ value: value });
    // });

    // Game Endpoints
    app.get('/serverstatus', (req, res) => {
        res.send('<h1>Server is online.<h1>');
        res.end();
    });

    app.get('/game', (req, res) => {
        res.sendFile(__dirname + "/client/main.html");
    })

    app.get('/game/state', (req, res) => {
        res.send({
            lobbyReady:lobbyReady,
            serverGameEndState: serverGameEndState,
            playersAwaitingReset:playersAwaitingReset,
            currentServerPlayer:currentServerPlayer
        });
        res.end();
    });

    app.get("/game/board", (req, res) => {
        res.send({
            board:board,
            lobbyReady:lobbyReady,
            serverGameEndState: serverGameEndState,
            playersAwaitingReset:playersAwaitingReset,
            currentServerPlayer:currentServerPlayer
        });
        res.end();
    });

    app.get('/createGame', (req, res) => {
        player1 = true;
        if (player2) {
            lobbyReady = true;
        }
        res.send({data:"Someone Created a Game"})
        res.end();
    })

    app.get('/joinGame', (req, res) => {
        player2 = true;
        if (player1) {
            lobbyReady = true;
        }
        res.send({data:"Someone Joined a Game"})
        res.end();
    })

    app.post('/game/reset', (req, res) => {
        let resetRequestFromPlayer = req.body.player;

        if (playersAwaitingReset) {
            console.log("Received reset request. TURN LOG", turnLog)
            console.log("Resetting board. Request from", resetRequestFromPlayer)
            board = structuredClone(newBoard);
            console.log("Board", board)
            playersAwaitingReset = false;
            serverGameEndState = false;
        } else {
            console.error("players not awaiting a reset on the server.")
        }


        res.send({
            board:board,
            lobbyReady:lobbyReady,
            serverGameEndState: serverGameEndState,
            playersAwaitingReset:playersAwaitingReset,
            currentServerPlayer:currentServerPlayer
        });

        namespaceWrapper.storeSet('turnLog', turnLog);

        res.end();
    })

    app.post('/game/playerMadeMove', (req, res) => {
        let playerMoveChoice = req.body.playerMoveChoice;
        let playerWallet = req.body.playerWallet;
        console.log("Server started processing move.")


        if (board[playerMoveChoice] === null && serverGameEndState === false) {
            console.log(req.body.player, "sent move", playerMoveChoice)
            if (currentServerPlayer === "player1" && req.body.player === "player1") {
                try {
                    console.log(`Server acknowledged ${req.body.player} made move ${playerMoveChoice}`)
                    // update the servers board
                    board[playerMoveChoice] = "player1"
                    
                    // check win/tie/else
                    if (checkWin(currentServerPlayer, winning_combinations, board)) {
                        console.log("Server found a win")
                        console.log(board)
                        serverGameEndState = currentServerPlayer;
                        // reset the board
                        playersAwaitingReset = true;

                    } else if (checkTie(board)) {
                        console.log("Server found a tie.")
                        console.log(board)

                        serverGameEndState = "tie";
                        // reset the board
                        playersAwaitingReset = true;
                    } else {
                        // pass the turn off to the other player
                        console.log("Server confirmed move. Passing turn to player2. Board is now", board)
                        currentServerPlayer = "player2"

                        // Log turn to RAM
                        let turnKey = "Turn " + (Object.keys(turnLog).length + 1)
                        turnLog[turnKey] = {currentServerPlayer: currentServerPlayer, playerWallet: playerWallet ,playerMoveChoice: playerMoveChoice}
                    }

                } catch(e) {
                    console.log(`Server failed to acknowledge ${req.body.player} made a move: `, e)
                }
            } else if (currentServerPlayer === "player2" && req.body.player === "player2") {
                try {
                    console.log(`Server acknowledged ${req.body.player} made a move`)
                    let playerMoveChoice = req.body.playerMoveChoice;
                    board[playerMoveChoice] = "player2";
                    
                    // check win
                    if (checkWin(currentServerPlayer, winning_combinations, board)) {                    
                        console.log("Server found a win")
                        console.log(board)
                        serverGameEndState = currentServerPlayer;

                        // reset the board
                        playersAwaitingReset = true;

                        return null;
                    }
                    
                    // check tie
                    if (checkTie(board)) {                    
                        console.log("Server found a tie");
                        console.log(board)
                        serverGameEndState = "tie";

                        // reset the board
                        playersAwaitingReset = true;
                        return null;
                    }

                    // pass the turn off to the other player
                    console.log("Server confirmed move. Passing to next player1. Board is now", board)
                    currentServerPlayer = "player1";

                    // Log turn to RAM
                    let turnKey = "Turn " + (Object.keys(turnLog).length + 1)
                    turnLog[turnKey] = {currentServerPlayer: currentServerPlayer, playerWallet: playerWallet ,playerMoveChoice: playerMoveChoice}

                } catch(e) {
                    console.log(`Server failed to acknowledge ${req.body.player} made a move: `, e)
                }
            } else {
                console.log("Current server player is", currentServerPlayer, "and request comes from", req.body.player)
                console.error("Could not find a valid currentServerPlayer. A player is likely trying to make a move when it is not their turn (or the server has failed and requires a restart).");
            }
        } else {
            console.error("Client tried an invalid move.");
        }
        console.log("Server completed processing move.")
        res.end()
    })

    app.post('/game/verify', async (req, res) => {
        let message = Array.from(req.body.playerWallet).map(char => char.charCodeAt(0));
        let signature = req.body.signature;
        let publicKey = req.body.publicKey;

        let verification = await verify(message, signature , publicKey);
        console.log(verification);
        res.send(verification);

        res.end();
    })
}

// Game Functions

// Verify Signature
async function verify(message, signature, publicKey) {
    try {
        const verified = nacl.sign.detached.verify(
            new Uint8Array(Object.values(message)),
            new Uint8Array(Object.values(signature)),
            new Uint8Array(Object.values(new PublicKey(publicKey).toBytes()))
        );
        if (!verified) return { error: 'Invalid signature' };
        return { verified };
      } catch (e) {
        console.error(e);
        return { error: `Verification failed: ${e}` };
      }
}

async function checkTie(board){
    // console.log("Checking tie. Board looks like this:", board)
    for (let i in board) {
        if (board[i] === null) {
            return false
        }
    }
    return true
}

async function checkWin(currentPlayer, winning_combinations, board) {
    for(let i = 0; i < winning_combinations.length; i++){
        const [a, b, c] = winning_combinations[i]
        if(board[a] === currentPlayer && board[b] === currentPlayer && board[c] === currentPlayer){
            return true
        }
    }
    return false
}

async function setup() {
  /*######################################################
  ################## DO NOT EDIT BELOW #################
  ######################################################*/
  await namespaceWrapper.defaultTaskSetup();
  process.on('message', m => {
    console.log('CHILD got message:', m);
    if (m.functionCall == 'submitPayload') {
      console.log('submitPayload called');
      coreLogic.submitTask(m.roundNumber);
    } else if (m.functionCall == 'auditPayload') {
      console.log('auditPayload called');
      coreLogic.auditTask(m.roundNumber);
    } else if (m.functionCall == 'executeTask') {
      console.log('executeTask called');
      coreLogic.task(m.roundNumber);
    } else if (m.functionCall == 'generateAndSubmitDistributionList') {
      console.log('generateAndSubmitDistributionList called');
      coreLogic.selectAndGenerateDistributionList(
        m.roundNumber,
        m.isPreviousRoundFailed,
      );
    } else if (m.functionCall == 'distributionListAudit') {
      console.log('distributionListAudit called');
      coreLogic.auditDistribution(m.roundNumber);
    }
  });
  /*######################################################
  ################ DO NOT EDIT ABOVE ###################
  ######################################################*/

  /* GUIDE TO CALLS K2 FUNCTIONS MANUALLY

      If you wish to do the development by avoiding the timers then you can do the intended calls to K2 
      directly using these function calls. 

      To disable timers please set the TIMERS flag in task-node ENV to disable

      NOTE : K2 will still have the windows to accept the submission value, audit, so you are expected
      to make calls in the intended slots of your round time. 

  */

  // Get the task state
  // console.log(await namespaceWrapper.getTaskState());

  // Get round
  // const round = await namespaceWrapper.getRound();
  // console.log("ROUND", round);

  // Call to do the work for the task
  // await coreLogic.task();

  // Submission to K2 (Preferablly you should submit the cid received from IPFS)
  // await coreLogic.submitTask(round - 1);

  // Audit submissions
  // await coreLogic.auditTask(round - 1);

  // Upload distribution list to K2
  // await coreLogic.selectAndGenerateDistributionList(10);

  // Audit distribution list
  // await coreLogic.auditDistribution(round - 2);

  // Payout trigger
  // const responsePayout = await namespaceWrapper.payoutTrigger();
  // console.log("RESPONSE TRIGGER", responsePayout);

  // Logs to be displayed on desktop-node
  // namespaceWrapper.logger('error', 'Internet connection lost');
  // await namespaceWrapper.logger('warn', 'Stakes are running low');
  // await namespaceWrapper.logger('log', 'Task is running');
}

if (taskNodeAdministered) {
  setup();
}
