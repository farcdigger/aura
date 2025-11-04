import { ethers } from "ethers";
import type { MintAuth } from "@/lib/types";
import { env } from "../env.mjs";

function getEIP712DomainValue() {
  return {
    name: "X Animal NFT",
    version: "1",
    chainId: parseInt(env.NEXT_PUBLIC_CHAIN_ID),
    verifyingContract: env.CONTRACT_ADDRESS,
  };
}

const EIP712_DOMAIN = getEIP712DomainValue();

const EIP712_TYPES = {
  MintAuth: [
    { name: "to", type: "address" },
    { name: "payer", type: "address" },
    { name: "xUserId", type: "uint256" },
    { name: "tokenURI", type: "string" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
};

export function getEIP712Domain() {
  return EIP712_DOMAIN;
}

export function getEIP712Types() {
  return EIP712_TYPES;
}

export async function signMintAuth(auth: MintAuth): Promise<string> {
  if (!env.SERVER_SIGNER_PRIVATE_KEY) {
    throw new Error("SERVER_SIGNER_PRIVATE_KEY not configured");
  }
  
  const signer = new ethers.Wallet(env.SERVER_SIGNER_PRIVATE_KEY);
  
  // Convert values to proper types for EIP-712 uint256
  // CRITICAL FIX: To avoid BigInt mixing, we must ensure ALL uint256 values are the SAME type
  // ethers.js signTypedData accepts string, number, or BigInt for uint256
  // Problem: Mixing these types causes "Cannot mix BigInt and other types" error
  // Solution: Use hex strings (0x...) for ALL uint256 values - ethers handles them consistently
  
  // xUserId is already a hex string (0x...) from ethers.id()
  // Convert nonce and deadline to hex strings as well to ensure type consistency
  let nonceHex: string;
  let deadlineHex: string;
  
  try {
    // Convert number to hex string for nonce
    // Use ethers.toBeHex() to ensure proper formatting
    nonceHex = ethers.toBeHex(auth.nonce);
    
    // Convert number to hex string for deadline
    deadlineHex = ethers.toBeHex(auth.deadline);
  } catch (convertError: any) {
    throw new Error(`Failed to convert nonce/deadline to hex: ${convertError.message}`);
  }
  
  // All uint256 values are now hex strings - this ensures type consistency
  const eip712Auth = {
    to: auth.to,
    payer: auth.payer,
    xUserId: auth.xUserId, // Hex string (0x...) - already correct
    tokenURI: auth.tokenURI,
    nonce: nonceHex, // Hex string (0x...) - converted from number
    deadline: deadlineHex, // Hex string (0x...) - converted from number
  };
  
  console.log("EIP-712 Auth values (all strings for uint256):", {
    to: eip712Auth.to,
    payer: eip712Auth.payer,
    xUserId: eip712Auth.xUserId,
    xUserIdType: typeof eip712Auth.xUserId,
    nonce: eip712Auth.nonce,
    nonceType: typeof eip712Auth.nonce,
    deadline: eip712Auth.deadline,
    deadlineType: typeof eip712Auth.deadline,
  });
  
  try {
    const signature = await signer.signTypedData(
      EIP712_DOMAIN,
      { MintAuth: EIP712_TYPES.MintAuth },
      eip712Auth
    );
    
    return signature;
  } catch (error: any) {
    console.error("EIP-712 signing error:", {
      error: error.message,
      errorStack: error.stack,
      auth: eip712Auth,
      originalAuth: auth,
      types: EIP712_TYPES.MintAuth,
    });
    throw new Error(`Failed to sign mint auth: ${error.message}`);
  }
}

export function verifyMintAuth(auth: MintAuth, signature: string): string {
  // Convert values to strings for verification (same as signing)
  let xUserIdValue: string;
  try {
    if (auth.xUserId.startsWith('0x')) {
      // Use ethers.toBigInt() for consistent conversion
      const bigIntValue = ethers.toBigInt(auth.xUserId);
      xUserIdValue = bigIntValue.toString();
    } else {
      xUserIdValue = auth.xUserId;
    }
  } catch (convertError: any) {
    throw new Error(`Failed to convert xUserId to uint256 string: ${convertError.message}`);
  }
  
  const eip712Auth = {
    to: auth.to,
    payer: auth.payer,
    xUserId: xUserIdValue,
    tokenURI: auth.tokenURI,
    nonce: String(auth.nonce),
    deadline: String(auth.deadline),
  };
  
  const recovered = ethers.verifyTypedData(
    EIP712_DOMAIN,
    { MintAuth: EIP712_TYPES.MintAuth },
    eip712Auth,
    signature
  );
  return recovered;
}

