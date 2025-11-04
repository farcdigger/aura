import { ethers } from "ethers";
import type { MintAuth } from "@/lib/types";
import { env } from "../env.mjs";

function getEIP712DomainValue() {
  return {
    name: "X Animal NFT",
    version: "1",
    chainId: Number(env.NEXT_PUBLIC_CHAIN_ID), // Ensure it's a number, not BigInt
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
  // CRITICAL FIX: To avoid "Cannot mix BigInt and other types" error,
  // ALL uint256 values MUST be BigInt type
  // ethers.js signTypedData internally converts strings/numbers to BigInt,
  // but mixing explicit BigInt with auto-converted values causes errors
  // Solution: Convert ALL uint256 values to BigInt explicitly
  
  // xUserId is a hex string (0x...) from ethers.id() - convert to BigInt
  let xUserIdBigInt: bigint;
  try {
    if (auth.xUserId.startsWith('0x')) {
      // Hex string - convert directly to BigInt
      // BigInt() constructor accepts hex strings (0x...)
      xUserIdBigInt = BigInt(auth.xUserId);
    } else {
      // Already a decimal string - convert to BigInt
      xUserIdBigInt = BigInt(auth.xUserId);
    }
  } catch (convertError: any) {
    throw new Error(`Failed to convert xUserId to BigInt: ${convertError.message}`);
  }
  
  // nonce and deadline are numbers - convert to BigInt explicitly
  // This ensures ALL uint256 values are BigInt type (no mixing!)
  const eip712Auth = {
    to: auth.to,
    payer: auth.payer,
    xUserId: xUserIdBigInt, // BigInt - converted from hex string
    tokenURI: auth.tokenURI,
    nonce: BigInt(auth.nonce), // BigInt - converted from number
    deadline: BigInt(auth.deadline), // BigInt - converted from number
  };
  
  console.log("EIP-712 Auth values (all BigInt for uint256):", {
    to: eip712Auth.to,
    payer: eip712Auth.payer,
    xUserId: eip712Auth.xUserId.toString(),
    xUserIdType: typeof eip712Auth.xUserId,
    xUserIdHex: `0x${eip712Auth.xUserId.toString(16)}`,
    nonce: eip712Auth.nonce.toString(),
    nonceType: typeof eip712Auth.nonce,
    deadline: eip712Auth.deadline.toString(),
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
  // Convert values for verification (same as signing)
  // ALL uint256 values must be BigInt to avoid type mixing
  
  let xUserIdBigInt: bigint;
  try {
    if (auth.xUserId.startsWith('0x')) {
      // Hex string - convert to BigInt
      xUserIdBigInt = BigInt(auth.xUserId);
    } else {
      // Decimal string - convert to BigInt
      xUserIdBigInt = BigInt(auth.xUserId);
    }
  } catch (convertError: any) {
    throw new Error(`Failed to convert xUserId to BigInt: ${convertError.message}`);
  }
  
  const eip712Auth = {
    to: auth.to,
    payer: auth.payer,
    xUserId: xUserIdBigInt, // BigInt - converted from hex string
    tokenURI: auth.tokenURI,
    nonce: BigInt(auth.nonce), // BigInt - converted from number
    deadline: BigInt(auth.deadline), // BigInt - converted from number
  };
  
  const recovered = ethers.verifyTypedData(
    EIP712_DOMAIN,
    { MintAuth: EIP712_TYPES.MintAuth },
    eip712Auth,
    signature
  );
  return recovered;
}

