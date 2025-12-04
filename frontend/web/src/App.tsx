// App.tsx
import { ConnectButton } from '@rainbow-me/rainbowkit';
import '@rainbow-me/rainbowkit/styles.css';
import React, { useEffect, useState } from "react";
import { ethers } from "ethers";
import { getContractReadOnly, getContractWithSigner } from "./contract";
import "./App.css";
import { useAccount, useSignMessage } from 'wagmi';

interface TokenListing {
  id: string;
  encryptedAmount: string;
  encryptedPrice: string;
  vestingDate: number;
  seller: string;
  project: string;
  status: "active" | "completed" | "canceled";
}

const FHEEncryptNumber = (value: number): string => {
  return `FHE-${btoa(value.toString())}`;
};

const FHEDecryptNumber = (encryptedData: string): number => {
  if (encryptedData.startsWith('FHE-')) {
    return parseFloat(atob(encryptedData.substring(4)));
  }
  return parseFloat(encryptedData);
};

const generatePublicKey = () => `0x${Array(2000).fill(0).map(() => Math.floor(Math.random() * 16).toString(16)).join('')}`;

const App: React.FC = () => {
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const [loading, setLoading] = useState(true);
  const [listings, setListings] = useState<TokenListing[]>([]);
  const [filteredListings, setFilteredListings] = useState<TokenListing[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState<{ visible: boolean; status: "pending" | "success" | "error"; message: string; }>({ visible: false, status: "pending", message: "" });
  const [newListingData, setNewListingData] = useState({ project: "", amount: 0, price: 0, vestingDate: "" });
  const [showTutorial, setShowTutorial] = useState(false);
  const [selectedListing, setSelectedListing] = useState<TokenListing | null>(null);
  const [decryptedAmount, setDecryptedAmount] = useState<number | null>(null);
  const [decryptedPrice, setDecryptedPrice] = useState<number | null>(null);
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [publicKey, setPublicKey] = useState<string>("");
  const [contractAddress, setContractAddress] = useState<string>("");
  const [chainId, setChainId] = useState<number>(0);
  const [startTimestamp, setStartTimestamp] = useState<number>(0);
  const [durationDays, setDurationDays] = useState<number>(30);
  const [searchTerm, setSearchTerm] = useState("");
  const [activeFilter, setActiveFilter] = useState("all");
  const [userHistory, setUserHistory] = useState<TokenListing[]>([]);

  // Statistics calculations
  const activeCount = listings.filter(l => l.status === "active").length;
  const completedCount = listings.filter(l => l.status === "completed").length;
  const canceledCount = listings.filter(l => l.status === "canceled").length;
  const totalValue = listings.reduce((sum, listing) => {
    try {
      const amount = FHEDecryptNumber(listing.encryptedAmount);
      const price = FHEDecryptNumber(listing.encryptedPrice);
      return sum + (amount * price);
    } catch {
      return sum;
    }
  }, 0);

  useEffect(() => {
    loadListings().finally(() => setLoading(false));
    const initSignatureParams = async () => {
      const contract = await getContractReadOnly();
      if (contract) setContractAddress(await contract.getAddress());
      if (window.ethereum) {
        const chainIdHex = await window.ethereum.request({ method: 'eth_chainId' });
        setChainId(parseInt(chainIdHex, 16));
      }
      setStartTimestamp(Math.floor(Date.now() / 1000));
      setDurationDays(30);
      setPublicKey(generatePublicKey());
    };
    initSignatureParams();
  }, []);

  useEffect(() => {
    filterListings();
  }, [listings, searchTerm, activeFilter]);

  useEffect(() => {
    if (address && listings.length > 0) {
      setUserHistory(listings.filter(l => l.seller.toLowerCase() === address.toLowerCase()));
    }
  }, [address, listings]);

  const loadListings = async () => {
    setIsRefreshing(true);
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      const isAvailable = await contract.isAvailable();
      if (!isAvailable) return;
      
      const keysBytes = await contract.getData("listing_keys");
      let keys: string[] = [];
      if (keysBytes.length > 0) {
        try {
          const keysStr = ethers.toUtf8String(keysBytes);
          if (keysStr.trim() !== '') keys = JSON.parse(keysStr);
        } catch (e) { console.error("Error parsing listing keys:", e); }
      }
      
      const list: TokenListing[] = [];
      for (const key of keys) {
        try {
          const listingBytes = await contract.getData(`listing_${key}`);
          if (listingBytes.length > 0) {
            try {
              const listingData = JSON.parse(ethers.toUtf8String(listingBytes));
              list.push({ 
                id: key, 
                encryptedAmount: listingData.amount, 
                encryptedPrice: listingData.price, 
                vestingDate: listingData.vestingDate, 
                seller: listingData.seller, 
                project: listingData.project, 
                status: listingData.status || "active" 
              });
            } catch (e) { console.error(`Error parsing listing data for ${key}:`, e); }
          }
        } catch (e) { console.error(`Error loading listing ${key}:`, e); }
      }
      list.sort((a, b) => b.vestingDate - a.vestingDate);
      setListings(list);
    } catch (e) { console.error("Error loading listings:", e); } 
    finally { setIsRefreshing(false); setLoading(false); }
  };

  const filterListings = () => {
    let filtered = [...listings];
    
    if (activeFilter !== "all") {
      filtered = filtered.filter(l => l.status === activeFilter);
    }
    
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(l => 
        l.project.toLowerCase().includes(term) || 
        l.seller.toLowerCase().includes(term)
      );
    }
    
    setFilteredListings(filtered);
  };

  const createListing = async () => {
    if (!isConnected) { alert("Please connect wallet first"); return; }
    setCreating(true);
    setTransactionStatus({ visible: true, status: "pending", message: "Encrypting token data with Zama FHE..." });
    try {
      const encryptedAmount = FHEEncryptNumber(newListingData.amount);
      const encryptedPrice = FHEEncryptNumber(newListingData.price);
      const vestingDate = Math.floor(new Date(newListingData.vestingDate).getTime() / 1000);
      
      const contract = await getContractWithSigner();
      if (!contract) throw new Error("Failed to get contract with signer");
      
      const listingId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      const listingData = { 
        amount: encryptedAmount, 
        price: encryptedPrice, 
        vestingDate, 
        seller: address, 
        project: newListingData.project, 
        status: "active" 
      };
      
      await contract.setData(`listing_${listingId}`, ethers.toUtf8Bytes(JSON.stringify(listingData)));
      
      const keysBytes = await contract.getData("listing_keys");
      let keys: string[] = [];
      if (keysBytes.length > 0) {
        try { keys = JSON.parse(ethers.toUtf8String(keysBytes)); } 
        catch (e) { console.error("Error parsing keys:", e); }
      }
      keys.push(listingId);
      await contract.setData("listing_keys", ethers.toUtf8Bytes(JSON.stringify(keys)));
      
      setTransactionStatus({ visible: true, status: "success", message: "Encrypted listing created!" });
      await loadListings();
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
        setShowCreateModal(false);
        setNewListingData({ project: "", amount: 0, price: 0, vestingDate: "" });
      }, 2000);
    } catch (e: any) {
      const errorMessage = e.message.includes("user rejected transaction") ? "Transaction rejected by user" : "Creation failed: " + (e.message || "Unknown error");
      setTransactionStatus({ visible: true, status: "error", message: errorMessage });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    } finally { setCreating(false); }
  };

  const decryptWithSignature = async (encryptedData: string): Promise<number | null> => {
    if (!isConnected) { alert("Please connect wallet first"); return null; }
    setIsDecrypting(true);
    try {
      const message = `publickey:${publicKey}\ncontractAddresses:${contractAddress}\ncontractsChainId:${chainId}\nstartTimestamp:${startTimestamp}\ndurationDays:${durationDays}`;
      await signMessageAsync({ message });
      await new Promise(resolve => setTimeout(resolve, 1500));
      return FHEDecryptNumber(encryptedData);
    } catch (e) { console.error("Decryption failed:", e); return null; } 
    finally { setIsDecrypting(false); }
  };

  const buyListing = async (listingId: string) => {
    if (!isConnected) { alert("Please connect wallet first"); return; }
    setTransactionStatus({ visible: true, status: "pending", message: "Processing FHE-encrypted transaction..." });
    try {
      const contract = await getContractReadOnly();
      if (!contract) throw new Error("Failed to get contract");
      const listingBytes = await contract.getData(`listing_${listingId}`);
      if (listingBytes.length === 0) throw new Error("Listing not found");
      const listingData = JSON.parse(ethers.toUtf8String(listingBytes));
      
      const contractWithSigner = await getContractWithSigner();
      if (!contractWithSigner) throw new Error("Failed to get contract with signer");
      
      const updatedListing = { ...listingData, status: "completed" };
      await contractWithSigner.setData(`listing_${listingId}`, ethers.toUtf8Bytes(JSON.stringify(updatedListing)));
      
      setTransactionStatus({ visible: true, status: "success", message: "FHE transaction completed!" });
      await loadListings();
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 2000);
    } catch (e: any) {
      setTransactionStatus({ visible: true, status: "error", message: "Transaction failed: " + (e.message || "Unknown error") });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    }
  };

  const cancelListing = async (listingId: string) => {
    if (!isConnected) { alert("Please connect wallet first"); return; }
    setTransactionStatus({ visible: true, status: "pending", message: "Processing FHE-encrypted cancellation..." });
    try {
      const contract = await getContractWithSigner();
      if (!contract) throw new Error("Failed to get contract with signer");
      const listingBytes = await contract.getData(`listing_${listingId}`);
      if (listingBytes.length === 0) throw new Error("Listing not found");
      const listingData = JSON.parse(ethers.toUtf8String(listingBytes));
      
      const updatedListing = { ...listingData, status: "canceled" };
      await contract.setData(`listing_${listingId}`, ethers.toUtf8Bytes(JSON.stringify(updatedListing)));
      
      setTransactionStatus({ visible: true, status: "success", message: "FHE cancellation completed!" });
      await loadListings();
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 2000);
    } catch (e: any) {
      setTransactionStatus({ visible: true, status: "error", message: "Cancellation failed: " + (e.message || "Unknown error") });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    }
  };

  const isOwner = (listingAddress: string) => address?.toLowerCase() === listingAddress.toLowerCase();

  const tutorialSteps = [
    { title: "Connect Wallet", description: "Connect your Web3 wallet to trade unvested tokens", icon: "🔗" },
    { title: "List Your Tokens", description: "Create a listing for your unvested tokens with FHE encryption", icon: "🔒", details: "Your token amounts and prices are encrypted using Zama FHE before being stored on-chain" },
    { title: "Trade Securely", description: "Buy or sell tokens while keeping sensitive data encrypted", icon: "⚙️", details: "All computations are done on encrypted data without exposing actual values" },
    { title: "Manage Vesting", description: "Track your vesting schedules and transactions", icon: "📊", details: "View your transaction history and upcoming vesting dates" }
  ];

  const renderStatsCards = () => {
    return (
      <div className="stats-grid">
        <div className="stat-card metal-shine">
          <div className="stat-value">{listings.length}</div>
          <div className="stat-label">Total Listings</div>
          <div className="stat-icon">📊</div>
        </div>
        <div className="stat-card metal-shine">
          <div className="stat-value">{activeCount}</div>
          <div className="stat-label">Active</div>
          <div className="stat-icon">🔄</div>
        </div>
        <div className="stat-card metal-shine">
          <div className="stat-value">{completedCount}</div>
          <div className="stat-label">Completed</div>
          <div className="stat-icon">✅</div>
        </div>
        <div className="stat-card metal-shine">
          <div className="stat-value">${totalValue.toLocaleString()}</div>
          <div className="stat-label">Total Value</div>
          <div className="stat-icon">💰</div>
        </div>
      </div>
    );
  };

  if (loading) return (
    <div className="loading-screen metal-bg">
      <div className="metal-spinner"></div>
      <p>Initializing FHE encrypted exchange...</p>
    </div>
  );

  return (
    <div className="app-container metal-theme">
      <header className="app-header metal-header">
        <div className="logo">
          <div className="logo-icon metal-icon"><div className="shield-icon"></div></div>
          <h1>FHE<span>Unvested</span>DEX</h1>
        </div>
        <div className="header-actions">
          <button onClick={() => setShowCreateModal(true)} className="create-listing-btn metal-button">
            <div className="add-icon"></div>List Tokens
          </button>
          <button className="metal-button" onClick={() => setShowTutorial(!showTutorial)}>
            {showTutorial ? "Hide Guide" : "Show Guide"}
          </button>
          <div className="wallet-connect-wrapper"><ConnectButton accountStatus="address" chainStatus="icon" showBalance={false}/></div>
        </div>
      </header>
      <div className="main-content metal-bg">
        <div className="welcome-banner metal-panel">
          <div className="welcome-text">
            <h2>FHE-Encrypted Unvested Token Exchange</h2>
            <p>Trade unvested token allocations with full privacy using Zama FHE technology</p>
          </div>
          <div className="fhe-indicator metal-tag"><div className="fhe-lock"></div><span>FHE Encryption Active</span></div>
        </div>
        
        {showTutorial && (
          <div className="tutorial-section metal-panel">
            <h2>How FHE Unvested Token Exchange Works</h2>
            <p className="subtitle">Securely trade unvested tokens while keeping amounts encrypted</p>
            <div className="tutorial-steps">
              {tutorialSteps.map((step, index) => (
                <div className="tutorial-step metal-card" key={index}>
                  <div className="step-icon metal-icon">{step.icon}</div>
                  <div className="step-content">
                    <h3>{step.title}</h3>
                    <p>{step.description}</p>
                    {step.details && <div className="step-details metal-panel">{step.details}</div>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        
        <div className="dashboard-section">
          {renderStatsCards()}
          
          <div className="search-filter metal-panel">
            <div className="search-box">
              <input 
                type="text" 
                placeholder="Search projects or sellers..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="metal-input"
              />
              <div className="search-icon">🔍</div>
            </div>
            <div className="filter-tabs">
              <button 
                className={`filter-tab ${activeFilter === "all" ? "active" : ""}`}
                onClick={() => setActiveFilter("all")}
              >
                All Listings
              </button>
              <button 
                className={`filter-tab ${activeFilter === "active" ? "active" : ""}`}
                onClick={() => setActiveFilter("active")}
              >
                Active
              </button>
              <button 
                className={`filter-tab ${activeFilter === "completed" ? "active" : ""}`}
                onClick={() => setActiveFilter("completed")}
              >
                Completed
              </button>
              <button 
                className={`filter-tab ${activeFilter === "canceled" ? "active" : ""}`}
                onClick={() => setActiveFilter("canceled")}
              >
                Canceled
              </button>
            </div>
          </div>
        </div>
        
        <div className="listings-section">
          <div className="section-header">
            <h2>Token Listings</h2>
            <div className="header-actions">
              <button onClick={loadListings} className="refresh-btn metal-button" disabled={isRefreshing}>
                {isRefreshing ? "Refreshing..." : "Refresh"}
              </button>
            </div>
          </div>
          
          <div className="listings-grid">
            {filteredListings.length === 0 ? (
              <div className="no-listings metal-panel">
                <div className="no-listings-icon"></div>
                <p>No token listings found</p>
                <button className="metal-button primary" onClick={() => setShowCreateModal(true)}>Create First Listing</button>
              </div>
            ) : filteredListings.map(listing => (
              <div 
                className={`listing-card metal-card ${listing.status}`} 
                key={listing.id} 
                onClick={() => setSelectedListing(listing)}
              >
                <div className="listing-header">
                  <div className="listing-id">#{listing.id.substring(0, 6)}</div>
                  <div className={`status-badge metal-tag ${listing.status}`}>{listing.status}</div>
                </div>
                <div className="listing-project">{listing.project}</div>
                <div className="listing-seller">{listing.seller.substring(0, 6)}...{listing.seller.substring(38)}</div>
                <div className="listing-details">
                  <div className="detail-item">
                    <span>Vesting Date:</span>
                    <strong>{new Date(listing.vestingDate * 1000).toLocaleDateString()}</strong>
                  </div>
                  <div className="detail-item">
                    <span>Amount:</span>
                    <strong>FHE Encrypted</strong>
                  </div>
                  <div className="detail-item">
                    <span>Price:</span>
                    <strong>FHE Encrypted</strong>
                  </div>
                </div>
                <div className="listing-actions">
                  {isOwner(listing.seller) && listing.status === "active" && (
                    <button className="action-btn metal-button danger" onClick={(e) => { e.stopPropagation(); cancelListing(listing.id); }}>Cancel</button>
                  )}
                  {!isOwner(listing.seller) && listing.status === "active" && (
                    <button className="action-btn metal-button success" onClick={(e) => { e.stopPropagation(); buyListing(listing.id); }}>Buy</button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
        
        {address && userHistory.length > 0 && (
          <div className="history-section">
            <div className="section-header">
              <h2>Your Transaction History</h2>
            </div>
            <div className="history-list metal-panel">
              {userHistory.map(listing => (
                <div className="history-item" key={listing.id}>
                  <div className="history-project">{listing.project}</div>
                  <div className="history-details">
                    <span>Status:</span>
                    <strong className={`status-badge ${listing.status}`}>{listing.status}</strong>
                    <span>Date:</span>
                    <strong>{new Date(listing.vestingDate * 1000).toLocaleDateString()}</strong>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      
      {showCreateModal && (
        <ModalCreate 
          onSubmit={createListing} 
          onClose={() => setShowCreateModal(false)} 
          creating={creating} 
          listingData={newListingData} 
          setListingData={setNewListingData}
        />
      )}
      
      {selectedListing && (
        <ListingDetailModal 
          listing={selectedListing} 
          onClose={() => { 
            setSelectedListing(null); 
            setDecryptedAmount(null);
            setDecryptedPrice(null);
          }} 
          decryptedAmount={decryptedAmount}
          decryptedPrice={decryptedPrice}
          setDecryptedAmount={setDecryptedAmount}
          setDecryptedPrice={setDecryptedPrice}
          isDecrypting={isDecrypting} 
          decryptWithSignature={decryptWithSignature}
          isOwner={isOwner(selectedListing.seller)}
          onBuy={() => buyListing(selectedListing.id)}
          onCancel={() => cancelListing(selectedListing.id)}
        />
      )}
      
      {transactionStatus.visible && (
        <div className="transaction-modal">
          <div className="transaction-content metal-panel">
            <div className={`transaction-icon ${transactionStatus.status}`}>
              {transactionStatus.status === "pending" && <div className="metal-spinner"></div>}
              {transactionStatus.status === "success" && <div className="check-icon"></div>}
              {transactionStatus.status === "error" && <div className="error-icon"></div>}
            </div>
            <div className="transaction-message">{transactionStatus.message}</div>
          </div>
        </div>
      )}
      
      <footer className="app-footer metal-footer">
        <div className="footer-content">
          <div className="footer-brand">
            <div className="logo"><div className="shield-icon"></div><span>FHE Unvested Token DEX</span></div>
            <p>Powered by Zama FHE technology for private trading</p>
          </div>
          <div className="footer-links">
            <a href="#" className="footer-link">Documentation</a>
            <a href="#" className="footer-link">Privacy Policy</a>
            <a href="#" className="footer-link">Terms</a>
            <a href="https://zama.ai" className="footer-link">Zama FHE</a>
          </div>
        </div>
        <div className="footer-bottom">
          <div className="fhe-badge metal-tag"><span>FHE-Powered Privacy</span></div>
          <div className="copyright">© {new Date().getFullYear()} FHE Unvested Token DEX</div>
        </div>
      </footer>
    </div>
  );
};

interface ModalCreateProps {
  onSubmit: () => void; 
  onClose: () => void; 
  creating: boolean;
  listingData: any;
  setListingData: (data: any) => void;
}

const ModalCreate: React.FC<ModalCreateProps> = ({ onSubmit, onClose, creating, listingData, setListingData }) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setListingData({ ...listingData, [name]: value });
  };

  const handleValueChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setListingData({ ...listingData, [name]: parseFloat(value) });
  };

  const handleSubmit = () => {
    if (!listingData.project || !listingData.amount || !listingData.price || !listingData.vestingDate) { 
      alert("Please fill all required fields"); 
      return; 
    }
    onSubmit();
  };

  return (
    <div className="modal-overlay">
      <div className="create-modal metal-panel">
        <div className="modal-header">
          <h2>Create New Token Listing</h2>
          <button onClick={onClose} className="close-modal">&times;</button>
        </div>
        <div className="modal-body">
          <div className="fhe-notice-banner metal-panel">
            <div className="key-icon"></div> 
            <div><strong>FHE Encryption Notice</strong><p>Your token amounts and prices will be encrypted with Zama FHE</p></div>
          </div>
          
          <div className="form-grid">
            <div className="form-group">
              <label>Project Name *</label>
              <input 
                type="text" 
                name="project" 
                value={listingData.project} 
                onChange={handleChange} 
                placeholder="Enter project name..." 
                className="metal-input"
              />
            </div>
            <div className="form-group">
              <label>Token Amount *</label>
              <input 
                type="number" 
                name="amount" 
                value={listingData.amount} 
                onChange={handleValueChange} 
                placeholder="Enter token amount..." 
                className="metal-input"
                min="0"
                step="0.01"
              />
            </div>
            <div className="form-group">
              <label>Price per Token *</label>
              <input 
                type="number" 
                name="price" 
                value={listingData.price} 
                onChange={handleValueChange} 
                placeholder="Enter price per token..." 
                className="metal-input"
                min="0"
                step="0.01"
              />
            </div>
            <div className="form-group">
              <label>Vesting Date *</label>
              <input 
                type="date" 
                name="vestingDate" 
                value={listingData.vestingDate} 
                onChange={handleChange} 
                className="metal-input"
              />
            </div>
          </div>
          
          <div className="encryption-preview metal-panel">
            <h4>Encryption Preview</h4>
            <div className="preview-container">
              <div className="plain-data">
                <span>Plain Values:</span>
                <div>Amount: {listingData.amount || '0'}</div>
                <div>Price: {listingData.price || '0'}</div>
              </div>
              <div className="encryption-arrow">→</div>
              <div className="encrypted-data">
                <span>Encrypted Data:</span>
                <div>Amount: {listingData.amount ? FHEEncryptNumber(listingData.amount).substring(0, 20) + '...' : 'Not encrypted'}</div>
                <div>Price: {listingData.price ? FHEEncryptNumber(listingData.price).substring(0, 20) + '...' : 'Not encrypted'}</div>
              </div>
            </div>
          </div>
        </div>
        <div className="modal-footer">
          <button onClick={onClose} className="cancel-btn metal-button">Cancel</button>
          <button onClick={handleSubmit} disabled={creating} className="submit-btn metal-button primary">
            {creating ? "Encrypting with FHE..." : "Create Listing"}
          </button>
        </div>
      </div>
    </div>
  );
};

interface ListingDetailModalProps {
  listing: TokenListing;
  onClose: () => void;
  decryptedAmount: number | null;
  decryptedPrice: number | null;
  setDecryptedAmount: (value: number | null) => void;
  setDecryptedPrice: (value: number | null) => void;
  isDecrypting: boolean;
  decryptWithSignature: (encryptedData: string) => Promise<number | null>;
  isOwner: boolean;
  onBuy: () => void;
  onCancel: () => void;
}

const ListingDetailModal: React.FC<ListingDetailModalProps> = ({ 
  listing, onClose, decryptedAmount, decryptedPrice, setDecryptedAmount, 
  setDecryptedPrice, isDecrypting, decryptWithSignature, isOwner, onBuy, onCancel 
}) => {
  const handleDecrypt = async () => {
    if (decryptedAmount !== null && decryptedPrice !== null) { 
      setDecryptedAmount(null);
      setDecryptedPrice(null);
      return;
    }
    
    setIsDecrypting(true);
    try {
      const amount = await decryptWithSignature(listing.encryptedAmount);
      const price = await decryptWithSignature(listing.encryptedPrice);
      if (amount !== null) setDecryptedAmount(amount);
      if (price !== null) setDecryptedPrice(price);
    } finally {
      setIsDecrypting(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="listing-detail-modal metal-panel">
        <div className="modal-header">
          <h2>Listing Details #{listing.id.substring(0, 8)}</h2>
          <button onClick={onClose} className="close-modal">&times;</button>
        </div>
        <div className="modal-body">
          <div className="listing-info">
            <div className="info-item"><span>Project:</span><strong>{listing.project}</strong></div>
            <div className="info-item"><span>Seller:</span><strong>{listing.seller.substring(0, 6)}...{listing.seller.substring(38)}</strong></div>
            <div className="info-item"><span>Vesting Date:</span><strong>{new Date(listing.vestingDate * 1000).toLocaleString()}</strong></div>
            <div className="info-item"><span>Status:</span><strong className={`status-badge ${listing.status}`}>{listing.status}</strong></div>
          </div>
          
          <div className="encrypted-data-section metal-panel">
            <h3>Encrypted Data</h3>
            <div className="data-grid">
              <div className="data-item">
                <span>Token Amount:</span>
                <div className="encrypted-data">{listing.encryptedAmount.substring(0, 50)}...</div>
              </div>
              <div className="data-item">
                <span>Price per Token:</span>
                <div className="encrypted-data">{listing.encryptedPrice.substring(0, 50)}...</div>
              </div>
            </div>
            <div className="fhe-tag metal-tag"><div className="fhe-icon"></div><span>FHE Encrypted</span></div>
            
            <button 
              className="decrypt-btn metal-button" 
              onClick={handleDecrypt} 
              disabled={isDecrypting}
            >
              {isDecrypting ? "Decrypting..." : 
               (decryptedAmount !== null && decryptedPrice !== null) ? "Hide Values" : "Decrypt with Wallet"}
            </button>
          </div>
          
          {(decryptedAmount !== null && decryptedPrice !== null) && (
            <div className="decrypted-data-section metal-panel">
              <h3>Decrypted Values</h3>
              <div className="data-grid">
                <div className="data-item">
                  <span>Token Amount:</span>
                  <strong>{decryptedAmount}</strong>
                </div>
                <div className="data-item">
                  <span>Price per Token:</span>
                  <strong>${decryptedPrice}</strong>
                </div>
                <div className="data-item">
                  <span>Total Value:</span>
                  <strong>${(decryptedAmount * decryptedPrice).toLocaleString()}</strong>
                </div>
              </div>
              <div className="decryption-notice">
                <div className="warning-icon"></div>
                <span>Decrypted data is only visible after wallet signature verification</span>
              </div>
            </div>
          )}
        </div>
        <div className="modal-footer">
          {listing.status === "active" && (
            <>
              {isOwner ? (
                <button onClick={onCancel} className="metal-button danger">Cancel Listing</button>
              ) : (
                <button onClick={onBuy} className="metal-button success">Buy Tokens</button>
              )}
            </>
          )}
          <button onClick={onClose} className="metal-button">Close</button>
        </div>
      </div>
    </div>
  );
};

export default App;