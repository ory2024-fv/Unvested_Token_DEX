pragma solidity ^0.8.24;

import { FHE, euint32, ebool } from "@fhevm/solidity/lib/FHE.sol";
import { SepoliaConfig } from "@fhevm/solidity/config/ZamaConfig.sol";


contract UnvestedTokenDEXFHE is SepoliaConfig {
    using FHE for euint32;
    using FHE for ebool;

    address public owner;
    mapping(address => bool) public isProvider;
    mapping(address => uint256) public lastSubmissionTime;
    mapping(address => uint256) public lastDecryptionRequestTime;
    uint256 public cooldownSeconds = 60; // Default cooldown: 60 seconds

    bool public paused;

    struct Batch {
        uint256 id;
        bool isOpen;
        uint256 createdAt;
        uint256 closedAt;
    }
    uint256 public currentBatchId = 1;
    mapping(uint256 => Batch) public batches;

    struct DecryptionContext {
        uint256 batchId;
        bytes32 stateHash;
        bool processed;
    }
    mapping(uint256 => DecryptionContext) public decryptionContexts;

    // Encrypted data storage
    mapping(uint256 => mapping(address => euint32)) public encryptedUnvestedAmounts;
    mapping(uint256 => mapping(address => euint32)) public encryptedPrices;
    mapping(uint256 => mapping(address => ebool)) public encryptedIsSelling;

    // Custom Errors
    error NotOwner();
    error NotProvider();
    error Paused();
    error CooldownActive();
    error InvalidBatch();
    error BatchClosed();
    error ReplayAttempt();
    error StateMismatch();
    error InvalidProof();
    error NotInitialized();

    // Events
    event OwnershipTransferred(address indexed oldOwner, address indexed newOwner);
    event ProviderAdded(address indexed provider);
    event ProviderRemoved(address indexed provider);
    event Paused(address indexed account);
    event Unpaused(address indexed account);
    event CooldownSecondsChanged(uint256 oldCooldown, uint256 newCooldown);
    event BatchOpened(uint256 indexed batchId, uint256 timestamp);
    event BatchClosed(uint256 indexed batchId, uint256 timestamp);
    event OrderSubmitted(
        uint256 indexed batchId,
        address indexed provider,
        bytes32 encryptedUnvestedAmount,
        bytes32 encryptedPrice,
        bytes32 encryptedIsSelling
    );
    event DecryptionRequested(uint256 indexed requestId, uint256 indexed batchId, bytes32 stateHash);
    event DecryptionCompleted(uint256 indexed requestId, uint256 indexed batchId, uint256[] cleartexts);

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyProvider() {
        if (!isProvider[msg.sender]) revert NotProvider();
        _;
    }

    modifier whenNotPaused() {
        if (paused) revert Paused();
        _;
    }

    constructor() {
        owner = msg.sender;
        isProvider[owner] = true;
        _openBatch(currentBatchId); // Open initial batch
    }

    function transferOwnership(address newOwner) external onlyOwner {
        address oldOwner = owner;
        owner = newOwner;
        emit OwnershipTransferred(oldOwner, newOwner);
    }

    function addProvider(address provider) external onlyOwner {
        isProvider[provider] = true;
        emit ProviderAdded(provider);
    }

    function removeProvider(address provider) external onlyOwner {
        delete isProvider[provider];
        emit ProviderRemoved(provider);
    }

    function pause() external onlyOwner whenNotPaused {
        paused = true;
        emit Paused(msg.sender);
    }

    function unpause() external onlyOwner {
        require(paused, "Contract not paused");
        paused = false;
        emit Unpaused(msg.sender);
    }

    function setCooldownSeconds(uint256 newCooldownSeconds) external onlyOwner {
        require(newCooldownSeconds > 0, "Cooldown must be positive");
        uint256 oldCooldown = cooldownSeconds;
        cooldownSeconds = newCooldownSeconds;
        emit CooldownSecondsChanged(oldCooldown, newCooldownSeconds);
    }

    function _openBatch(uint256 batchId) private {
        batches[batchId] = Batch({id: batchId, isOpen: true, createdAt: block.timestamp, closedAt: 0});
        emit BatchOpened(batchId, block.timestamp);
    }

    function closeCurrentBatch() external onlyOwner {
        _closeBatch(currentBatchId);
        currentBatchId++;
        _openBatch(currentBatchId);
    }

    function _closeBatch(uint256 batchId) private {
        if (!batches[batchId].isOpen) revert InvalidBatch();
        batches[batchId].isOpen = false;
        batches[batchId].closedAt = block.timestamp;
        emit BatchClosed(batchId, block.timestamp);
    }

    function submitEncryptedOrder(
        euint32 encryptedUnvestedAmount,
        euint32 encryptedPrice,
        ebool encryptedIsSelling
    ) external onlyProvider whenNotPaused {
        if (block.timestamp < lastSubmissionTime[msg.sender] + cooldownSeconds) {
            revert CooldownActive();
        }
        if (!batches[currentBatchId].isOpen) revert BatchClosed();

        _initIfNeeded(encryptedUnvestedAmount);
        _initIfNeeded(encryptedPrice);
        _initIfNeeded(encryptedIsSelling);

        encryptedUnvestedAmounts[currentBatchId][msg.sender] = encryptedUnvestedAmount;
        encryptedPrices[currentBatchId][msg.sender] = encryptedPrice;
        encryptedIsSelling[currentBatchId][msg.sender] = encryptedIsSelling;

        lastSubmissionTime[msg.sender] = block.timestamp;
        emit OrderSubmitted(
            currentBatchId,
            msg.sender,
            encryptedUnvestedAmount.toBytes32(),
            encryptedPrice.toBytes32(),
            encryptedIsSelling.toBytes32()
        );
    }

    function requestBatchDecryption(uint256 batchId) external onlyOwner whenNotPaused {
        if (block.timestamp < lastDecryptionRequestTime[msg.sender] + cooldownSeconds) {
            revert CooldownActive();
        }
        if (batches[batchId].isOpen) revert BatchNotClosed(); // Custom error not defined, assuming BatchNotClosed or similar
        if (!batches[batchId].isOpen && batches[batchId].closedAt == 0) revert InvalidBatch();

        // 1. Prepare Ciphertexts
        // Example: Aggregate total unvested amount and total price for the batch
        // This is a simplified aggregation. Real DEX logic would be more complex.
        euint32 memory totalUnvestedAmount = FHE.asEuint32(0);
        euint32 memory totalPrice = FHE.asEuint32(0);
        euint32 memory count = FHE.asEuint32(0);

        address[] memory providers = new address[](1); // Simplified: would need to track providers
        providers[0] = owner; // Example provider

        for (uint256 i = 0; i < providers.length; i++) {
            address provider = providers[i];
            if (encryptedUnvestedAmounts[batchId][provider].isInitialized()) {
                 totalUnvestedAmount = totalUnvestedAmount.add(encryptedUnvestedAmounts[batchId][provider]);
                 totalPrice = totalPrice.add(encryptedPrices[batchId][provider]);
                 count = count.add(FHE.asEuint32(1));
            }
        }
        
        // For this example, let's say we want to decrypt totalUnvestedAmount and totalPrice
        bytes32[] memory cts = new bytes32[](2);
        cts[0] = totalUnvestedAmount.toBytes32();
        cts[1] = totalPrice.toBytes32();

        // 2. Compute State Hash
        bytes32 stateHash = _hashCiphertexts(cts);

        // 3. Request Decryption
        uint256 requestId = FHE.requestDecryption(cts, this.myCallback.selector);

        // 4. Store Context
        decryptionContexts[requestId] = DecryptionContext({ batchId: batchId, stateHash: stateHash, processed: false });
        lastDecryptionRequestTime[msg.sender] = block.timestamp;
        emit DecryptionRequested(requestId, batchId, stateHash);
    }

    function myCallback(uint256 requestId, bytes memory cleartexts, bytes memory proof) public {
        // 5a. Replay Guard
        if (decryptionContexts[requestId].processed) revert ReplayAttempt();

        // 5b. State Verification
        // Rebuild cts array in the exact same order as in requestBatchDecryption
        // This simplified example assumes we know the batchId from the context
        uint256 batchId = decryptionContexts[requestId].batchId;
        euint32 memory totalUnvestedAmount = FHE.asEuint32(0);
        euint32 memory totalPrice = FHE.asEuint32(0);
        euint32 memory count = FHE.asEuint32(0);
        address[] memory providers = new address[](1); // Simplified
        providers[0] = owner;

        for (uint256 i = 0; i < providers.length; i++) {
            address provider = providers[i];
            if (encryptedUnvestedAmounts[batchId][provider].isInitialized()) {
                 totalUnvestedAmount = totalUnvestedAmount.add(encryptedUnvestedAmounts[batchId][provider]);
                 totalPrice = totalPrice.add(encryptedPrices[batchId][provider]);
                 count = count.add(FHE.asEuint32(1));
            }
        }
        bytes32[] memory currentCts = new bytes32[](2);
        currentCts[0] = totalUnvestedAmount.toBytes32();
        currentCts[1] = totalPrice.toBytes32();

        bytes32 currentHash = _hashCiphertexts(currentCts);
        if (currentHash != decryptionContexts[requestId].stateHash) revert StateMismatch();

        // 5c. Proof Verification
        if (!FHE.checkSignatures(requestId, cleartexts, proof)) revert InvalidProof();

        // 5d. Decode & Finalize
        // Assuming cleartexts is abi.encodePacked(uint32, uint32) for totalUnvestedAmount and totalPrice
        require(cleartexts.length == 8, "Invalid cleartexts length"); // 2 * 4 bytes
        uint32 decryptedTotalUnvestedAmount = uint32(uint256(bytes32(cleartexts[0:4])));
        uint32 decryptedTotalPrice = uint32(uint256(bytes32(cleartexts[4:8])));

        decryptionContexts[requestId].processed = true;
        emit DecryptionCompleted(requestId, batchId, [decryptedTotalUnvestedAmount, decryptedTotalPrice]);
        // Further logic to use decrypted values would go here
    }

    function _hashCiphertexts(bytes32[] memory cts) internal pure returns (bytes32) {
        return keccak256(abi.encode(cts, address(this)));
    }

    function _initIfNeeded(euint32 v) internal pure {
        if (!v.isInitialized()) revert NotInitialized();
    }

    function _initIfNeeded(ebool b) internal pure {
        if (!b.isInitialized()) revert NotInitialized();
    }
}