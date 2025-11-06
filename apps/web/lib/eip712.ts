import { ethers } from "ethers";
import type { MintAuth } from "@/lib/types";
import { env } from "../env.mjs";

function getEIP712DomainValue() {
  // IMPORTANT: Domain name must match the contract's EIP712 domain name exactly
  // Contract uses: EIP712(name, "1") where name is the ERC721 token name
  // Check contract deployment or contract owner() to verify the name
  // Common names: "xFrora", "X Animal NFT", etc.
  // If signature verification fails, the domain name might be wrong!
  return {
    name: "xFrora", // ⚠️ MUST match contract's ERC721 name (set during deployment)
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
  const signerAddress = signer.address;
  
  console.log("🔐 Signing MintAuth with server wallet:");
  console.log(`   Signer address: ${signerAddress}`);
  console.log(`   Contract address: ${env.CONTRACT_ADDRESS}`);
  console.log(`   ⚠️ IMPORTANT: Signer address MUST be the contract owner!`);
  
  // Convert values to proper types for EIP-712 uint256
  // CRITICAL: All uint256 values MUST be BigInt to avoid "Cannot mix BigInt" error
  // ethers.js signTypedData has issues when mixing BigInt with numbers/strings
  // Solution: Convert ALL uint256 values to BigInt explicitly
  
  // xUserId is a hex string (0x...) from ethers.id() - convert to BigInt
  const xUserIdBigInt = BigInt(auth.xUserId);
  
  // nonce and deadline are numbers - convert to BigInt explicitly
  // This ensures ALL uint256 values are BigInt (no mixing!)
  const eip712Auth = {
    to: auth.to,
    payer: auth.payer,
    xUserId: xUserIdBigInt, // BigInt - converted from hex string (0x...)
    tokenURI: auth.tokenURI,
    nonce: BigInt(auth.nonce), // BigInt - converted from number
    deadline: BigInt(auth.deadline), // BigInt - converted from number
  };
  
  console.log("EIP-712 Auth values (ALL uint256 as BigInt):", {
    to: eip712Auth.to,
    payer: eip712Auth.payer,
    xUserId: eip712Auth.xUserId.toString(),
    xUserIdHex: `0x${eip712Auth.xUserId.toString(16)}`,
    xUserIdType: typeof eip712Auth.xUserId,
    originalHex: auth.xUserId,
    nonce: eip712Auth.nonce.toString(),
    nonceType: typeof eip712Auth.nonce,
    nonceOriginal: auth.nonce,
    deadline: eip712Auth.deadline.toString(),
    deadlineType: typeof eip712Auth.deadline,
    deadlineOriginal: auth.deadline,
  });
  
  try {
    // Ensure domain chainId is a number (not BigInt)
    const domain = {
      ...EIP712_DOMAIN,
      chainId: Number(EIP712_DOMAIN.chainId), // Explicitly convert to number
    };
    
    console.log("EIP-712 Domain:", {
      name: domain.name,
      version: domain.version,
      chainId: domain.chainId,
      chainIdType: typeof domain.chainId,
      verifyingContract: domain.verifyingContract,
    });
    
    const signature = await signer.signTypedData(
      domain,
      { MintAuth: EIP712_TYPES.MintAuth },
      eip712Auth
    );
    
    return signature;
  } catch (error: any) {
    console.error("EIP-712 signing error:", {
      error: error.message,
      errorStack: error.stack,
      domain: EIP712_DOMAIN,
      auth: eip712Auth,
      originalAuth: auth,
      types: EIP712_TYPES.MintAuth,
      // Log all values as strings for debugging
      debugValues: {
        xUserId: eip712Auth.xUserId.toString(),
        nonce: eip712Auth.nonce.toString(),
        deadline: eip712Auth.deadline.toString(),
      },
    });
    throw new Error(`Failed to sign mint auth: ${error.message}`);
  }
}

export function verifyMintAuth(auth: MintAuth, signature: string): string {
  // Convert values for verification (same as signing)
  // ALL uint256 values must be BigInt to avoid mixing errors
  
  const xUserIdBigInt = BigInt(auth.xUserId);
  
  const eip712Auth = {
    to: auth.to,
    payer: auth.payer,
    xUserId: xUserIdBigInt, // BigInt - converted from hex string (0x...)
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

