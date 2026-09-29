/**
 * Run locally ONLY: npx tsx scripts/generate-wallet.ts
 * Prints a new Ethereum address + private key to stdout.
 * Never commit the output. Paste the private key into:
 *   wrangler secret put AGENT_PRIVATE_KEY
 * Then approve this address as an agent on Hyperliquid from your main (Ledger) wallet.
 */
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';

const privateKey = generatePrivateKey();
const account = privateKeyToAccount(privateKey);

console.log('\n=== AGENT WALLET — KEEP PRIVATE ===');
console.log(`Address (share with HL to approve agent): ${account.address}`);
console.log(`Private key (paste into wrangler secret):  ${privateKey}`);
console.log('====================================\n');
console.log('Next steps:');
console.log('1. Go to Hyperliquid > Settings > API Wallets');
console.log('2. Approve address:', account.address);
console.log('3. Run: wrangler secret put AGENT_PRIVATE_KEY');
console.log('4. Set MAIN_ADDRESS in wrangler.toml to your main wallet address\n');
