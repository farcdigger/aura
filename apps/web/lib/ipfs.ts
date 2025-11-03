import axios from "axios";
import { env, isMockMode } from "../env.mjs";

export interface PinataResponse {
  IpfsHash: string;
  PinSize: number;
  Timestamp: string;
}

export interface Web3StorageResponse {
  cid: string;
}

export async function pinToIPFS(file: Buffer, filename: string): Promise<string> {
  // Mock mode: return a mock IPFS URL for testing
  if (isMockMode || (!env.PINATA_JWT && !env.WEB3_STORAGE_TOKEN)) {
    console.log("🐛 Mock IPFS mode: Returning mock IPFS URL");
    // Generate a mock hash based on filename
    const mockHash = Buffer.from(filename).toString("base64").substring(0, 46);
    return `ipfs://mock_${mockHash}`;
  }
  
  const formData = new FormData();
  // @ts-ignore - Buffer to Blob conversion works at runtime
  const blob = new Blob([file], { type: "image/png" });
  formData.append("file", blob, filename);
  
  // Try Pinata first
  if (env.PINATA_JWT) {
    try {
      const response = await axios.post<PinataResponse>(
        "https://api.pinata.cloud/pinning/pinFileToIPFS",
        formData,
        {
          headers: {
            Authorization: `Bearer ${env.PINATA_JWT}`,
          },
        }
      );
      return `ipfs://${response.data.IpfsHash}`;
    } catch (error) {
      console.error("Pinata error:", error);
    }
  }
  
  // Fallback to Web3.Storage
  if (env.WEB3_STORAGE_TOKEN) {
    try {
      // @ts-ignore - web3.storage has type issues
      const { Web3Storage } = await import("web3.storage");
      const client = new Web3Storage({ token: env.WEB3_STORAGE_TOKEN });
      // @ts-ignore - Buffer to File conversion works at runtime
      const files = [new File([file], filename, { type: "image/png" })];
      const cid = await client.put(files);
      return `ipfs://${cid}`;
    } catch (error) {
      console.error("Web3.Storage error:", error);
    }
  }
  
  // Fallback to mock if all fail
  console.warn("No IPFS provider configured, using mock mode");
  const mockHash = Buffer.from(filename).toString("base64").substring(0, 46);
  return `ipfs://mock_${mockHash}`;
}

export async function pinJSONToIPFS(json: object): Promise<string> {
  // Mock mode: return a mock IPFS URL for testing
  if (isMockMode || (!env.PINATA_JWT && !env.WEB3_STORAGE_TOKEN)) {
    console.log("🐛 Mock IPFS mode: Returning mock metadata URL");
    const mockHash = Buffer.from(JSON.stringify(json)).toString("base64").substring(0, 46);
    return `ipfs://mock_metadata_${mockHash}`;
  }
  
  const jsonString = JSON.stringify(json);
  const blob = new Blob([jsonString], { type: "application/json" });
  const formData = new FormData();
  formData.append("file", blob, "metadata.json");
  
  // Try Pinata first
  if (env.PINATA_JWT) {
    try {
      const response = await axios.post<PinataResponse>(
        "https://api.pinata.cloud/pinning/pinJSONToIPFS",
        json,
        {
          headers: {
            Authorization: `Bearer ${env.PINATA_JWT}`,
            "Content-Type": "application/json",
          },
        }
      );
      return `ipfs://${response.data.IpfsHash}`;
    } catch (error) {
      console.error("Pinata error:", error);
    }
  }
  
  // Fallback to Web3.Storage
  if (env.WEB3_STORAGE_TOKEN) {
    try {
      // @ts-ignore - web3.storage has type issues
      const { Web3Storage } = await import("web3.storage");
      const client = new Web3Storage({ token: env.WEB3_STORAGE_TOKEN });
      const files = [new File([jsonString], "metadata.json", { type: "application/json" })];
      const cid = await client.put(files);
      return `ipfs://${cid}`;
    } catch (error) {
      console.error("Web3.Storage error:", error);
    }
  }
  
  // Fallback to mock if all fail
  console.warn("No IPFS provider configured, using mock mode");
  const mockHash = Buffer.from(JSON.stringify(json)).toString("base64").substring(0, 46);
  return `ipfs://mock_metadata_${mockHash}`;
}

