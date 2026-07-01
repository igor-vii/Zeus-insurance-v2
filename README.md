⚡ Zeus Insurance – Decentralized Insurance Protocol for AI Agents
Zeus Insurance protects AI agents from financial losses caused by API and service failures. When a seller fails to deliver, the buyer receives automatic compensation from the protocol's reserve fund.

🚀 Live on Base Sepolia – ready for testing and integration.

🎯 The Problem
AI agents increasingly pay for API calls, data, and compute. But sellers may fail to respond — money is deducted, the agent receives nothing. Manual refunds are slow and require trust.

Zeus solves this by providing a trustless, on-chain insurance layer for agent-to-agent payments.

💡 How It Works
Buy Insurance – The buyer pays a small premium (7–25% of the transaction amount) to insure an API call.
Timeout – If the seller does not respond within the specified time, the buyer becomes eligible for compensation.
Claim Payout – The buyer submits a claim, and the protocol automatically pays compensation from the reserve fund.
Key features:

Fully on-chain, transparent, and auditable.
Smart escrow logic ensures trustless execution.
Premiums are pooled in a reserve fund to guarantee payouts.
No central authority — everything is governed by smart contracts.
🛠️ Technology Stack
Component	Technology
Smart Contracts	Solidity 0.8.24, OpenZeppelin v5
Testnet	Base Sepolia (L2 on Ethereum)
Token	USDC (6 decimals)
Frontend	React, ethers.js, Tailwind CSS
Development	Hardhat, TypeScript, pnpm
Hosting	Replit / GitHub Codespaces / Netlify
📦 Repository Structure
zeus-insurance/ ├── contracts/ │ ├── ZeusInsuranceV2.sol # Main insurance contract │ ├── ZeusReserveV2.sol # Reserve fund contract │ └── interfaces/ │ └── IInsuranceContract.sol ├── frontend/ # React interface ├── scripts/ # Deployment scripts ├── test/ # Unit tests ├── hardhat.config.ts ├── package.json └── README.md

🔗 Live Contracts (Base Sepolia)
Contract	Address	BaseScan
ZeusInsuranceV2	0xE0b89E0DEa7Fc7AEa7CEcC62a0A14d52de42Ce3b	View
ZeusReserveV2	0xF5010Afe1856be1F447f962Dfa8AA30c2Ed19a47	View
USDC Address (Base Sepolia): 0x036CbD53842c5426634e7929541eC2318f3dCF7e

🏦 Reserve Fund
The reserve fund holds USDC and is managed by the ZeusReserveV2 contract.

Premiums automatically go to the reserve.
Payouts are made from the reserve when claims are approved.
Daily payout limit: 1,000 USDC (configurable).
Minimum reserve threshold: 100 USDC (configurable).
This ensures that the protocol remains solvent and can handle multiple claims without external funding.

🚀 Getting Started
1. Clone the repository
git clone https://git clone https://github.com/igor-vii/Zeus-insurance-v2.git
cd zeus-insurance
2. Install dependencies
bash
cd contracts
npm install
3. Set up environment
Create a .env file in the contracts folder:

env
PRIVATE_KEY=0xyour_private_key
4. Compile contracts
bash
npx hardhat compile
5. Run tests
bash
npx hardhat test
All 30+ tests should pass.

6. Deploy to Base Sepolia
bash
npx hardhat run scripts/deploy-v2.js --network baseSepolia
🖥️ Frontend
The React frontend allows users to:

Connect MetaMask (Base Sepolia).

Buy insurance for API calls.

View all policies and their status.

Submit claims and receive payouts.

To run locally:

bash
cd frontend
npm install
npm run dev
Open http://localhost:3000 in your browser.

🧪 Testing the Full Flow
Fund the reserve – Send USDC to ZeusReserveV2 via the admin panel or script.

Buy insurance – Use the frontend to create a policy.

Wait for timeout – Simulate seller failure by waiting for the timeout period.

Claim payout – Submit a claim and verify that compensation is sent from the reserve.

📊 Roadmap
Phase	Status	Goal
Smart Contracts	✅	ZeusInsuranceV2 + ZeusReserveV2 deployed and verified
Frontend	✅	Basic interface for testing
Reserve Fund	✅	USDC-based reserve with daily limits
SDK (JavaScript)	🔜	Client library for developers
Proxy API	🔜	HTTP endpoint for agent integration
Mainnet Deployment	🔜	Move to Base Mainnet
🤝 Contributing
We welcome contributors! Here's how you can help:

⭐ Star the repository on GitHub.

🧪 Test the protocol on Base Sepolia and report issues.

💻 Contribute code (SDK, frontend improvements, additional tests).

📢 Spread the word to developers building AI agents.

To get started:

Fork the repository.

Create a branch for your feature.

Submit a Pull Request.

🤝 Contacts
GitHub: igor-vii/zeus-insurance

Telegram: @IvanovVII

Website: https://zeus-insurance--zeusinsurance.replit.app

zeusinsurance@mail.ru

⭐ Support the Project
If you find this project useful:

⭐ Star the repository on GitHub.

🔗 Share it with developers building AI agents.

💬 Join the discussion in our Telegram channel.

Built for AI agents. Powered by smart contracts. Protected by Zeus. ⚡
