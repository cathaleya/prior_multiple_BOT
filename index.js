import "dotenv/config";
import blessed from "blessed";
import figlet from "figlet";
import { ethers } from "ethers";
import { HttpsProxyAgent } from 'https-proxy-agent';
import fs from 'fs';

// ========== ABI DEFINITIONS ==========
const ERC20_ABI = [
    "function name() view returns (string)",
    "function symbol() view returns (string)",
    "function totalSupply() view returns (uint256)",
    "function balanceOf(address) view returns (uint)",
    "function transfer(address to, uint amount)",
    "function allowance(address owner, address spender) external view returns (uint256)",
    "function approve(address spender, uint256 amount) external returns (bool)",
    "function transferFrom(address sender, address recipient, uint256 amount) external returns (bool)",
    "event Transfer(address indexed from, address indexed to, uint amount)"
];

const FAUCET_ABI = [
    "function claimTokens() external",
    "function lastClaimTime(address) external view returns (uint256)",
    "function claimCooldown() external view returns (uint256)"
];

// ========== CONFIGURATION ==========
const RPC_URL = process.env.RPC_URL;
const PRIVATE_KEYS = fs.readFileSync('PrivateKeys.txt', 'utf-8').split('\n').map(key => key.trim()).filter(Boolean);
const PROXIES = fs.readFileSync('proxy.txt', 'utf-8').split('\n').map(proxy => proxy.trim()).filter(Boolean);
const USDC_ADDRESS = "0x109694D75363A75317A8136D80f50F871E81044e";
const USDT_ADDRESS = "0x014397DaEa96CaC46DbEdcbce50A42D5e0152B2E";
const PRIOR_ADDRESS = "0xc19Ec2EEBB009b2422514C51F9118026f1cD89ba";
const routerAddress = "0x0f1DADEcc263eB79AE3e4db0d57c49a8b6178B0B";
const FAUCET_ADDRESS = "0xCa602D9E45E1Ed25105Ee43643ea936B8e2Fd6B7";
const NETWORK_NAME = "PRIOR TESTNET";
const SWAP_COUNT = parseInt(process.env.SWAP_COUNT) || 5;
const LOOP_DELAY = parseInt(process.env.LOOP_DELAY) || 60000;

// ========== STATE MANAGEMENT ==========
let walletsInfo = PRIVATE_KEYS.map((_, index) => ({
    index: index + 1,
    address: "",
    balanceETH: "0.00",
    balancePrior: "0.00",
    balanceUSDC: "0.00",
    balanceUSDT: "0.00",
    network: "Prior Testnet",
    status: "Initializing",
    proxy: PROXIES[index] || null
}));

let currentWalletIndex = 0;
let transactionLogs = [];
let autoModeRunning = false;
let autoModeCancelled = false;
let globalWallets = [];

// ========== SCREEN SETUP ==========
const screen = blessed.screen({
    smartCSR: true,
    title: "Cathaleya Prior Auto Bot",
    fullUnicode: true,
    mouse: true
});

// Initialize UI components
const headerBox = blessed.box({
    top: 0,
    left: "center",
    width: "100%",
    height: 8,
    tags: true,
    style: { fg: "white", bg: "default" }
});

const descriptionBox = blessed.box({
    top: 8,
    left: "center",
    width: "100%",
    height: 1,
    content: "{center}{bold}{bright-yellow-fg}« ✮  AUTO FAUCET & SWAP BOT Multi Wallet PRIOR  ✮ »{/bright-yellow-fg}{/bold}{/center}",
    tags: true,
    style: { fg: "white", bg: "default" }
});

const logsBox = blessed.box({
    top: 9,
    left: 0,
    width: "60%",
    height: "100%-9",
    label: " Transaction Logs ",
    border: { type: "line" },
    scrollable: true,
    alwaysScroll: true,
    mouse: true,
    keys: true,
    vi: true,
    tags: true,
    scrollbar: { ch: " ", inverse: true, style: { bg: "blue" } },
    content: "",
    style: { border: { fg: "bright-cyan" }, bg: "default" }
});

const walletBox = blessed.box({
    top: 9,
    left: "60%",
    width: "40%",
    height: "35%",
    label: " Wallet Info ",
    border: { type: "line" },
    tags: true,
    style: { border: { fg: "magenta" }, fg: "white", bg: "default", align: "left", valign: "top" },
    content: "Loading wallet data..."
});

const mainMenu = blessed.list({
    top: "35%",
    left: "60%",
    width: "40%",
    height: "65%",
    label: " Menu ",
    keys: true,
    vi: true,
    mouse: true,
    border: { type: "line" },
    style: {
        fg: "white",
        bg: "default",
        border: { fg: "red" },
        selected: { bg: "green", fg: "black" }
    },
    items: ["Start Auto Mode", "View Logs", "Exit"]
});

screen.append(headerBox);
screen.append(descriptionBox);
screen.append(logsBox);
screen.append(walletBox);
screen.append(mainMenu);

// ========== UTILITY FUNCTIONS ==========
function getShortAddress(address) {
    return address ? `${address.slice(0, 6)}...${address.slice(-4)}` : "N/A";
}

function addLog(message, type = "system") {
    const timestamp = new Date().toLocaleTimeString();
    const colors = {
        prior: "bright-magenta-fg",
        system: "bright-white-fg",
        error: "bright-red-fg",
        success: "bright-green-fg",
        warning: "bright-yellow-fg"
    };
    const color = colors[type] || "bright-white-fg";

    transactionLogs.push(
        `{bright-cyan-fg}[{/bright-cyan-fg} {bold}{grey-fg}${timestamp}{/grey-fg}{/bold} {bright-cyan-fg}]{/bright-cyan-fg} {bold}{${color}}${message}{/${color}}{/bold}`
    );
    updateLogs();
}

function updateLogs() {
    logsBox.setContent(transactionLogs.join("\n"));
    logsBox.setScrollPerc(100);
    screen.render();
}

function getRandomDelay() {
    return Math.floor(Math.random() * 30000) + 30000; // 30-60 seconds
}

function getRandomNumber(min, max) {
    return Math.random() * (max - min) + min;
}

function getShortHash(hash) {
    return hash ? `${hash.slice(0, 6)}...${hash.slice(-4)}` : "N/A";
}

function createProvider() {
    try {
        const currentWallet = walletsInfo[currentWalletIndex];
        if (currentWallet.proxy) {
            const proxyAgent = new HttpsProxyAgent(currentWallet.proxy);
            return new ethers.JsonRpcProvider(RPC_URL, null, { agent: proxyAgent });
        }
        return new ethers.JsonRpcProvider(RPC_URL);
    } catch (error) {
        addLog(`Provider error: ${error.message}`, "error");
        return new ethers.JsonRpcProvider(RPC_URL); // Fallback
    }
}

// ========== WALLET FUNCTIONS ==========
function updateWallet() {
    const currentWallet = walletsInfo[currentWalletIndex];
    const content = `┌── Wallet  : {bright-yellow-fg}${currentWallet.index}{/bright-yellow-fg}
└── Address : {bright-yellow-fg}${getShortAddress(currentWallet.address)}{/bright-yellow-fg}
│   ├── ETH     : {bright-green-fg}${currentWallet.balanceETH || "0.000"}{/bright-green-fg}
│   ├── PRIOR   : {bright-green-fg}${currentWallet.balancePrior || "0.00"}{/bright-green-fg}
│   ├── USDC    : {bright-green-fg}${currentWallet.balanceUSDC || "0.00"}{/bright-green-fg}
│   └── USDT    : {bright-green-fg}${currentWallet.balanceUSDT || "0.00"}{/bright-green-fg}
└── Network     : {bright-cyan-fg}${NETWORK_NAME}{/bright-cyan-fg}
└── Proxy       : {bright-blue-fg}${currentWallet.proxy ? currentWallet.proxy.split('@')[1] || currentWallet.proxy : 'None'}{/bright-blue-fg}`;

    walletBox.setContent(content);
    screen.render();
}

async function updateWalletData(walletIndex = currentWalletIndex) {
    try {
        const provider = createProvider();
        const wallet = new ethers.Wallet(PRIVATE_KEYS[walletIndex], provider);
        globalWallets[walletIndex] = wallet;
        walletsInfo[walletIndex].address = wallet.address;

        const [ethBalance, balancePrior, balanceUSDC, balanceUSDT] = await Promise.all([
            provider.getBalance(wallet.address),
            new ethers.Contract(PRIOR_ADDRESS, ERC20_ABI, provider).balanceOf(wallet.address),
            new ethers.Contract(USDC_ADDRESS, ERC20_ABI, provider).balanceOf(wallet.address),
            new ethers.Contract(USDT_ADDRESS, ERC20_ABI, provider).balanceOf(wallet.address)
        ]);

        walletsInfo[walletIndex].balanceETH = ethers.formatEther(ethBalance);
        walletsInfo[walletIndex].balancePrior = ethers.formatEther(balancePrior);
        walletsInfo[walletIndex].balanceUSDC = ethers.formatUnits(balanceUSDC, 6);
        walletsInfo[walletIndex].balanceUSDT = ethers.formatUnits(balanceUSDT, 6);

        updateWallet();
        addLog(`Wallet ${walletIndex + 1} updated`, "success");
    } catch (error) {
        addLog(`Wallet update failed: ${error.message}`, "error");
    }
}

// ========== TRANSACTION FUNCTIONS ==========
async function autoClaimFaucet() {
    try {
        const provider = createProvider();
        const wallet = new ethers.Wallet(PRIVATE_KEYS[currentWalletIndex], provider);
        const faucetContract = new ethers.Contract(FAUCET_ADDRESS, FAUCET_ABI, wallet);

        const [lastClaim, cooldown] = await Promise.all([
            faucetContract.lastClaimTime(wallet.address),
            faucetContract.claimCooldown()
        ]);

        const currentTime = Math.floor(Date.now() / 1000);
        const nextClaimTime = Number(lastClaim) + Number(cooldown);

        if (currentTime < nextClaimTime) {
            const waitTime = nextClaimTime - currentTime;
            const waitHours = Math.floor(waitTime / 3600);
            const waitMinutes = Math.floor((waitTime % 3600) / 60);
            addLog(`Wait ${waitHours}h ${waitMinutes}m before next claim`, "warning");
            return false; // Already claimed
        }

        addLog(`Claiming PRIOR faucet...`, "system");
        const tx = await faucetContract.claimTokens();
        addLog(`Tx sent: ${getShortHash(tx.hash)}`, "warning");

        const receipt = await tx.wait();
        if (receipt.status === 1) {
            addLog("Claim successful!", "success");
            await updateWalletData();
            return true; // Claim successful
        } else {
            addLog("Claim failed", "error");
            return false; // Claim failed
        }
    } catch (error) {
        addLog(`Claim error: ${error.message}`, "error");
        return false; // Error occurred
    }
}

async function performSwap() {
    try {
        const provider = createProvider();
        const wallet = new ethers.Wallet(PRIVATE_KEYS[currentWalletIndex], provider);
        const priorToken = new ethers.Contract(PRIOR_ADDRESS, ERC20_ABI, wallet);

        for (let i = 1; i <= SWAP_COUNT && !autoModeCancelled; i++) {
            try {
                const randomAmount = getRandomNumber(0.001, 0.01);
                const amountPrior = ethers.parseEther(randomAmount.toFixed(6));
                const isUSDC = i % 2 === 1;
                const functionSelector = isUSDC ? "0xf3b68002" : "0x03b530a3";
                const swapTarget = isUSDC ? "USDC" : "USDT";

                // Approval
                addLog(`Approving ${ethers.formatEther(amountPrior)} PRIOR for swap`, "prior");
                const approveTx = await priorToken.approve(routerAddress, amountPrior);
                const approveReceipt = await approveTx.wait();

                if (approveReceipt.status !== 1) {
                    addLog("Approval failed", "error");
                    continue;
                }

                // Swap execution
                const paramHex = ethers.zeroPadValue(ethers.toBeHex(amountPrior), 32);
                const txData = functionSelector + paramHex.slice(2);

                addLog(`Swapping to ${swapTarget}...`, "prior");
                const tx = await wallet.sendTransaction({
                    to: routerAddress,
                    data: txData,
                    gasLimit: 500000
                });

                const receipt = await tx.wait();
                if (receipt.status === 1) {
                    addLog(`Swap ${i}/${SWAP_COUNT} successful!`, "success");
                    await updateWalletData();
                } else {
                    addLog("Swap failed", "error");
                }
            } catch (error) {
                addLog(`Swap error: ${error.message}`, "error");
            }

            if (i < SWAP_COUNT && !autoModeCancelled) {
                const delayMs = getRandomDelay();
                await new Promise(resolve => setTimeout(resolve, delayMs));
            }
        }
        return true;
    } catch (error) {
        addLog(`Swap process failed: ${error.message}`, "error");
        return false;
    }
}

// ========== AUTO MODE ==========
async function runAutoMode() {
    if (autoModeRunning) return;

    autoModeRunning = true;
    autoModeCancelled = false;
    mainMenu.setItems(["Stop Auto Mode", "View Logs", "Exit"]);
    screen.render();

    // Load banner
    figlet.text("Cathaleya", { font: "ANSI Shadow" }, (err, data) => {
        headerBox.setContent(err ? "{center}Cathaleya Prior Bot{/center}" : `{center}${data}{/center}`);
        screen.render();
    });

    while (!autoModeCancelled) {
        for (let i = 0; i < PRIVATE_KEYS.length && !autoModeCancelled; i++) {
            currentWalletIndex = i;
            updateWallet();

            addLog(`Processing Wallet ${i + 1}/${PRIVATE_KEYS.length}`, "system");

            const claimed = await autoClaimFaucet();
            // If the faucet was already claimed, we skip to the swap directly
            if (!claimed) {
                addLog(`Faucet already claimed for Wallet ${i + 1}. Proceeding to swap...`, "warning");
            }

            await performSwap(); // Always perform the swap after checking the claim

            if (i < PRIVATE_KEYS.length - 1 && !autoModeCancelled) {
                await new Promise(resolve => setTimeout(resolve, LOOP_DELAY));
            }
        }

        if (!autoModeCancelled) {
            addLog("Cycle completed. Restarting...", "system");
            await new Promise(resolve => setTimeout(resolve, LOOP_DELAY));
        }
    }

    autoModeRunning = false;
    mainMenu.setItems(["Start Auto Mode", "View Logs", "Exit"]);
    addLog("Auto mode stopped", "system");
    screen.render();
}

function stopAutoMode() {
    if (autoModeRunning) {
        autoModeCancelled = true;
        addLog("Stopping after current operation...", "system");
    }
}

// ========== EVENT HANDLERS ==========
mainMenu.on("select", (item) => {
    switch (item.getText()) {
        case "Start Auto Mode": runAutoMode(); break;
        case "Stop Auto Mode": stopAutoMode(); break;
        case "View Logs": logsBox.focus(); break;
        case "Exit": process.exit(0);
    }
    screen.render();
});

screen.key(["escape", "q", "C-c"], () => process.exit(0));
screen.key(["C-up"], () => { logsBox.scroll(-1); screen.render(); });
screen.key(["C-down"], () => { logsBox.scroll(1); screen.render(); });

// ========== INITIALIZATION ==========
// Initial render
headerBox.setContent("{center}Initializing...{/center}");
walletBox.setContent("Loading wallet data...");
screen.render();

// Initialize wallets
globalWallets = PRIVATE_KEYS.map((key, index) => {
    try {
        const provider = walletsInfo[index].proxy 
            ? new ethers.JsonRpcProvider(RPC_URL, null, { agent: new HttpsProxyAgent(walletsInfo[index].proxy) })
            : new ethers.JsonRpcProvider(RPC_URL);
        return new ethers.Wallet(key, provider);
    } catch (error) {
        addLog(`Wallet ${index + 1} init failed: ${error.message}`, "error");
        return null;
    }
});

// Load initial data
setTimeout(async () => {
    try {
        await updateWalletData(0);
        addLog("System ready. Press [Start Auto Mode]", "success");
        mainMenu.focus();
    } catch (error) {
        addLog(`Initialization failed: ${error.message}`, "error");
    }
}, 1000);
