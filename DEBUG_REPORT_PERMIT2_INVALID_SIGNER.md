# Debug Report: USD1 Gasless Payment - InvalidSigner Error

**Date:** 2025-12-15
**Error Code:** `0x815e1d64` = `InvalidSigner()`
**Token:** USD1 (0xE71Ad4C949dF74c229697b3A8414A0833ABd4165)
**Network:** BNB Testnet (Chain ID: 97)
**Scheme:** Permit2 (fallback - token lacks EIP-3009/EIP-2612)

---

## Executive Summary

Gasless payments with **USD1 via Permit2** fail with `InvalidSigner()` error from the Permit2 contract. The frontend signature is **verified locally as correct**, but the Permit2 contract rejects it, indicating a **mismatch between frontend signing and backend verification parameters**.

**Working flows:**
- ✅ Pay with gas (all ERC20) - works
- ✅ Gasless with EIP-3009 (WUSD, XUSD) - works
- ✅ Gasless with EIP-2612 - works

**Failing flow:**
- ❌ Gasless with Permit2 (USD1 and any non-permit tokens)

---

## Error Details

```
Error: execution reverted (unknown custom error)
Selector: 0x815e1d64 = InvalidSigner()
```

### What InvalidSigner() Means

The Permit2 contract recovers a different signer address from the signature than expected. This happens when:
1. The EIP-712 typed data hash differs between frontend signing and backend verification
2. The witness type string passed to `permitWitnessTransferFrom` doesn't match what was signed
3. Domain separator mismatch (verified OK in this case)

---

## Frontend Signing (VERIFIED CORRECT)

The frontend successfully signs and **locally verifies** the signature:

```
✅ SIGNATURE VALID - Frontend is signing correctly!
EIP-712 hash: 0x80fb21d6217906b017119f6cd2994df2aaacf2aaed63b4eb8051781827fc691b
Recovered signer: 0xA9ff06962668149CE4728a78ea93C8c7d0C88e0d
Expected signer: 0xA9ff06962668149CE4728a78ea93C8c7d0C88e0d
```

### Domain Used (Frontend)

```json
{
  "name": "Permit2",
  "chainId": 97,
  "verifyingContract": "0x31c2F6fcFf4F8759b3Bd5Bf0e1084A055615c768"
}
```

**Note:** No `version` field - uses canonical Uniswap Permit2 domain format.
Domain separator verified to match contract: `0xdf608d709b3023d3f468d32efc9849e8da0b58ec6c57ccf543c5b1fa6f44be66`

### Message Signed (Frontend)

```json
{
  "permitted": {
    "token": "0xE71Ad4C949dF74c229697b3A8414A0833ABd4165",
    "amount": "10000"
  },
  "spender": "0xA3d5EAaFCc1378058CE008Be1E9392D4E738083B",
  "nonce": "1765799866866",
  "deadline": 1765803465,
  "witness": {
    "schemeId": "0xc16f881b3dd0a1bf52965fa8de2adc6199cef183866d9a9b5b0ae9dc5897512f",
    "intentHash": "0x897b6a44a51d3cb1fde9269a8a595e314f2637888183d0d7bc252177845bd563",
    "payer": "0xA9ff06962668149CE4728a78ea93C8c7d0C88e0d",
    "salt": "0x000000000000000000000000000000000000000000000000cfdb3285554e934b"
  }
}
```

### Types Used (Frontend)

```json
{
  "PermitWitnessTransferFrom": [
    {"name": "permitted", "type": "TokenPermissions"},
    {"name": "spender", "type": "address"},
    {"name": "nonce", "type": "uint256"},
    {"name": "deadline", "type": "uint256"},
    {"name": "witness", "type": "FlexWitness"}
  ],
  "TokenPermissions": [
    {"name": "token", "type": "address"},
    {"name": "amount", "type": "uint256"}
  ],
  "FlexWitness": [
    {"name": "schemeId", "type": "bytes32"},
    {"name": "intentHash", "type": "bytes32"},
    {"name": "payer", "type": "address"},
    {"name": "salt", "type": "bytes32"}
  ]
}
```

### Signature Produced

```
0xb4e773d3132fc2651e9dedf4899e00da7ce4b8ca66b849237ca133adaa79a08528c67bf045ff5a23845c6ffbbd03836337d1e9458c7ef94aa4840ee096d9c4131b
```

---

## Backend/Relay Request

### Full Transaction Data Sent to Router

Function selector: `0xd581f286`

```
0xd581f286
199aed8259d2b6673255cf689e28bfd251500c41fb2c48e6c243af732e771cbd  // paymentId
000000000000000000000000a9ff06962668149ce4728a78ea93c8c7d0c88e0d  // merchant
000000000000000000000000e71ad4c949df74c229697b3a8414a0833abd4165  // token
0000000000000000000000000000000000000000000000000000000000002710  // amount (10000)
00000000000000000000000000000000000000000000000000000000694005c8  // deadline
000000000000000000000000a9ff06962668149ce4728a78ea93c8c7d0c88e0d  // payer
9d9b5130eea85eed2f238258c46c9b178f5397bf39aff17cd72c267aedc771b4  // resourceId
3548a45d32adec8141c140a20c40d2b2ff10f83e808f3c7e48fee9787441ed7d  // referenceHash
c16f881b3dd0a1bf52965fa8de2adc6199cef183866d9a9b5b0ae9dc5897512f  // schemeId (witness)
897b6a44a51d3cb1fde9269a8a595e314f2637888183d0d7bc252177845bd563  // intentHash (witness)
000000000000000000000000a9ff06962668149ce4728a78ea93c8c7d0c88e0d  // payer (witness)
000000000000000000000000000000000000000000000000cfdb3285554e934b  // salt (witness)
... more data including signatures and reference string
```

---

## Root Cause Analysis

### Most Likely Cause: Witness Type String Mismatch

When calling `permitWitnessTransferFrom`, the backend must pass a **witness type string** that exactly matches what the frontend used for signing.

**Required witness type string:**
```
FlexWitness witness)FlexWitness(bytes32 schemeId,bytes32 intentHash,address payer,bytes32 salt)TokenPermissions(address token,uint256 amount)
```

**Full EIP-712 type string (for reference):**
```
PermitWitnessTransferFrom(TokenPermissions permitted,address spender,uint256 nonce,uint256 deadline,FlexWitness witness)FlexWitness(bytes32 schemeId,bytes32 intentHash,address payer,bytes32 salt)TokenPermissions(address token,uint256 amount)
```

### Checklist for Backend Team

1. **Witness Type String**: Verify the exact string passed to `permitWitnessTransferFrom` matches above
   - Order of fields in `FlexWitness` must be: schemeId, intentHash, payer, salt
   - No spaces, exact casing

2. **Amount Consistency**: Ensure the amount in the Permit2 call matches `10000` (wei)
   - Check if backend is re-calculating or using a different precision

3. **Nonce**: Verify nonce is passed as `1765799866866` (string/uint256)

4. **Deadline**: Verify deadline is `1765803465`

5. **Witness Hash Computation**: The backend must compute the witness hash identically:
   ```solidity
   keccak256(abi.encode(
     keccak256("FlexWitness(bytes32 schemeId,bytes32 intentHash,address payer,bytes32 salt)"),
     witness.schemeId,
     witness.intentHash,
     witness.payer,
     witness.salt
   ))
   ```

6. **Permit2 Contract Version**: Confirm using correct Permit2 at `0x31c2F6fcFf4F8759b3Bd5Bf0e1084A055615c768`

---

## Contract Addresses

| Contract | Address |
|----------|---------|
| USD1 Token | `0xE71Ad4C949dF74c229697b3A8414A0833ABd4165` |
| Permit2 | `0x31c2F6fcFf4F8759b3Bd5Bf0e1084A055615c768` |
| BNBPayRouter | `0xA3d5EAaFCc1378058CE008Be1E9392D4E738083B` |
| Relay Wallet | `0x3f7Cc645ff83A6AAdd61F45C070477aAE9258A7C` |

---

## Verification Script

Backend can use this to verify the signature locally:

```javascript
const ethers = require('ethers');

const domain = {
  name: 'Permit2',
  chainId: 97,
  verifyingContract: '0x31c2F6fcFf4F8759b3Bd5Bf0e1084A055615c768'
};

const types = {
  PermitWitnessTransferFrom: [
    { name: 'permitted', type: 'TokenPermissions' },
    { name: 'spender', type: 'address' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
    { name: 'witness', type: 'FlexWitness' }
  ],
  TokenPermissions: [
    { name: 'token', type: 'address' },
    { name: 'amount', type: 'uint256' }
  ],
  FlexWitness: [
    { name: 'schemeId', type: 'bytes32' },
    { name: 'intentHash', type: 'bytes32' },
    { name: 'payer', type: 'address' },
    { name: 'salt', type: 'bytes32' }
  ]
};

const message = {
  permitted: {
    token: '0xE71Ad4C949dF74c229697b3A8414A0833ABd4165',
    amount: '10000'
  },
  spender: '0xA3d5EAaFCc1378058CE008Be1E9392D4E738083B',
  nonce: '1765799866866',
  deadline: 1765803465,
  witness: {
    schemeId: '0xc16f881b3dd0a1bf52965fa8de2adc6199cef183866d9a9b5b0ae9dc5897512f',
    intentHash: '0x897b6a44a51d3cb1fde9269a8a595e314f2637888183d0d7bc252177845bd563',
    payer: '0xA9ff06962668149CE4728a78ea93C8c7d0C88e0d',
    salt: '0x000000000000000000000000000000000000000000000000cfdb3285554e934b'
  }
};

const signature = '0xb4e773d3132fc2651e9dedf4899e00da7ce4b8ca66b849237ca133adaa79a08528c67bf045ff5a23845c6ffbbd03836337d1e9458c7ef94aa4840ee096d9c4131b';

// Compute hash and recover
const hash = ethers.TypedDataEncoder.hash(domain, types, message);
const recovered = ethers.recoverAddress(hash, signature);

console.log('EIP-712 Hash:', hash);
console.log('Recovered:', recovered);
console.log('Expected:', '0xA9ff06962668149CE4728a78ea93C8c7d0C88e0d');
console.log('Match:', recovered.toLowerCase() === '0xA9ff06962668149CE4728a78ea93C8c7d0C88e0d'.toLowerCase());
```

---

## Recommended Fix

The backend `permitWitnessTransferFrom` call must use the **exact witness type string**:

```solidity
string memory witnessTypeString = "FlexWitness witness)FlexWitness(bytes32 schemeId,bytes32 intentHash,address payer,bytes32 salt)TokenPermissions(address token,uint256 amount)";

permit2.permitWitnessTransferFrom(
    permit,           // ISignatureTransfer.PermitTransferFrom
    transferDetails,  // ISignatureTransfer.SignatureTransferDetails
    owner,           // address (payer)
    witness,         // bytes32 (keccak256 of witness struct)
    witnessTypeString,
    signature
);
```

---

## Summary

| Aspect | Status |
|--------|--------|
| Frontend signing | ✅ Correct (verified locally) |
| Domain separator | ✅ Matches contract |
| Permit2 approval | ✅ Already approved |
| Backend verification | ❌ **Fails with InvalidSigner** |

**The issue is on the backend/relay side** - the witness type string or message reconstruction differs from what the frontend signed.
