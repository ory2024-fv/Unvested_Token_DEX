# Unvested Token DEX: A Visionary Marketplace for Confidential Trading

Unvested Token DEX is a groundbreaking decentralized exchange (DEX) designed for trading FHE-encrypted "unvested" tokens. Leveraging **Zama's Fully Homomorphic Encryption (FHE) technology**, this platform grants early employees and investors the ability to trade their unvested shares securely while maintaining their privacy. The implementation ensures that sensitive information remains confidential, opening up new avenues in the decentralized finance ecosystem.

## Addressing Long-Standing Issues in Token Trading

The traditional token trading market presents significant challenges for early contributors and investors. Often, unvested tokens are locked and inaccessible, leading to frustration and limited liquidity. Furthermore, the lack of privacy in regular trading transactions exposes sensitive information, putting participants at risk. Unvested Token DEX aims to eliminate these pain points by providing a secure platform for trading unvested tokens without compromising confidentiality.

## Empowering Through FHE: A Secure Solution

Zama's Fully Homomorphic Encryption technology is at the heart of our solution. By utilizing Zama's open-source libraries, such as **Concrete** and the **zama-fhe SDK**, we are able to facilitate secure transactions while keeping all trading data encrypted and private. This means that trades can be executed without revealing sensitive token information, ensuring user privacy throughout the process.

## Core Functionalities of Unvested Token DEX

- **FHE-Encryped Trading:** Trade unvested token shares in a privacy-enhanced environment with full confidentiality.
- **Liquidity for Early Contributors:** Provide a marketplace that allows early investors to gain liquidity without impacting the public market.
- **Addressing Web3 Challenges:** Solve long-term pain points faced by participants in the Web3 space regarding unvested token access and trading.
- **Innovative Financial Derivatives:** Create unique financial products that leverage unvested token shares, enhancing the trading experience.

## Technology Stack

The Unvested Token DEX is built upon a modern tech stack aimed at secure and efficient operations:

- **Zama FHE SDK** (Concrete, TFHE-rs) - For secure computation and encryption.
- **Solidity** - Smart contract programming language.
- **Node.js** & **Hardhat** - For development and testing environments.
- **Web3.js** - For interacting with the Ethereum blockchain.

## Directory Structure

Here’s how the project structure looks:

```
Unvested_Token_DEX/
├── contracts/
│   ├── Unvested_Token_DEX.sol
├── scripts/
│   ├── deploy.js
│   ├── interact.js
├── test/
│   ├── Unvested_Token_DEX.test.js
├── package.json
├── hardhat.config.js
```

## Getting Started: Installation Guide

To set up the Unvested Token DEX locally, follow these instructions after downloading the project.

1. Ensure you have **Node.js** installed. You can download it from the official Node.js website.
2. Install **Hardhat** globally:
   ```bash
   npm install --global hardhat
   ```
3. Navigate to your project directory.
4. Run the following command to install required dependencies, including the Zama FHE libraries:
   ```bash
   npm install
   ```
   Note: Do not use `git clone` or any URLs.

## Compiling and Running the Project

After successfully installing the dependencies, you can compile, test, and run your project using the following commands:

1. **Compile the Smart Contracts:**
   ```bash
   npx hardhat compile
   ```
2. **Run Tests:**
   ```bash
   npx hardhat test
   ```
3. **Deploy to Local Network:**
   ```bash
   npx hardhat run scripts/deploy.js
   ```

### Sample Code: Trading Functionality

Here’s a brief example code snippet that showcases how to initiate a trade on the DEX:

```solidity
// Unvested_Token_DEX.sol
pragma solidity ^0.8.0;

contract Unvested_Token_DEX {
    function tradeTokens(address seller, uint256 tokenAmount) public {
        require(seller != address(0), "Invalid seller address");
        // Further implementation including FHE encrypted operations
    }
}
```

This function allows users to initiate a trade while ensuring that the underlying data remains encrypted, thus maintaining privacy through the integration of Zama's FHE technology.

## Powered by Zama

The development of Unvested Token DEX would not have been possible without the pioneering work of the Zama team. Their open-source libraries and advancements in Fully Homomorphic Encryption are fundamental to creating secure and confidential blockchain applications. Our gratitude goes out to them for empowering developers with the tools needed to innovate in the Web3 space.

---

With Unvested Token DEX, we are setting a new standard for confidential trading in the decentralized finance landscape. Join us in revolutionizing the way unvested tokens are traded, ensuring privacy, security, and liquidity for all participants.
