# Cathaleya Prior Auto Bot

This is an automated bot for claiming tokens from a faucet and swapping them on the Prior Testnet. The bot supports multiple wallets and uses proxies for enhanced privacy.

## Features

- Automatically claims tokens from a specified faucet.
- Swaps tokens between USDC and USDT.
- Supports multiple wallets.
- Configurable delay between operations.

## Prerequisites

Before you begin, ensure you have the following installed:

- [Node.js](https://nodejs.org/) (version 14 or higher)
- [npm](https://www.npmjs.com/) (Node package manager)

## Installation

1. **Clone the repository** (if applicable):
   ```bash
   git clone https://github.com/cathaleya/prior_multiple_BOT.git
   cd prior_multiple_BOT
2. **Install the required modules: Run the following command to install the necessary dependencies:

   npm install

3.** Create configuration files:

**Create a file named PrivateKeys.txt in the root directory of the project. This file should contain one private key per line for each wallet you want to use.
**Create a file named proxy.txt in the root directory of the project (optional). This file should contain one proxy per line if you want to use proxies.
**Set up environment variables: Create a .env file in the root directory and add the following variables:*

RPC_URL=RPC_URL=https://sepolia.base.org
SWAP_COUNT=<number_of_swaps>  # Optional, default is 5
LOOP_DELAY=<delay_in_milliseconds>  # Optional, default is 60000 (60 seconds)

To run the bot, use the following command:

node index.js

Commands
Start Auto Mode: Begins the automated claiming and swapping process.
Stop Auto Mode: Stops the current operation and exits the auto mode.
View Logs: Displays the transaction logs.
Exit: Exits the application.
Notes
Ensure that your private keys are kept secure and never shared.
Test the bot in a safe environment before using it with real funds.
Adjust the SWAP_COUNT and LOOP_DELAY in the .env file as needed.
