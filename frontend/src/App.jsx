import { useState, useEffect } from 'react';
import axios from 'axios';

const BACKEND_URL = 'https://autofor-xg0p.onrender.com';

const App = () => {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [telegramUser, setTelegramUser] = useState(null);
  const [account, setAccount] = useState(null);
  const [country, setCountry] = useState('');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [password, setPassword] = useState('');
  const [showOtpInput, setShowOtpInput] = useState(false);
  const [showPasswordInput, setShowPasswordInput] = useState(false);
  const [sourceChat, setSourceChat] = useState('');
  const [targetChat, setTargetChat] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [keyword, setKeyword] = useState('');
  const [editText, setEditText] = useState('');
  const [replaceText, setReplaceText] = useState('');
  const [rules, setRules] = useState([]);
  const [isForwarding, setIsForwarding] = useState(false);
  const [message, setMessage] = useState('');

  const sendOtp = async () => {
    if (!country || !phone) {
      setMessage('Please select country and enter phone number');
      return;
    }
    try {
      const response = await axios.post(`${BACKEND_URL}/api/send-otp`, { phone, country });
      setShowOtpInput(true);
      setMessage(response.data.message);
    } catch (error) {
      console.error('Send OTP error:', error);
      setMessage(error.response?.data?.message || 'Failed to send OTP');
    }
  };

  const verifyOtp = async () => {
    if (!otp) {
      setMessage('Please enter OTP');
      return;
    }
    try {
      const response = await axios.post(`${BACKEND_URL}/api/verify-otp`, { phone, code: otp, password, country });
      setTelegramUser({
        id: response.data.telegramId,
        phone,
        firstName: 'User',
        country
      });
      setIsLoggedIn(true);
      setShowOtpInput(false);
      setShowPasswordInput(false);
      setPhone('');
      setOtp('');
      setPassword('');
      setMessage(response.data.message);
    } catch (error) {
      console.error('Verify OTP error:', error);
      if (error.response?.data?.message.includes('2FA')) {
        setShowPasswordInput(true);
        setMessage('Please enter your 2FA password');
      } else {
        setMessage(error.response?.data?.message || 'Failed to verify OTP');
      }
    }
  };

  const connectWallet = async () => {
    if (window.ethereum) {
      try {
        const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
        setAccount(accounts[0]);
        setMessage('Wallet connected successfully');
      } catch (error) {
        console.error('MetaMask connection error:', error);
        setMessage('Failed to connect wallet');
      }
    } else {
      setMessage('MetaMask not installed.');
    }
  };

  const createRule = async () => {
    if (!telegramUser) {
      setMessage('Please login first');
      return;
    }
    if (!sourceChat || !targetChat) {
      setMessage('Please enter both source and target chat IDs');
      return;
    }
    try {
      const response = await axios.post(`${BACKEND_URL}/api/rules`, {
        telegramId: telegramUser.id,
        sourceChat,
        targetChat,
        filterType,
        keyword,
        editText,
        replaceText
      });
      setRules([...rules, response.data.rule]);
      setMessage('Rule created successfully!');
      setSourceChat('');
      setTargetChat('');
      setKeyword('');
      setEditText('');
      setReplaceText('');
    } catch (error) {
      console.error('Rule creation error:', error);
      setMessage('Failed to create rule');
    }
  };

  useEffect(() => {
    const fetchRules = async () => {
      if (!telegramUser) return;
      try {
        const response = await axios.get(`${BACKEND_URL}/api/rules/${telegramUser.id}`);
        setRules(response.data);
        setIsForwarding(response.data.some(rule => rule.isForwarding));
      } catch (error) {
        console.error('Failed to fetch rules:', error);
        setMessage('Failed to fetch rules');
      }
    };
    fetchRules();
  }, [telegramUser]);

  const toggleForwarding = async () => {
    if (!telegramUser) {
      setMessage('Please login first');
      return;
    }
    try {
      const response = await axios.post(`${BACKEND_URL}/api/toggle-forwarding`, {
        telegramId: telegramUser.id,
        enable: !isForwarding
      });
      setIsForwarding(!isForwarding);
      setMessage(response.data.message);
    } catch (error) {
      console.error('Toggle forwarding error:', error);
      setMessage('Failed to toggle forwarding');
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 p-6">
      <div className="max-w-3xl mx-auto bg-white p-8 rounded-lg shadow-lg">
        <h1 className="text-3xl font-bold mb-6 text-center text-blue-600">Telegram Message Forwarder</h1>

        {!isLoggedIn ? (
          <div className="text-center">
            <p className="mb-4 text-lg">Log in with your Telegram phone number</p>
            <div className="mb-4">
              <label className="block text-sm font-medium mb-1">Select Country</label>
              <select
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                className="w-full max-w-xs border p-2 rounded mb-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select a country</option>
                <option value="US">United States (+1)</option>
                <option value="IN">India (+91)</option>
                <option value="UK">United Kingdom (+44)</option>
                <option value="CA">Canada (+1)</option>
                <option value="AU">Australia (+61)</option>
                <option value="BR">Brazil (+55)</option>
                <option value="DE">Germany (+49)</option>
                <option value="FR">France (+33)</option>
              </select>
            </div>
            <div className="mb-4">
              <label className="block text-sm font-medium mb-1">Phone Number</label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full max-w-xs border p-2 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="e.g., +919876543210"
              />
            </div>
            {!showOtpInput ? (
              <button
                onClick={sendOtp}
                className="w-full max-w-xs bg-blue-500 text-white py-2 rounded hover:bg-blue-600"
              >
                Send OTP
              </button>
            ) : (
              <>
                <div className="mb-4">
                  <label className="block text-sm font-medium mb-1">Enter OTP</label>
                  <input
                    type="text"
                    value={otp}
                    onChange={(e) => setOtp(e.target.value)}
                    className="w-full max-w-xs border p-2 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Enter OTP"
                  />
                </div>
                {showPasswordInput && (
                  <div className="mb-4">
                    <label className="block text-sm font-medium mb-1">2FA Password</label>
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full max-w-xs border p-2 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Enter 2FA password"
                    />
                  </div>
                )}
                <button
                  onClick={verifyOtp}
                  className="w-full max-w-xs bg-blue-500 text-white py-2 rounded hover:bg-blue-600"
                >
                  Verify OTP
                </button>
              </>
            )}
          </div>
        ) : (
          <>
            <div className="mb-6 p-4 bg-green-100 rounded-lg">
              <p className="text-green-700 font-medium">
                Logged in as: {telegramUser.firstName} (Phone: {telegramUser.phone}, Country: {telegramUser.country})
              </p>
            </div>

            {!account ? (
              <button
                onClick={connectWallet}
                className="w-full max-w-xs mx-auto bg-blue-500 text-white py-2 rounded hover:bg-blue-600 mb-6"
              >
                Connect MetaMask (Optional)
              </button>
            ) : (
              <p className="text-green-700 mb-6 text-center">
                Connected Wallet: {account.slice(0, 6)}...{account.slice(-4)}
              </p>
            )}

            <div className="mb-8">
              <h2 className="text-xl font-semibold mb-4 text-blue-600">Create Forwarding Rule</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Source Chat ID</label>
                  <input
                    type="text"
                    value={sourceChat}
                    onChange={(e) => setSourceChat(e.target.value)}
                    className="w-full border p-2 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="e.g., @SourceChannel or -100123456789"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Target Chat ID</label>
                  <input
                    type="text"
                    value={targetChat}
                    onChange={(e) => setTargetChat(e.target.value)}
                    className="w-full border p-2 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="e.g., @TargetChannel or -100987654321"
                  />
                </div>
              </div>
              <div className="mt-4">
                <label className="block text-sm font-medium mb-1">Filter Type</label>
                <select
                  value={filterType}
                  onChange={(e) => setFilterType(e.target.value)}
                  className="w-full max-w-xs border p-2 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="all">All Messages</option>
                  <option value="text">Text Only</option>
                  <option value="media">Media (Images/Videos)</option>
                  <option value="links">Links</option>
                </select>
              </div>
              <div className="mt-4">
                <label className="block text-sm font-medium mb-1">Keyword Filter (Optional)</label>
                <input
                  type="text"
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  className="w-full max-w-xs border p-2 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g., #important"
                />
              </div>
              <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Replace Text (Optional)</label>
                  <input
                    type="text"
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    className="w-full border p-2 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Text to replace (e.g., 'old')"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">With Text (Optional)</label>
                  <input
                    type="text"
                    value={replaceText}
                    onChange={(e) => setReplaceText(e.target.value)}
                    className="w-full border p-2 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Replacement text (e.g., 'new')"
                  />
                </div>
              </div>
              <button
                onClick={createRule}
                className="w-full max-w-xs mx-auto mt-6 bg-blue-500 text-white py-2 rounded hover:bg-blue-600"
              >
                Create Rule
              </button>
            </div>

            <div className="mb-8 text-center">
              <button
                onClick={toggleForwarding}
                className={`w-full max-w-xs mx-auto py-2 rounded text-white ${
                  isForwarding ? 'bg-red-500 hover:bg-red-600' : 'bg-green-500 hover:bg-green-600'
                }`}
              >
                {isForwarding ? 'Stop Forwarding' : 'Start Forwarding'}
              </button>
            </div>

            <div>
              <h2 className="text-xl font-semibold mb-4 text-blue-600">Your Forwarding Rules</h2>
              {rules.length === 0 ? (
                <p className="text-gray-500 text-center">No rules created yet</p>
              ) : (
                <ul className="space-y-4">
                  {rules.map((rule, index) => (
                    <li key={index} className="border-b py-2">
                      <p className="text-sm">
                        <span className="font-medium">From:</span> {rule.sourceChat} →{' '}
                        <span className="font-medium">To:</span> {rule.targetChat} |{' '}
                        <span className="font-medium">Filter:</span> {rule.filterType} |{' '}
                        <span className="font-medium">Keyword:</span> {rule.keyword || 'None'} |{' '}
                        <span className="font-medium">Edit:</span>{' '}
                        {rule.editText ? `Replace "${rule.editText}" with "${rule.replaceText}"` : 'None'}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}

        {message && (
          <p className={`mt-4 text-center ${message.includes('success') ? 'text-green-600' : 'text-red-600'}`}>
            {message}
          </p>
        )}
      </div>
    </div>
  );
};

export default App;
